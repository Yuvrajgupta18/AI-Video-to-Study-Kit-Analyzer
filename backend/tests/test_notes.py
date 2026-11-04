import httpx
from types import SimpleNamespace

import pytest
from google.genai import errors

from app.config import DEFAULT_GEMINI_FALLBACK_MODEL, DEFAULT_GEMINI_MODEL
from app.gemini import MAX_SOURCES_PER_ITEM, MAX_TRANSCRIPT_CHARS, Segment, TranscriptRequest, to_sources
from app.notes import GeminiNotes, build_prompt
from tests.conftest import FAKE_KEY

SEGMENTS = [
    {"start": 0.0, "end": 3.08, "text": "Welcome to today's lecture on machine learning."},
    {"start": 3.08, "end": 5.4, "text": "We will cover supervised learning where models"},
    {"start": 5.4, "end": 7.88, "text": "learn from labeled examples."},
    {"start": 7.88, "end": 10.14, "text": "Next, we will discuss grade in descent"},
    {"start": 10.14, "end": 13.44, "text": "an optimization method that minimizes a loss function."},
    {"start": 3725.0, "end": 3730.5, "text": "That's all for today."},
]
PAYLOAD = {"title": "ML Basics", "language": "en", "segments": SEGMENTS}

GEMINI_NOTES = {
    "summary": "An introduction to supervised learning and gradient descent.",
    "sections": [
        {
            "title": "Supervised learning",
            "summary": "Learning from labeled data.",
            "points": ["Models learn from labeled examples.", "   "],
            "segment_ids": [2, 1, 1],
        },
        {
            "title": "Gradient descent",
            "summary": "An optimization method.",
            "points": ["Minimizes a loss function."],
            "segment_ids": [4, 99, -1, 3, 5],
        },
    ],
    "concepts": [
        {"term": "Gradient descent", "definition": "Minimizes a loss function.", "segment_ids": [3, 4]},
        {"term": "  ", "definition": "Dropped because the term is blank.", "segment_ids": [0]},
    ],
    "takeaways": [{"text": "Labeled data drives supervised learning.", "segment_ids": []}],
}


def gemini_response(parsed=None, text=None):
    return SimpleNamespace(parsed=parsed, text=text, prompt_feedback=None)


def api_error(code, status, message):
    return errors.APIError(code, {"error": {"code": code, "status": status, "message": message}})


# --- prompt and timestamp mapping -------------------------------------------

def test_prompt_lists_segment_ids_and_real_timestamps():
    prompt = build_prompt(TranscriptRequest(**PAYLOAD))
    assert "Lecture title: ML Basics" in prompt
    assert "[0] 0:00 Welcome to today's lecture on machine learning." in prompt
    assert "[3] 0:07 Next, we will discuss grade in descent" in prompt
    assert "[5] 1:02:05 That's all for today." in prompt


def test_sources_merge_adjacent_segments_and_drop_invalid_ids():
    segments = [Segment(**s) for s in SEGMENTS]
    sources = to_sources([4, 99, -1, 3, 0, 4], segments)
    assert [(s.start, s.end) for s in sources] == [(0.0, 3.08), (7.88, 13.44)]


def test_sources_are_capped_per_item():
    segments = [Segment(start=i * 10, end=i * 10 + 5, text="x") for i in range(20)]
    assert len(to_sources(list(range(0, 20, 2)), segments)) == MAX_SOURCES_PER_ITEM


# --- /notes endpoint ---------------------------------------------------------

def test_generates_notes_with_timestamps_from_transcript(client, fake_gemini):
    models = fake_gemini(gemini_response(parsed=GeminiNotes(**GEMINI_NOTES)))

    response = client.post("/notes", json=PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == GEMINI_NOTES["summary"]
    assert body["model"] == DEFAULT_GEMINI_MODEL
    assert body["generated_at"]

    supervised, gradient = body["sections"]
    assert supervised["points"] == ["Models learn from labeled examples."]  # blank point removed
    assert supervised["sources"] == [{"start": 3.08, "end": 7.88}]  # IDs 1-2 merged
    assert gradient["sources"] == [{"start": 7.88, "end": 13.44}, {"start": 3725.0, "end": 3730.5}]

    assert [c["term"] for c in body["concepts"]] == ["Gradient descent"]  # blank term removed
    assert body["takeaways"] == [{"text": "Labeled data drives supervised learning.", "sources": []}]

    call = models.calls[0]
    assert call["model"] == DEFAULT_GEMINI_MODEL
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_schema is GeminiNotes
    assert "[4] 0:10 an optimization method" in call["contents"]


def test_parses_json_text_when_sdk_did_not_parse(client, fake_gemini):
    fake_gemini(gemini_response(text=GeminiNotes(**GEMINI_NOTES).model_dump_json()))
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == 200
    assert len(response.json()["sections"]) == 2


def test_uses_model_from_environment(client, fake_gemini, monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-custom")
    models = fake_gemini(gemini_response(parsed=GeminiNotes(**GEMINI_NOTES)))
    assert client.post("/notes", json=PAYLOAD).json()["model"] == "gemini-custom"
    assert models.calls[0]["model"] == "gemini-custom"


@pytest.mark.parametrize(
    "failure",
    [api_error(503, "UNAVAILABLE", "high demand"), api_error(504, "DEADLINE_EXCEEDED", "deadline"), httpx.ReadTimeout("slow")],
)
def test_falls_back_to_second_model_when_primary_is_overloaded(client, fake_gemini, failure):
    models = fake_gemini(failure, gemini_response(parsed=GeminiNotes(**GEMINI_NOTES)))
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == 200
    assert response.json()["model"] == DEFAULT_GEMINI_FALLBACK_MODEL
    assert [c["model"] for c in models.calls] == [DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FALLBACK_MODEL]


def test_falls_back_when_primary_model_is_rate_limited(client, fake_gemini):
    models = fake_gemini(api_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded"), gemini_response(parsed=GeminiNotes(**GEMINI_NOTES)))
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == 200
    assert response.json()["model"] == DEFAULT_GEMINI_FALLBACK_MODEL
    assert len(models.calls) == 2


def test_reports_rate_limit_when_both_models_are_exhausted(client, fake_gemini):
    fake_gemini(*[api_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded")] * 2)
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == 429
    assert "rate limit" in response.json()["detail"]


def test_explains_daily_quota_exhaustion(client, fake_gemini):
    daily = "Quota exceeded for metric: generate_content_free_tier_requests, limit: 20. Requests per day limit exceeded."
    fake_gemini(*[api_error(429, "RESOURCE_EXHAUSTED", daily)] * 2)
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == 429
    assert "daily free-tier quota" in response.json()["detail"]


def test_does_not_fall_back_on_client_errors(client, fake_gemini):
    models = fake_gemini(api_error(400, "INVALID_ARGUMENT", "Bad request"))
    assert client.post("/notes", json=PAYLOAD).status_code == 502
    assert len(models.calls) == 1


def test_requires_api_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY")
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_invalid_key_error_does_not_leak_the_key(client, fake_gemini):
    fake_gemini(api_error(400, "INVALID_ARGUMENT", f"API key not valid: {FAKE_KEY}"))
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == 502
    assert "rejected the API key" in response.json()["detail"]
    assert FAKE_KEY not in response.text


@pytest.mark.parametrize(
    ("outcomes", "status", "message"),
    [
        ([api_error(503, "UNAVAILABLE", "x")] * 2, 502, "temporarily unavailable"),
        ([api_error(504, "DEADLINE_EXCEEDED", "x")] * 2, 504, "took too long"),
        ([httpx.ReadTimeout("slow")] * 2, 504, "took too long"),
        ([api_error(404, "NOT_FOUND", "no such model")], 502, "isn't available"),
        ([httpx.ConnectError("offline")], 502, "Couldn't connect"),
        ([gemini_response(text="not json")], 502, "unexpected format"),
        ([gemini_response(text=None)], 502, "empty response"),
    ],
)
def test_maps_gemini_failures_to_clear_errors(client, fake_gemini, outcomes, status, message):
    fake_gemini(*outcomes)
    response = client.post("/notes", json=PAYLOAD)
    assert response.status_code == status
    assert message in response.json()["detail"]


def test_rejects_empty_transcript(client, fake_gemini):
    models = fake_gemini()
    response = client.post("/notes", json={**PAYLOAD, "segments": []})
    assert response.status_code == 422
    assert models.calls == []


def test_rejects_transcript_that_is_too_long(client, fake_gemini):
    models = fake_gemini()
    huge = [{"start": 0, "end": 1, "text": "x" * (MAX_TRANSCRIPT_CHARS + 1)}]
    response = client.post("/notes", json={**PAYLOAD, "segments": huge})
    assert response.status_code == 413
    assert models.calls == []
