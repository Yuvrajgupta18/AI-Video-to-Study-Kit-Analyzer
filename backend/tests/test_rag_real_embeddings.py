"""Checks the real Sentence-Transformers model against the retrieval threshold.

Skipped by default because it loads PyTorch and the embedding model (downloaded on
first use). Run with:  RUN_EMBEDDING_TESTS=1 pytest tests/test_rag_real_embeddings.py
"""

import os

import chromadb
import pytest
from chromadb.config import Settings

from app.config import get_embedding_model_name
from app.gemini import Segment
from app.rag.chunking import chunk_segments
from app.rag.embeddings import SentenceTransformerEmbedder
from app.rag.router import MIN_SIMILARITY, retrieve
from app.rag.store import LectureVectorStore
from tests.rag_fakes import FRENCH_REVOLUTION, NEURAL_NETWORKS

pytestmark = pytest.mark.skipif(not os.getenv("RUN_EMBEDDING_TESTS"), reason="set RUN_EMBEDDING_TESTS=1 to run")


@pytest.fixture(scope="module")
def indexed(tmp_path_factory):
    embedder = SentenceTransformerEmbedder(get_embedding_model_name())
    client = chromadb.PersistentClient(path=str(tmp_path_factory.mktemp("chroma")), settings=Settings(anonymized_telemetry=False))
    store = LectureVectorStore(client)
    for lecture_id, raw in [("nn", NEURAL_NETWORKS), ("history", FRENCH_REVOLUTION)]:
        chunks = chunk_segments([Segment(**s) for s in raw])
        store.replace(lecture_id, lecture_id, "hash", embedder.name, chunks, embedder.embed_documents([c.text for c in chunks]))
    return store, embedder


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("Why do neural networks need activation functions?", "non-linearity"),
        ("What does dropout do?", "Dropout randomly switches off neurons"),
        ("How is the gradient of each weight computed?", "chain rule"),
    ],
)
def test_relevant_chunk_is_retrieved(indexed, question, expected):
    store, embedder = indexed
    # What matters for RAG is that the supporting chunk is among those passed to Gemini.
    chunks = retrieve(store, embedder, "nn", question, [])
    supporting = [c for c in chunks if expected in c.text]
    assert supporting and all(c.similarity >= MIN_SIMILARITY for c in supporting)


@pytest.mark.parametrize("question", ["Who won the 2022 FIFA World Cup?", "How do I bake sourdough bread?"])
def test_unrelated_questions_fall_below_the_threshold(indexed, question):
    store, embedder = indexed
    assert retrieve(store, embedder, "nn", question, []) == []


def test_real_retrieval_stays_inside_the_lecture(indexed):
    store, embedder = indexed
    chunks = store.query("nn", embedder.embed_query("When did crowds storm the Bastille in 1789?"), top_k=10)
    assert chunks and all(c.lecture_id == "nn" for c in chunks)
