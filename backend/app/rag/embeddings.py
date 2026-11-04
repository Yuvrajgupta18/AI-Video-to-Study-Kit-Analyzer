"""Sentence-Transformers embeddings, loaded lazily on first use."""

import logging
import threading
from functools import lru_cache
from typing import Protocol

from ..config import get_embedding_model_name

logger = logging.getLogger(__name__)


class EmbeddingError(Exception):
    """The embedding model could not be loaded or failed to encode text."""


class Embedder(Protocol):
    name: str

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class SentenceTransformerEmbedder:
    """Normalized embeddings, so cosine similarity == dot product."""

    def __init__(self, model_name: str):
        self.name = model_name
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._model is None:
                try:
                    # Imported here: torch is heavy and only needed once RAG is used.
                    from sentence_transformers import SentenceTransformer

                    self._model = SentenceTransformer(self.name)
                except Exception as exc:  # download, disk, or torch errors
                    logger.exception("Could not load embedding model %s", self.name)
                    raise EmbeddingError(f"Couldn't load the embedding model '{self.name}'.") from exc
        return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        model = self._load()
        try:
            return model.encode_document(texts, normalize_embeddings=True, convert_to_numpy=True).tolist()
        except Exception as exc:
            logger.exception("Embedding %d documents failed", len(texts))
            raise EmbeddingError("Embedding the transcript failed.") from exc

    def embed_query(self, text: str) -> list[float]:
        model = self._load()
        try:
            return model.encode_query([text], normalize_embeddings=True, convert_to_numpy=True)[0].tolist()
        except Exception as exc:
            logger.exception("Embedding a query failed")
            raise EmbeddingError("Embedding the question failed.") from exc


@lru_cache(maxsize=2)
def _embedder_for(model_name: str) -> SentenceTransformerEmbedder:
    return SentenceTransformerEmbedder(model_name)


def get_embedder() -> Embedder:
    """FastAPI dependency."""
    return _embedder_for(get_embedding_model_name())
