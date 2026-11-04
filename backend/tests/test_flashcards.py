import httpx
from types import SimpleNamespace

import pytest
from google.genai import errors

from app.config import DEFAULT_GEMINI_FALLBACK_MODEL, DEFAULT_GEMINI_MODEL
from app.flashcards import MAX_CARDS, MIN_CARDS, GeminiFlashcards, build_prompt
from app.gemini import MAX_TRANSCRIPT_CHARS, TranscriptRequest
from tests.conftest import FAKE_KEY
from tests.test_notes import PAYLOAD


def card(question, answer="An answer.", difficulty="easy", topic="Basics", segment_ids=(0,)):
    return {
        "question": question,
        "answer": answer,
        "difficulty": difficulty,
        "topic": topic,
        "segment_ids": list(segment_ids),
    }


def gemini_cards(*cards):
    return SimpleNamespace(parsed=GeminiFlashcards(cards=list(cards)), text=None, prompt_feedback=None)


def api_error(code, status, message):
    return errors.APIError(code, {"error": {"code": code, "status": status, "message": message}})


def test_prompt_requests_10_to_20_cards_and_numbers_segments():
    prompt = build_prompt(TranscriptRequest(**PAYLOAD))
    assert f"between {MIN_CARDS} and {MAX_CARDS} flashcards" in prompt
    assert "[3] 0:07 Next, we will discuss grade in descent" in prompt
    assert "Lecture title: ML Basics" in prompt


def test_generates_grounded_flashcards(client, fake_gemini):
    models = fake_gemini(
        gemini_cards(
            card("What is supervised learning?", "Learning from labeled examples.", "easy", "Supervised learning", [2, 1]),
            card("  Why minimize a loss?\n", " Better predictions. ", "hard", " Optimization ", [4, 3, 3, 5]),
        )
    )

    response = client.post("/flashcards", json=PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == DEFAULT_GEMINI_MODEL
    assert body["generated_at"]
    first, second = body["cards"]
    assert first == {
        "id": "card-1",
        "question": "What is supervised learning?",
        "answer": "Learning from labeled examples.",
        "difficulty": "easy",
        "topic": "Supervised learning",
        "segment_ids": [1, 2],
        "sources": [{"start": 3.08, "end": 7.88}],
    }
    # Whitespace is cleaned; IDs are de-duplicated; sources come from real segment times
    # (segment 5 is an hour later, so it becomes its own range).
    assert second["id"] == "card-2"
    assert second["question"] == "Why minimize a loss?"
    assert second["answer"] == "Better predictions."
    assert second["topic"] == "Optimization"
    assert second["segment_ids"] == [3, 4, 5]
    assert second["sources"] == [{"start": 7.88, "end": 13.44}, {"start": 3725.0, "end": 3730.5}]

    config = models.calls[0]["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_schema is GeminiFlashcards


def test_drops_ungrounded_blank_and_duplicate_cards(client, fake_gemini):
    fake_gemini(
        gemini_cards(
            card("Grounded?", segment_ids=[0]),
            card("Invented fact?", segment_ids=[]),
            card("Cites a missing segment?", segment_ids=[42, -1]),
            card("   ", segment_ids=[1]),
            card("Blank answer?", answer="  ", segment_ids=[1]),
            card("grounded?  ", segment_ids=[2]),  # duplicate question, different case/spacing
            card("Also grounded?", topic="  ", segment_ids=[99, 2]),
        )
    )
    cards = client.post("/flashcards", json=PAYLOAD).json()["cards"]
    assert [c["question"] for c in cards] == ["Grounded?", "Also grounded?"]
    assert [c["id"] for c in cards] == ["card-1", "card-2"]
    assert cards[1]["segment_ids"] == [2]
    assert cards[1]["topic"] == "General"


def test_caps_cards_at_maximum(client, fake_gemini):
    fake_gemini(gemini_cards(*[card(f"Question {i}?") for i in range(MAX_CARDS + 5)]))
    cards = client.post("/flashcards", json=PAYLOAD).json()["cards"]
    assert len(cards) == MAX_CARDS
    assert cards[-1]["id"] == f"card-{MAX_CARDS}"


def test_fails_clearly_when_no_card_is_grounded(client, fake_gemini):
    fake_gemini(gemini_cards(card("Invented?", segment_ids=[]), card("Also invented?", segment_ids=[50])))
    response = client.post("/flashcards", json=PAYLOAD)
    assert response.status_code == 502
    assert "grounded in this transcript" in response.json()["detail"]


def test_rejects_unknown_difficulty_from_gemini(client, fake_gemini):
    bad = '{"cards": [{"question": "Q?", "answer": "A.", "difficulty": "extreme", "topic": "T", "segment_ids": [0]}]}'
    fake_gemini(SimpleNamespace(parsed=None, text=bad, prompt_feedback=None))
    response = client.post("/flashcards", json=PAYLOAD)
    assert response.status_code == 502
    assert response.json()["detail"] == "Gemini returned flashcards in an unexpected format. Please try again."


def test_parses_json_text_when_sdk_did_not_parse(client, fake_gemini):
    text = GeminiFlashcards(cards=[card("Q?", difficulty="medium")]).model_dump_json()
    fake_gemini(SimpleNamespace(parsed=None, text=text, prompt_feedback=None))
    cards = client.post("/flashcards", json=PAYLOAD).json()["cards"]
    assert cards[0]["difficulty"] == "medium"


def test_falls_back_to_second_model_when_primary_is_overloaded(client, fake_gemini):
    models = fake_gemini(api_error(503, "UNAVAILABLE", "high demand"), gemini_cards(card("Q?")))
    response = client.post("/flashcards", json=PAYLOAD)
    assert response.status_code == 200
    assert response.json()["model"] == DEFAULT_GEMINI_FALLBACK_MODEL
    assert [c["model"] for c in models.calls] == [DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FALLBACK_MODEL]


@pytest.mark.parametrize(
    ("outcomes", "status", "message"),
    [
        ([api_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded")] * 2, 429, "rate limit"),
        ([httpx.ReadTimeout("slow")] * 2, 504, "took too long"),
        ([api_error(503, "UNAVAILABLE", "x")] * 2, 502, "temporarily unavailable"),
        ([api_error(400, "INVALID_ARGUMENT", f"API key not valid: {FAKE_KEY}")], 502, "rejected the API key"),
        ([SimpleNamespace(parsed=None, text=None, prompt_feedback=None)], 502, "empty response"),
    ],
)
def test_maps_gemini_failures_to_clear_errors(client, fake_gemini, outcomes, status, message):
    fake_gemini(*outcomes)
    response = client.post("/flashcards", json=PAYLOAD)
    assert response.status_code == status
    assert message in response.json()["detail"]
    assert FAKE_KEY not in response.text


def test_requires_api_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY")
    response = client.post("/flashcards", json=PAYLOAD)
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


@pytest.mark.parametrize(
    ("payload", "status"),
    [
        ({**PAYLOAD, "segments": []}, 422),
        ({"title": "No segments"}, 422),
        ({**PAYLOAD, "segments": [{"start": -1, "end": 2, "text": "x"}]}, 422),
        ({**PAYLOAD, "segments": [{"start": 0, "end": 1, "text": "x" * (MAX_TRANSCRIPT_CHARS + 1)}]}, 413),
    ],
)
def test_validates_transcript_before_calling_gemini(client, fake_gemini, payload, status):
    models = fake_gemini()
    assert client.post("/flashcards", json=payload).status_code == status
    assert models.calls == []
