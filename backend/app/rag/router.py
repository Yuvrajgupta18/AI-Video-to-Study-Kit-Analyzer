"""HTTP endpoints for indexing a lecture and asking grounded questions about it."""

import logging
import re
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Path, Request
from fastapi.responses import JSONResponse
from google import genai
from pydantic import BaseModel, Field, field_validator

from ..config import get_gemini_models
from ..gemini import ASR_RULE, TranscriptRequest, check_transcript_size, format_timestamp, generate_structured, get_gemini_client
from .chunking import CHUNKER_VERSION, chunk_segments, transcript_hash
from .embeddings import Embedder, EmbeddingError, get_embedder
from .store import IndexInfo, LectureVectorStore, RetrievedChunk, VectorStoreError, get_vector_store, lecture_lock

logger = logging.getLogger(__name__)

TOP_K = 5
# Cosine similarity below this means "not about this lecture" (calibrated on all-MiniLM-L6-v2:
# unrelated questions score ~0.1, briefly covered topics ~0.24, well covered ~0.5).
MIN_SIMILARITY = 0.2
MAX_HISTORY_MESSAGES = 6
MAX_HISTORY_CHARS = 1500

NOT_COVERED = (
    "I couldn't find anything about that in this lecture, so I can't answer it from the lecture content. "
    "Try rephrasing, or ask about a topic the lecture covers."
)
UNVERIFIED = (
    "I couldn't find a clear, sourced answer to that in this lecture, so I'd rather not guess. "
    "Try asking about a specific part of the lecture."
)

LectureId = Path(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$", description="The lecture's ID from the frontend.")

router = APIRouter(prefix="/lectures/{lecture_id}", tags=["Lecture assistant"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class IndexRequest(TranscriptRequest):
    force: bool = False


class IndexStatus(BaseModel):
    lecture_id: str
    indexed: bool
    up_to_date: bool
    transcript_hash: str | None = None
    chunk_count: int = 0
    embedding_model: str | None = None
    indexed_at: str | None = None


class IndexResponse(IndexStatus):
    reindexed: bool


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=10_000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)
    transcript_hash: str | None = Field(default=None, max_length=64)

    @field_validator("question")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Question must not be blank")
        return value.strip()


class Citation(BaseModel):
    id: int
    chunk_id: str
    start: float
    end: float
    segment_ids: list[int]
    excerpt: str


class AskResponse(BaseModel):
    answer: str
    answerable: bool
    citations: list[Citation]
    model: str | None
    retrieved: int


class GeminiAnswer(BaseModel):
    answerable: bool = Field(description="True only if the excerpts contain enough information to answer.")
    answer: str = Field(description="The answer, citing excerpts inline like [1]. If not answerable, say the lecture doesn't cover it.")
    citations: list[int] = Field(description="Numbers of the excerpts that support the answer.")


SYSTEM_INSTRUCTION = f"""\
You are a teaching assistant answering a student's questions about ONE lecture. Your only source of \
information is the numbered lecture excerpts provided with each question.

Rules:
- Answer only with information stated in the excerpts. Do not use outside knowledge, even if you know the answer.
- If the excerpts don't contain enough information, set answerable to false and say clearly that the lecture \
doesn't cover it. You may mention what related topic the lecture does cover. Never guess.
- If the lecture only partly answers the question, answer the covered part and say what it doesn't cover.
- Cite the supporting excerpt number in square brackets after each claim, e.g. [2], and list every cited number \
in citations. Only cite excerpts that actually support the claim.
- Use the conversation history only to understand what the student is referring to (for example "it" or \
"that example"). Earlier answers are not a source.
- {ASR_RULE}
- Be concise: usually 2-6 sentences, or a short list for steps. Reply in the student's language."""


# ---------------------------------------------------------------------------
# Indexing
# ---------------------------------------------------------------------------

def _is_current(info: IndexInfo | None, embedder: Embedder, expected_hash: str | None) -> bool:
    return bool(
        info
        and info.chunker_version == CHUNKER_VERSION
        and info.embedding_model == embedder.name
        and (expected_hash is None or info.transcript_hash == expected_hash)
    )


def _status(lecture_id: str, info: IndexInfo | None, embedder: Embedder, expected_hash: str | None) -> IndexStatus:
    if not info:
        return IndexStatus(lecture_id=lecture_id, indexed=False, up_to_date=False)
    return IndexStatus(
        lecture_id=lecture_id,
        indexed=True,
        up_to_date=_is_current(info, embedder, expected_hash),
        transcript_hash=info.transcript_hash,
        chunk_count=info.chunk_count,
        embedding_model=info.embedding_model,
        indexed_at=info.indexed_at,
    )


@router.get("/index", response_model=IndexStatus)
def index_status(
    lecture_id: str = LectureId,
    transcript_hash: str | None = None,
    store: LectureVectorStore = Depends(get_vector_store),
    embedder: Embedder = Depends(get_embedder),
) -> IndexStatus:
    """Whether the lecture is indexed, and whether that index matches `transcript_hash` and the current model."""
    return _status(lecture_id, store.status(lecture_id), embedder, transcript_hash)


@router.post("/index", response_model=IndexResponse)
def index_lecture(
    request: IndexRequest,
    lecture_id: str = LectureId,
    store: LectureVectorStore = Depends(get_vector_store),
    embedder: Embedder = Depends(get_embedder),
) -> IndexResponse:
    """Chunk, embed, and store the transcript. Skips work if the same transcript is already indexed."""
    check_transcript_size(request)
    if not any(segment.text.strip() for segment in request.segments):
        raise HTTPException(422, "This transcript has no text to index.")

    fingerprint = transcript_hash(request.segments)
    with lecture_lock(lecture_id):
        existing = store.status(lecture_id)
        if not request.force and _is_current(existing, embedder, fingerprint):
            return IndexResponse(**_status(lecture_id, existing, embedder, fingerprint).model_dump(), reindexed=False)

        chunks = chunk_segments(request.segments)
        embeddings = embedder.embed_documents([chunk.text for chunk in chunks])
        info = store.replace(lecture_id, request.title, fingerprint, embedder.name, chunks, embeddings)
    logger.info("Indexed lecture %s: %d chunks", lecture_id, info.chunk_count)
    return IndexResponse(**_status(lecture_id, info, embedder, fingerprint).model_dump(), reindexed=True)


@router.delete("/index")
def delete_index(lecture_id: str = LectureId, store: LectureVectorStore = Depends(get_vector_store)) -> dict:
    return {"lecture_id": lecture_id, "deleted_chunks": store.delete(lecture_id)}


# ---------------------------------------------------------------------------
# Retrieval and answering
# ---------------------------------------------------------------------------

def recent_history(history: list[ChatMessage]) -> list[ChatMessage]:
    return [
        ChatMessage(role=m.role, content=m.content[:MAX_HISTORY_CHARS])
        for m in history[-MAX_HISTORY_MESSAGES:]
        if m.content.strip()
    ]


def retrieve(
    store: LectureVectorStore, embedder: Embedder, lecture_id: str, question: str, history: list[ChatMessage]
) -> list[RetrievedChunk]:
    """Top chunks for the question. For follow-ups, also searches with the previous
    question for context ("what about its drawbacks?") and keeps each chunk's best score."""
    queries = [question]
    previous = next((m.content for m in reversed(history) if m.role == "user"), None)
    if previous:
        queries.append(f"{previous}\n{question}")

    best: dict[str, RetrievedChunk] = {}
    for text in queries:
        for chunk in store.query(lecture_id, embedder.embed_query(text), TOP_K):
            if chunk.chunk_id not in best or chunk.similarity > best[chunk.chunk_id].similarity:
                best[chunk.chunk_id] = chunk
    relevant = [c for c in best.values() if c.similarity >= MIN_SIMILARITY]
    relevant = sorted(relevant, key=lambda c: c.similarity, reverse=True)[:TOP_K]
    # Present excerpts in lecture order, which reads more naturally.
    return sorted(relevant, key=lambda c: c.start)


def build_prompt(title: str, question: str, history: list[ChatMessage], chunks: list[RetrievedChunk]) -> str:
    conversation = "\n".join(
        f"{'Student' if m.role == 'user' else 'Assistant'}: {m.content}" for m in history
    ) or "(none)"
    excerpts = "\n\n".join(
        f"[{n}] ({format_timestamp(c.start)}–{format_timestamp(c.end)}) {c.text}" for n, c in enumerate(chunks, start=1)
    )
    return f"""\
Lecture: {title}

Conversation so far (context only, not a source):
{conversation}

Lecture excerpts:
{excerpts}

Student's question: {question}"""


# Matches [2], [2, 3], [2;3], and ranges like [2-4] or [2–4].
CITATION_MARKER = re.compile(r"\[\s*(\d+(?:\s*(?:[,;]|[-–])\s*\d+)*)\s*\]")


def _marker_numbers(group: str) -> list[int]:
    numbers: list[int] = []
    for part in re.split(r"\s*[,;]\s*", group.strip()):
        bounds = [int(n) for n in re.split(r"\s*[-–]\s*", part) if n]
        if len(bounds) == 2 and 0 < bounds[1] - bounds[0] < 10:
            numbers.extend(range(bounds[0], bounds[1] + 1))
        else:
            numbers.extend(bounds)
    return numbers


def _tidy(text: str) -> str:
    """Fix spacing left behind after removing citation markers."""
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"[ \t]+([.,;:!?])", r"\1", text)
    return re.sub(r"(,\s*)+(?=[.;:!?]|$)", "", text).strip()


def ground_answer(result: GeminiAnswer, chunks: list[RetrievedChunk]) -> tuple[str, bool, list[Citation]]:
    """Validate citations against the retrieved excerpts and renumber them in reading order.

    Unknown citation numbers are removed. An answer that claims to be answerable but
    cites no real excerpt is treated as unverified rather than shown as fact.
    """
    valid = set(range(1, len(chunks) + 1))
    answer = result.answer.strip()

    if not result.answerable:
        return _tidy(CITATION_MARKER.sub("", answer)) or NOT_COVERED, False, []

    order: list[int] = []
    inline = [n for group in CITATION_MARKER.findall(answer) for n in _marker_numbers(group)]
    for number in inline + result.citations:
        if number in valid and number not in order:
            order.append(number)
    if not order:
        return UNVERIFIED, False, []

    renumber = {old: new for new, old in enumerate(order, start=1)}
    def rewrite(match: re.Match) -> str:
        # Grouped markers become individual ones: "[2, 3]" -> "[1][2]". Unknown numbers are dropped.
        kept = dict.fromkeys(renumber[n] for n in _marker_numbers(match.group(1)) if n in renumber)
        return "".join(f"[{n}]" for n in kept)

    text = CITATION_MARKER.sub(rewrite, answer)
    text = _tidy(text)
    citations = [
        Citation(
            id=renumber[old],
            chunk_id=chunks[old - 1].chunk_id,
            start=chunks[old - 1].start,
            end=chunks[old - 1].end,
            segment_ids=chunks[old - 1].segment_ids,
            excerpt=chunks[old - 1].text[:300],
        )
        for old in order
    ]
    return text, True, citations


@router.post("/ask", response_model=AskResponse)
def ask(
    request: AskRequest,
    lecture_id: str = LectureId,
    store: LectureVectorStore = Depends(get_vector_store),
    embedder: Embedder = Depends(get_embedder),
    client: genai.Client = Depends(get_gemini_client),
) -> AskResponse:
    info = store.status(lecture_id)
    if not info:
        raise HTTPException(409, "This lecture hasn't been indexed yet. Index it before asking questions.")
    if not _is_current(info, embedder, request.transcript_hash):
        raise HTTPException(409, "This lecture's index is out of date. Re-index it before asking questions.")

    history = recent_history(request.history)
    chunks = retrieve(store, embedder, lecture_id, request.question, history)
    if not chunks:
        # Nothing in the lecture is close to the question: don't ask Gemini to improvise.
        return AskResponse(answer=NOT_COVERED, answerable=False, citations=[], model=None, retrieved=0)

    result, model = generate_structured(
        client,
        get_gemini_models(),
        system_instruction=SYSTEM_INSTRUCTION,
        prompt=build_prompt(info.title, request.question, history, chunks),
        schema=GeminiAnswer,
        label="an answer",
    )
    answer, answerable, citations = ground_answer(result, chunks)
    return AskResponse(answer=answer, answerable=answerable, citations=citations, model=model, retrieved=len(chunks))


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(EmbeddingError)
    async def embedding_error(_: Request, exc: EmbeddingError) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": f"{exc} Check the backend terminal. The first run needs internet access to download the model."
            },
        )

    @app.exception_handler(VectorStoreError)
    async def vector_store_error(_: Request, exc: VectorStoreError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": f"{exc} Check the backend terminal and the CHROMA_PATH folder."})
