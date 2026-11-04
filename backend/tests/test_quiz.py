import random
from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from app.config import DEFAULT_GEMINI_FALLBACK_MODEL, DEFAULT_GEMINI_MODEL
from app.gemini import MAX_TRANSCRIPT_CHARS, Segment
from app.main import app
from app.quiz import (
    EXTRA_QUESTIONS,
    GeminiQuestion,
    GeminiQuiz,
    QuizRequest,
    build_prompt,
    get_rng,
    shuffle_options,
    validate_question,
)
from tests.conftest import FAKE_KEY
from tests.test_notes import PAYLOAD, SEGMENTS


class NoShuffle(random.Random):
    """Keeps options in Gemini's order so tests can assert on positions."""

    def shuffle(self, x):
        pass


@pytest.fixture(autouse=True)
def no_shuffle():
    app.dependency_overrides[get_rng] = NoShuffle
    yield
    app.dependency_overrides.pop(get_rng, None)


def question(text, options=("Labeled data", "Unlabeled data", "Random noise", "Rewards"), correct=0, **extra):
    return {
        "question": text,
        "options": list(options),
        "correct_option": correct,
        "explanation": extra.get("explanation", "The lecture says models learn from labeled examples."),
        "difficulty": extra.get("difficulty", "easy"),
        "topic": extra.get("topic", "Supervised learning"),
        "segment_ids": extra.get("segment_ids", [1, 2]),
    }


def gemini_quiz(*questions):
    return SimpleNamespace(parsed=GeminiQuiz(questions=list(questions)), text=None, prompt_feedback=None)


def api_error(code, status, message):
    return errors.APIError(code, {"error": {"code": code, "status": status, "message": message}})


def quiz_payload(n=5):
    return {**PAYLOAD, "num_questions": n}


SEGS = [Segment(**s) for s in SEGMENTS]


# --- prompt and validation ----------------------------------------------------

@pytest.mark.parametrize("n", [5, 10, 20])
def test_prompt_asks_for_extra_questions_and_numbers_segments(n):
    prompt = build_prompt(QuizRequest(**quiz_payload(n)))
    assert f"Create {n + EXTRA_QUESTIONS[n]} multiple-choice questions" in prompt
    assert "[3] 0:07 Next, we will discuss grade in descent" in prompt


@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({}, None),
        ({"options": ["A", "B", "C"]}, "does not have four options"),
        ({"options": ["A", "B", "C", "D", "E"]}, "does not have four options"),
        ({"options": ["Labeled data", "labeled data.", "C", "D"]}, "blank or duplicate options"),
        ({"options": ["A", " ", "C", "D"]}, "blank or duplicate options"),
        ({"options": ["A", "B", "C", "All of the above"]}, "ambiguous option"),
        ({"options": ["A", "B", "None of the above", "D"]}, "ambiguous option"),
        ({"options": ["A", "B", "Both A and B", "D"]}, "ambiguous option"),
        ({"options": ["A", "B", "a and b", "D"]}, "ambiguous option"),
        ({"correct_option": 4}, "correct option out of range"),
        ({"correct_option": -1}, "correct option out of range"),
        ({"segment_ids": [99, -2]}, "no valid transcript citation"),
        ({"segment_ids": []}, "no valid transcript citation"),
        ({"explanation": "  "}, "missing question or explanation"),
        ({"question": "   "}, "missing question or explanation"),
    ],
)
def test_validate_question(overrides, reason):
    data = question("What do supervised models learn from?")
    data.update(overrides)
    assert validate_question(GeminiQuestion(**data), SEGS) == reason


def test_shuffle_options_keeps_the_correct_answer():
    options = ["right", "wrong 1", "wrong 2", "wrong 3"]
    for seed in range(20):
        shuffled, index = shuffle_options(options, 0, random.Random(seed))
        assert sorted(shuffled) == sorted(options)
        assert shuffled[index] == "right"


def test_shuffle_spreads_correct_answers_across_positions():
    rng = random.Random(1)
    positions = {shuffle_options(["a", "b", "c", "d"], 0, rng)[1] for _ in range(40)}
    assert positions == {0, 1, 2, 3}


# --- /quiz endpoint ---------------------------------------------------------------

def test_generates_validated_quiz(client, fake_gemini):
    models = fake_gemini(
        gemini_quiz(
            question("  What do supervised\nmodels learn from? ", correct=0, segment_ids=[2, 1, 1]),
            question("What does gradient descent minimize?", ("A loss function", "The learning rate", "The dataset", "The labels"),
                     correct=0, difficulty="medium", topic=" Optimization ", segment_ids=[3, 4]),
        )
    )

    response = client.post("/quiz", json=quiz_payload(5))

    assert response.status_code == 200
    body = response.json()
    assert body["requested"] == 5
    assert body["model"] == DEFAULT_GEMINI_MODEL
    first, second = body["questions"]
    assert first == {
        "id": "q-1",
        "question": "What do supervised models learn from?",
        "options": ["Labeled data", "Unlabeled data", "Random noise", "Rewards"],
        "correct_index": 0,
        "explanation": "The lecture says models learn from labeled examples.",
        "difficulty": "easy",
        "topic": "Supervised learning",
        "segment_ids": [1, 2],
        "sources": [{"start": 3.08, "end": 7.88}],
    }
    assert second["id"] == "q-2"
    assert second["topic"] == "Optimization"
    assert second["sources"] == [{"start": 7.88, "end": 13.44}]

    config = models.calls[0]["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_schema is GeminiQuiz


def test_shuffles_options_on_the_server(client, fake_gemini):
    app.dependency_overrides[get_rng] = lambda: random.Random(3)
    fake_gemini(gemini_quiz(question("What do supervised models learn from?", correct=0)))
    q = client.post("/quiz", json=quiz_payload(5)).json()["questions"][0]
    assert q["options"][q["correct_index"]] == "Labeled data"
    assert q["options"] != ["Labeled data", "Unlabeled data", "Random noise", "Rewards"]


def test_drops_invalid_and_duplicate_questions(client, fake_gemini):
    fake_gemini(
        gemini_quiz(
            question("Valid one?"),
            question("Ungrounded?", segment_ids=[42]),
            question("Ambiguous?", options=("A", "B", "C", "All of the above")),
            question("Bad index?", correct=7),
            question("VALID one"),  # duplicate after normalizing case and punctuation
            question("Three options?", options=("A", "B", "C")),
            question("Valid two?", topic="  "),
        )
    )
    questions = client.post("/quiz", json=quiz_payload(5)).json()["questions"]
    assert [q["question"] for q in questions] == ["Valid one?", "Valid two?"]
    assert [q["id"] for q in questions] == ["q-1", "q-2"]
    assert questions[1]["topic"] == "General"


@pytest.mark.parametrize("n", [5, 10, 20])
def test_returns_the_requested_number_of_questions(client, fake_gemini, n):
    fake_gemini(gemini_quiz(*[question(f"Question number {i}?") for i in range(n + EXTRA_QUESTIONS[n])]))
    body = client.post("/quiz", json=quiz_payload(n)).json()
    assert len(body["questions"]) == n
    assert body["requested"] == n


def test_returns_fewer_questions_when_the_transcript_supports_fewer(client, fake_gemini):
    fake_gemini(gemini_quiz(question("Only one?")))
    body = client.post("/quiz", json=quiz_payload(10)).json()
    assert len(body["questions"]) == 1
    assert body["requested"] == 10


def test_fails_clearly_when_no_question_is_valid(client, fake_gemini):
    fake_gemini(gemini_quiz(question("Ungrounded?", segment_ids=[]), question("Bad?", options=("A", "A", "B", "C"))))
    response = client.post("/quiz", json=quiz_payload(5))
    assert response.status_code == 502
    assert "valid questions grounded in this transcript" in response.json()["detail"]


@pytest.mark.parametrize("n", [0, 3, 7, 15, 25, "ten"])
def test_rejects_unsupported_question_counts(client, fake_gemini, n):
    models = fake_gemini()
    assert client.post("/quiz", json=quiz_payload(n)).status_code == 422
    assert models.calls == []


def test_defaults_to_ten_questions(client, fake_gemini):
    models = fake_gemini(gemini_quiz(question("Q?")))
    assert client.post("/quiz", json=PAYLOAD).json()["requested"] == 10
    assert f"Create {10 + EXTRA_QUESTIONS[10]} multiple-choice" in models.calls[0]["contents"]


def test_rejects_malformed_gemini_output(client, fake_gemini):
    bad = '{"questions": [{"question": "Q?", "options": ["a","b","c","d"], "correct_option": 0, "explanation": "x", "difficulty": "impossible", "topic": "t", "segment_ids": [0]}]}'
    fake_gemini(SimpleNamespace(parsed=None, text=bad, prompt_feedback=None))
    response = client.post("/quiz", json=quiz_payload(5))
    assert response.status_code == 502
    assert response.json()["detail"] == "Gemini returned quiz questions in an unexpected format. Please try again."


def test_falls_back_to_second_model_when_primary_is_overloaded(client, fake_gemini):
    models = fake_gemini(httpx.ReadTimeout("slow"), gemini_quiz(question("Q?")))
    response = client.post("/quiz", json=quiz_payload(5))
    assert response.status_code == 200
    assert response.json()["model"] == DEFAULT_GEMINI_FALLBACK_MODEL
    assert [c["model"] for c in models.calls] == [DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FALLBACK_MODEL]


@pytest.mark.parametrize(
    ("outcomes", "status", "message"),
    [
        ([api_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded")] * 2, 429, "rate limit"),
        ([api_error(504, "DEADLINE_EXCEEDED", "x")] * 2, 504, "took too long"),
        ([api_error(503, "UNAVAILABLE", "x")] * 2, 502, "temporarily unavailable"),
        ([api_error(403, "PERMISSION_DENIED", f"bad key {FAKE_KEY}")], 502, "rejected the API key"),
        ([httpx.ConnectError("offline")], 502, "Couldn't connect"),
    ],
)
def test_maps_gemini_failures_to_clear_errors(client, fake_gemini, outcomes, status, message):
    fake_gemini(*outcomes)
    response = client.post("/quiz", json=quiz_payload(5))
    assert response.status_code == status
    assert message in response.json()["detail"]
    assert FAKE_KEY not in response.text


def test_requires_api_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY")
    response = client.post("/quiz", json=quiz_payload(5))
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


@pytest.mark.parametrize(
    ("payload", "status"),
    [
        ({**quiz_payload(), "segments": []}, 422),
        ({**quiz_payload(), "segments": [{"start": 0, "end": 1, "text": "x" * (MAX_TRANSCRIPT_CHARS + 1)}]}, 413),
    ],
)
def test_validates_transcript_before_calling_gemini(client, fake_gemini, payload, status):
    models = fake_gemini()
    assert client.post("/quiz", json=payload).status_code == status
    assert models.calls == []
