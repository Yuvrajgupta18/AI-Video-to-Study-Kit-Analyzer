import re
from types import SimpleNamespace

import chromadb
import httpx
import pytest
from chromadb.config import Settings
from google.genai import errors

from app.config import DEFAULT_GEMINI_MODEL
from app.gemini import Segment
from app.main import app
from app.rag import router as rag_router
from app.rag import store as rag_store
from app.rag.chunking import chunk_segments, transcript_hash
from app.rag.embeddings import EmbeddingError, get_embedder
from app.rag.router import (
    MAX_HISTORY_CHARS,
    MAX_HISTORY_MESSAGES,
    NOT_COVERED,
    UNVERIFIED,
    ChatMessage,
    GeminiAnswer,
    ground_answer,
    retrieve,
)
from app.rag.store import LectureVectorStore, RetrievedChunk, VectorStoreError, get_vector_store
from tests.conftest import FAKE_KEY
from tests.rag_fakes import FRENCH_REVOLUTION, NEURAL_NETWORKS, FakeEmbedder, transcript

A, B = "lecture-a", "lecture-b"


@pytest.fixture
def store(tmp_path):
    client = chromadb.PersistentClient(path=str(tmp_path / "chroma"), settings=Settings(anonymized_telemetry=False))
    return LectureVectorStore(client)


@pytest.fixture
def embedder():
    return FakeEmbedder()


@pytest.fixture(autouse=True)
def rag_dependencies(store, embedder, monkeypatch):
    # The similarity floor is model-specific: bag-of-words vectors score lower than the
    # real model for the same overlap, while unrelated text still scores ~0.
    monkeypatch.setattr(rag_router, "MIN_SIMILARITY", 0.1)
    app.dependency_overrides[get_vector_store] = lambda: store
    app.dependency_overrides[get_embedder] = lambda: embedder
    yield
    app.dependency_overrides.pop(get_vector_store, None)
    app.dependency_overrides.pop(get_embedder, None)


def index(client, lecture_id=A, segments=NEURAL_NETWORKS, **extra):
    return client.post(f"/lectures/{lecture_id}/index", json={**transcript(segments, title="Neural networks"), **extra})


def answer(text, citations, answerable=True):
    return SimpleNamespace(parsed=GeminiAnswer(answerable=answerable, answer=text, citations=citations), text=None, prompt_feedback=None)


def chunk(n, start):
    return RetrievedChunk(f"{A}::x::{n}", A, n, f"excerpt {n}", start, start + 10, [n], 0.5)


# --- Indexing and status -----------------------------------------------------------

def test_indexes_a_lecture_and_reports_status(client, store):
    assert client.get(f"/lectures/{A}/index").json() == {
        "lecture_id": A, "indexed": False, "up_to_date": False, "transcript_hash": None,
        "chunk_count": 0, "embedding_model": None, "indexed_at": None,
    }

    body = index(client).json()
    expected_chunks = len(chunk_segments([Segment(**s) for s in NEURAL_NETWORKS]))
    assert body["reindexed"] is True
    assert body["indexed"] is True and body["up_to_date"] is True
    assert body["chunk_count"] == expected_chunks
    assert body["embedding_model"] == "fake-embedder"
    assert body["transcript_hash"] == transcript_hash([Segment(**s) for s in NEURAL_NETWORKS])

    status = client.get(f"/lectures/{A}/index", params={"transcript_hash": body["transcript_hash"]}).json()
    assert status["indexed"] and status["up_to_date"] and status["chunk_count"] == expected_chunks
    stale = client.get(f"/lectures/{A}/index", params={"transcript_hash": "0" * 64}).json()
    assert stale["indexed"] is True and stale["up_to_date"] is False


def test_stores_chunk_metadata_with_timestamps_and_segment_ids(client, store):
    index(client)
    meta = store._collection.get(where={"lecture_id": A}, include=["metadatas"])["metadatas"]
    first = min(meta, key=lambda m: m["chunk_index"])
    assert first["lecture_id"] == A
    assert first["start"] == 0 and first["segment_ids"][0] == 0
    assert {"chunk_index", "end", "transcript_hash", "embedding_model", "chunker_version", "indexed_at", "title"} <= set(first)


def test_does_not_reindex_an_unchanged_transcript(client, embedder):
    assert index(client).json()["reindexed"] is True
    second = index(client).json()
    assert second["reindexed"] is False and second["up_to_date"] is True
    assert embedder.document_calls == 1


def test_reindexes_when_the_transcript_changes_and_removes_old_chunks(client, store):
    index(client)
    shorter = NEURAL_NETWORKS[:4]
    body = index(client, segments=shorter).json()
    assert body["reindexed"] is True
    assert body["chunk_count"] == len(store._collection.get(where={"lecture_id": A})["ids"])
    assert body["transcript_hash"] == transcript_hash([Segment(**s) for s in shorter])


def test_force_and_model_or_chunker_changes_trigger_reindexing(client, embedder, monkeypatch):
    index(client)
    assert index(client, force=True).json()["reindexed"] is True

    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(name="another-model")
    assert index(client).json()["reindexed"] is True

    monkeypatch.setattr(rag_router, "CHUNKER_VERSION", "999")
    monkeypatch.setattr(rag_store, "CHUNKER_VERSION", "999")
    assert index(client).json()["reindexed"] is True


@pytest.mark.parametrize(
    ("segments", "status"),
    [([], 422), ([{"start": 0, "end": 1, "text": "   "}], 422)],
)
def test_rejects_empty_transcripts(client, embedder, segments, status):
    response = index(client, segments=segments)
    assert response.status_code == status
    assert embedder.document_calls == 0


@pytest.mark.parametrize("lecture_id", ["bad id!", "-starts-with-dash", "x" * 101])
def test_rejects_invalid_lecture_ids(client, lecture_id):
    assert index(client, lecture_id=lecture_id).status_code == 422


def test_indexing_does_not_need_the_gemini_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY")
    assert index(client).status_code == 200


def test_delete_removes_only_that_lecture(client, store):
    index(client, A)
    index(client, B, FRENCH_REVOLUTION)
    deleted = client.delete(f"/lectures/{A}/index").json()
    assert deleted["lecture_id"] == A and deleted["deleted_chunks"] > 0
    assert store.status(A) is None
    assert store.status(B) is not None


# --- Lecture isolation ----------------------------------------------------------------

def test_retrieval_never_returns_another_lectures_chunks(client, store, embedder):
    index(client, A)
    index(client, B, FRENCH_REVOLUTION)

    # Lecture B's own words, asked of lecture A: nothing from B may come back.
    for question in ["When was the Bastille stormed?", "What happened to dropout rates in the army?"]:
        chunks = store.query(A, embedder.embed_query(question), top_k=20)
        assert chunks and all(c.lecture_id == A and c.chunk_id.startswith(f"{A}::") for c in chunks)

    assert all(c.lecture_id == B for c in store.query(B, embedder.embed_query("dropout neurons"), top_k=20))


def test_asking_lecture_a_about_lecture_b_content_is_not_answered(client, fake_gemini):
    index(client, A)
    index(client, B, FRENCH_REVOLUTION)
    models = fake_gemini()
    body = client.post(f"/lectures/{A}/ask", json={"question": "When was the Bastille stormed in Paris?"}).json()
    assert body == {"answer": NOT_COVERED, "answerable": False, "citations": [], "model": None, "retrieved": 0}
    assert models.calls == []


def test_prompt_only_contains_the_selected_lectures_excerpts(client, fake_gemini):
    index(client, A)
    index(client, B, FRENCH_REVOLUTION)
    models = fake_gemini(answer("Dropout switches off neurons during training [1].", [1]))
    client.post(f"/lectures/{A}/ask", json={"question": "What does dropout do to neurons?"})
    prompt = models.calls[0]["contents"]
    assert "Dropout randomly switches off neurons" in prompt
    assert "Bastille" not in prompt and "army" not in prompt


def test_unindexed_lecture_cannot_be_asked(client, fake_gemini):
    index(client, A)
    models = fake_gemini()
    response = client.post(f"/lectures/{B}/ask", json={"question": "What does dropout do?"})
    assert response.status_code == 409
    assert "hasn't been indexed" in response.json()["detail"]
    assert models.calls == []


# --- Asking ------------------------------------------------------------------------------

def test_answers_with_validated_citations_from_real_chunks(client, fake_gemini):
    index(client)
    chunks = chunk_segments([Segment(**s) for s in NEURAL_NETWORKS])
    models = fake_gemini(answer("Dropout randomly switches off neurons during training [1][9], which reduces overfitting [1].", [1, 9]))

    response = client.post(f"/lectures/{A}/ask", json={"question": "What does dropout do?"})

    assert response.status_code == 200
    body = response.json()
    assert body["answerable"] is True
    assert body["model"] == DEFAULT_GEMINI_MODEL
    assert body["answer"] == "Dropout randomly switches off neurons during training [1], which reduces overfitting [1]."
    [citation] = body["citations"]
    assert citation["id"] == 1
    real = next(c for c in chunks if f"::{c.index:05d}" in citation["chunk_id"])
    assert (citation["start"], citation["end"], citation["segment_ids"]) == (real.start, real.end, list(real.segment_ids))
    assert citation["excerpt"] == real.text[:300]
    assert "[1] (" in models.calls[0]["contents"]  # excerpts are numbered with timestamps


def test_says_so_when_retrieved_content_does_not_answer(client, fake_gemini):
    index(client)
    fake_gemini(answer("The lecture mentions neural networks [1] but doesn't explain how GPUs train them [2].", [1, 2], answerable=False))
    body = client.post(f"/lectures/{A}/ask", json={"question": "How do GPUs train neural networks?"}).json()
    assert body["answerable"] is False
    assert body["citations"] == []
    assert body["answer"] == "The lecture mentions neural networks but doesn't explain how GPUs train them."


def test_unrelated_question_is_declined_without_calling_gemini(client, fake_gemini):
    index(client)
    models = fake_gemini()
    body = client.post(f"/lectures/{A}/ask", json={"question": "Who won the football World Cup final?"}).json()
    assert body["answerable"] is False and body["answer"] == NOT_COVERED and body["retrieved"] == 0
    assert models.calls == []


def test_index_built_from_another_transcript_must_be_refreshed(client, fake_gemini):
    index(client)
    response = client.post(f"/lectures/{A}/ask", json={"question": "What is dropout?", "transcript_hash": "f" * 64})
    assert response.status_code == 409
    assert "out of date" in response.json()["detail"]


def test_follow_up_questions_use_recent_history_for_retrieval(client, fake_gemini, store, embedder):
    index(client)
    history = [ChatMessage(role="user", content="Tell me about dropout and overfitting"),
               ChatMessage(role="assistant", content="Dropout switches off neurons [1].")]
    # On its own the follow-up shares no words with the lecture...
    assert retrieve(store, embedder, A, "Why would someone want that?", []) == []
    # ...but with the previous question as context it finds the dropout chunk.
    found = retrieve(store, embedder, A, "Why would someone want that?", history)
    assert any("Dropout" in c.text for c in found)


def test_prompt_includes_only_limited_recent_history(client, fake_gemini):
    index(client)
    models = fake_gemini(answer("Dropout reduces overfitting [1].", [1]))
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"message number {i}"} for i in range(10)]
    history[-1] = {"role": "assistant", "content": "y" * (MAX_HISTORY_CHARS + 500)}
    client.post(f"/lectures/{A}/ask", json={"question": "What does dropout reduce?", "history": history})
    prompt = models.calls[0]["contents"]
    assert "message number 3" not in prompt
    assert f"message number {10 - MAX_HISTORY_MESSAGES}" in prompt
    assert "y" * MAX_HISTORY_CHARS in prompt and "y" * (MAX_HISTORY_CHARS + 1) not in prompt


@pytest.mark.parametrize("question", ["", "   ", "x" * 1001])
def test_rejects_blank_or_overlong_questions(client, question):
    index(client)
    assert client.post(f"/lectures/{A}/ask", json={"question": question}).status_code == 422


# --- Citation grounding (unit) --------------------------------------------------------

def test_ground_answer_renumbers_citations_in_reading_order():
    chunks = [chunk(1, 0), chunk(2, 30), chunk(3, 60)]
    text, answerable, citations = ground_answer(answer("First [3]. Then [1]. Again [3].", [1, 3]).parsed, chunks)
    assert answerable is True
    assert text == "First [1]. Then [2]. Again [1]."
    assert [(c.id, c.start) for c in citations] == [(1, 60), (2, 0)]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Training slows down [2, 3].", "Training slows down [1][2]."),
        ("Training slows down [2;3] and diverges [3].", "Training slows down [1][2] and diverges [2]."),
        ("Covered in [2-3].", "Covered in [1][2]."),
        ("Covered in [2–3] and [3, 9].", "Covered in [1][2] and [2]."),
        ("Mixed [ 3 ,2 ].", "Mixed [1][2]."),
    ],
)
def test_ground_answer_expands_grouped_citation_markers(text, expected):
    chunks = [chunk(1, 0), chunk(2, 30), chunk(3, 60)]
    rendered, answerable, citations = ground_answer(answer(text, []).parsed, chunks)
    assert answerable and rendered == expected
    # Every marker left in the text has a matching citation with the right chunk.
    assert {c.id for c in citations} == {int(n) for n in re.findall(r"\[(\d+)\]", rendered)}
    by_id = {c.id: c.start for c in citations}
    first_cited = int(re.search(r"\d+", re.search(r"\[[^\]]+\]", text).group()).group())
    assert by_id[1] == chunks[first_cited - 1].start


def test_ground_answer_rejects_answers_without_valid_citations():
    chunks = [chunk(1, 0)]
    for result in [answer("Confident claim with no source.", []), answer("Made-up source [7].", [7, 0, -1])]:
        assert ground_answer(result.parsed, chunks) == (UNVERIFIED, False, [])


def test_ground_answer_uses_listed_citations_even_without_inline_markers():
    text, answerable, citations = ground_answer(answer("Gradient descent reduces loss.", [2]).parsed, [chunk(1, 0), chunk(2, 30)])
    assert answerable and text == "Gradient descent reduces loss." and [c.start for c in citations] == [30]


# --- Errors ------------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("outcomes", "status", "message"),
    [
        ([errors.APIError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Quota"}})] * 2, 429, "rate limit"),
        ([httpx.ReadTimeout("slow")] * 2, 504, "took too long"),
        ([errors.APIError(403, {"error": {"code": 403, "message": f"bad key {FAKE_KEY}"}})], 502, "rejected the API key"),
    ],
)
def test_gemini_errors_are_reported_clearly(client, fake_gemini, outcomes, status, message):
    index(client)
    fake_gemini(*outcomes)
    response = client.post(f"/lectures/{A}/ask", json={"question": "What does dropout do?"})
    assert response.status_code == status
    assert message in response.json()["detail"]
    assert FAKE_KEY not in response.text


def test_asking_requires_the_gemini_key(client, monkeypatch):
    index(client)
    monkeypatch.delenv("GEMINI_API_KEY")
    response = client.post(f"/lectures/{A}/ask", json={"question": "What does dropout do?"})
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


class BrokenEmbedder(FakeEmbedder):
    def embed_documents(self, texts):
        raise EmbeddingError("Couldn't load the embedding model 'broken'.")

    embed_query = embed_documents


def test_embedding_failures_return_503(client):
    app.dependency_overrides[get_embedder] = lambda: BrokenEmbedder()
    response = index(client)
    assert response.status_code == 503
    assert "Couldn't load the embedding model" in response.json()["detail"]


def test_embedding_failure_while_asking_returns_503(client, embedder):
    index(client)
    app.dependency_overrides[get_embedder] = lambda: BrokenEmbedder(name=embedder.name)
    response = client.post(f"/lectures/{A}/ask", json={"question": "What does dropout do?"})
    assert response.status_code == 503


class BrokenStore:
    def status(self, lecture_id):
        raise VectorStoreError("Couldn't read the vector database.")

    query = replace = delete = status


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", f"/lectures/{A}/index", None),
        ("post", f"/lectures/{A}/index", transcript(NEURAL_NETWORKS)),
        ("post", f"/lectures/{A}/ask", {"question": "What is dropout?"}),
        ("delete", f"/lectures/{A}/index", None),
    ],
)
def test_vector_database_failures_return_503(client, method, path, body):
    app.dependency_overrides[get_vector_store] = lambda: BrokenStore()
    response = getattr(client, method)(path, **({"json": body} if body else {}))
    assert response.status_code == 503
    assert "vector database" in response.json()["detail"]
