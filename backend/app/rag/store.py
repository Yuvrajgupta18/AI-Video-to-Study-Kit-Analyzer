"""ChromaDB storage for lecture chunks.

All chunks live in one collection; every read, write, and delete is filtered by
`lecture_id`, so a question about one lecture can never retrieve another
lecture's chunks. Query results are re-checked against the requested lecture as
a second line of defence.
"""

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache

import chromadb
from chromadb.config import Settings

from ..config import get_chroma_path
from .chunking import CHUNKER_VERSION, Chunk

logger = logging.getLogger(__name__)

COLLECTION_NAME = "lecture_chunks"


class VectorStoreError(Exception):
    """ChromaDB could not be opened, read, or written."""


@dataclass(frozen=True)
class IndexInfo:
    lecture_id: str
    title: str
    transcript_hash: str
    chunker_version: str
    embedding_model: str
    indexed_at: str
    chunk_count: int


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    lecture_id: str
    index: int
    text: str
    start: float
    end: float
    segment_ids: list[int]
    similarity: float


class LectureVectorStore:
    def __init__(self, client):
        try:
            self._collection = client.get_or_create_collection(
                COLLECTION_NAME,
                configuration={"hnsw": {"space": "cosine"}},
                embedding_function=None,  # embeddings come from our Sentence-Transformers model
            )
        except Exception as exc:
            raise VectorStoreError("Couldn't open the ChromaDB collection.") from exc

    def status(self, lecture_id: str) -> IndexInfo | None:
        try:
            result = self._collection.get(where={"lecture_id": lecture_id}, include=["metadatas"])
        except Exception as exc:
            logger.exception("ChromaDB status lookup failed")
            raise VectorStoreError("Couldn't read the vector database.") from exc
        if not result["ids"]:
            return None
        meta = result["metadatas"][0]
        return IndexInfo(
            lecture_id=lecture_id,
            title=meta.get("title") or "Lecture",
            transcript_hash=meta["transcript_hash"],
            chunker_version=meta["chunker_version"],
            embedding_model=meta["embedding_model"],
            indexed_at=meta["indexed_at"],
            chunk_count=len(result["ids"]),
        )

    def replace(
        self,
        lecture_id: str,
        title: str,
        transcript_hash: str,
        embedding_model: str,
        chunks: list[Chunk],
        embeddings: list[list[float]],
    ) -> IndexInfo:
        indexed_at = datetime.now(timezone.utc).isoformat()
        try:
            self._collection.delete(where={"lecture_id": lecture_id})
            self._collection.add(
                ids=[f"{lecture_id}::{transcript_hash[:12]}::{c.index:05d}" for c in chunks],
                embeddings=embeddings,
                documents=[c.text for c in chunks],
                metadatas=[
                    {
                        "lecture_id": lecture_id,
                        "title": title,
                        "chunk_index": c.index,
                        "start": c.start,
                        "end": c.end,
                        "segment_ids": list(c.segment_ids),
                        "word_count": c.word_count,
                        "transcript_hash": transcript_hash,
                        "chunker_version": CHUNKER_VERSION,
                        "embedding_model": embedding_model,
                        "indexed_at": indexed_at,
                    }
                    for c in chunks
                ],
            )
        except Exception as exc:
            logger.exception("ChromaDB write failed")
            raise VectorStoreError("Couldn't save the lecture index to the vector database.") from exc
        return IndexInfo(lecture_id, title, transcript_hash, CHUNKER_VERSION, embedding_model, indexed_at, len(chunks))

    def delete(self, lecture_id: str) -> int:
        try:
            ids = self._collection.get(where={"lecture_id": lecture_id}, include=[])["ids"]
            if ids:
                self._collection.delete(ids=ids)
            return len(ids)
        except Exception as exc:
            logger.exception("ChromaDB delete failed")
            raise VectorStoreError("Couldn't delete the lecture index.") from exc

    def query(self, lecture_id: str, embedding: list[float], top_k: int) -> list[RetrievedChunk]:
        try:
            result = self._collection.query(
                query_embeddings=[embedding],
                n_results=top_k,
                where={"lecture_id": lecture_id},
                include=["documents", "metadatas", "distances"],
            )
        except Exception as exc:
            logger.exception("ChromaDB query failed")
            raise VectorStoreError("Couldn't search the vector database.") from exc

        chunks = []
        for chunk_id, text, meta, distance in zip(
            result["ids"][0], result["documents"][0], result["metadatas"][0], result["distances"][0]
        ):
            if meta.get("lecture_id") != lecture_id:  # should be impossible with the where filter
                logger.error("Dropped chunk %s from another lecture", chunk_id)
                continue
            chunks.append(
                RetrievedChunk(
                    chunk_id=chunk_id,
                    lecture_id=lecture_id,
                    index=int(meta["chunk_index"]),
                    text=text,
                    start=float(meta["start"]),
                    end=float(meta["end"]),
                    segment_ids=[int(i) for i in meta["segment_ids"]],
                    similarity=1.0 - float(distance),  # cosine distance -> similarity
                )
            )
        return chunks


@lru_cache(maxsize=1)
def _store_at(path: str) -> LectureVectorStore:
    try:
        client = chromadb.PersistentClient(path=path, settings=Settings(anonymized_telemetry=False))
    except Exception as exc:
        logger.exception("Could not open ChromaDB at %s", path)
        raise VectorStoreError("Couldn't open the vector database.") from exc
    return LectureVectorStore(client)


def get_vector_store() -> LectureVectorStore:
    """FastAPI dependency."""
    return _store_at(str(get_chroma_path()))


# Serialises indexing per lecture so two requests don't interleave delete/add.
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def lecture_lock(lecture_id: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(lecture_id, threading.Lock())
