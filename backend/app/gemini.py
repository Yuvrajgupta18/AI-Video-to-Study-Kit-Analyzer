"""Shared Gemini plumbing for AI features built on a Whisper transcript.

Gemini never writes timestamps itself: prompts number each transcript segment,
Gemini cites those IDs, and `to_sources` converts them into time ranges using
the real segment start/end times. Invalid IDs are dropped.
"""

import logging
from datetime import datetime, timezone
from functools import lru_cache
from typing import TypeVar

import httpx
from fastapi import HTTPException
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field, ValidationError

from .config import get_gemini_api_key

logger = logging.getLogger(__name__)

MAX_SEGMENTS = 10_000
MAX_TRANSCRIPT_CHARS = 400_000  # roughly a 6+ hour lecture
MAX_SOURCES_PER_ITEM = 4
MAX_MERGE_GAP_SECONDS = 5.0  # cited segments further apart than this become separate ranges
REQUEST_TIMEOUT_MS = 150_000

SEGMENT_IDS_DESCRIPTION = "IDs (the numbers in square brackets) of the transcript segments that support this item."

ASR_RULE = (
    "The transcript comes from speech recognition and may contain misheard words. When the intended "
    'term is obvious from context, use the correct term (for example "grade in descent" -> "gradient descent").'
)

Schema = TypeVar("Schema", bound=BaseModel)


# ---------------------------------------------------------------------------
# Request models shared by every transcript-based endpoint
# ---------------------------------------------------------------------------

class Segment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str


class TranscriptRequest(BaseModel):
    title: str = Field(default="Untitled lecture", max_length=300)
    language: str | None = Field(default=None, max_length=20)
    segments: list[Segment] = Field(min_length=1, max_length=MAX_SEGMENTS)


class SourceRange(BaseModel):
    start: float
    end: float


def check_transcript_size(request: TranscriptRequest) -> None:
    if sum(len(segment.text) for segment in request.segments) > MAX_TRANSCRIPT_CHARS:
        raise HTTPException(413, "This transcript is too long to process in one request.")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(text: str) -> str:
    """Collapse whitespace (including newlines) into single spaces."""
    return " ".join(text.split())


# ---------------------------------------------------------------------------
# Transcript formatting and source mapping
# ---------------------------------------------------------------------------

def format_timestamp(seconds: float) -> str:
    total = int(seconds)
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def format_transcript(request: TranscriptRequest) -> str:
    """Header plus one `[id] m:ss text` line per segment, for use in prompts."""
    lines = "\n".join(
        f"[{index}] {format_timestamp(segment.start)} {segment.text.strip()}"
        for index, segment in enumerate(request.segments)
    )
    return f"""\
Lecture title: {request.title}
Detected language: {request.language or "unknown"}

Transcript (format: [segment ID] start time, then text):
{lines}"""


def valid_segment_ids(segment_ids: list[int], segments: list[Segment]) -> list[int]:
    return sorted({i for i in segment_ids if 0 <= i < len(segments)})


def to_sources(segment_ids: list[int], segments: list[Segment]) -> list[SourceRange]:
    """Turn cited segment IDs into merged time ranges taken from the real transcript."""
    ranges: list[list[int]] = []
    for i in valid_segment_ids(segment_ids, segments):
        if (
            ranges
            and i == ranges[-1][1] + 1
            and segments[i].start - segments[ranges[-1][1]].end <= MAX_MERGE_GAP_SECONDS
        ):
            ranges[-1][1] = i
        else:
            ranges.append([i, i])
    return [
        SourceRange(start=segments[first].start, end=segments[last].end)
        for first, last in ranges[:MAX_SOURCES_PER_ITEM]
    ]


# ---------------------------------------------------------------------------
# Client, errors, and structured generation with model fallback
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _client_for(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS))


def get_gemini_client() -> genai.Client:
    """FastAPI dependency. The key stays on the server and is never returned to clients."""
    api_key = get_gemini_api_key()
    if not api_key:
        raise HTTPException(
            503, "AI features aren't configured. Add GEMINI_API_KEY to backend/.env and restart the backend."
        )
    return _client_for(api_key)


def _api_error(exc: errors.APIError, model: str) -> HTTPException:
    message = exc.message or ""
    if exc.code in (401, 403) or "API key" in message:
        return HTTPException(502, "Gemini rejected the API key. Check GEMINI_API_KEY in backend/.env.")
    if exc.code == 404:
        return HTTPException(502, f"The Gemini model '{model}' isn't available. Set GEMINI_MODEL in backend/.env.")
    if exc.code == 429:
        if "per day" in message.lower() or "perday" in message.lower():
            return HTTPException(
                429,
                "Gemini's daily free-tier quota is used up for the configured models. It resets within 24 hours, "
                "or you can set GEMINI_MODEL in backend/.env to another model.",
            )
        return HTTPException(429, "Gemini's rate limit or quota was reached. Wait a minute and try again.")
    if exc.code == 504:
        return HTTPException(504, "Gemini took too long to respond. Please try again.")
    if exc.code >= 500:
        return HTTPException(502, "Gemini is temporarily unavailable. Please try again shortly.")
    return HTTPException(502, f"The Gemini request failed ({exc.code}). Please try again.")


def _parse(response, schema: type[Schema], label: str) -> Schema:
    if isinstance(response.parsed, schema):
        return response.parsed
    text = response.text
    if not text:
        feedback = getattr(response, "prompt_feedback", None)
        reason = getattr(feedback, "block_reason", None)
        detail = f" (blocked: {reason})" if reason else ""
        raise HTTPException(502, f"Gemini returned an empty response{detail}. Please try again.")
    try:
        return schema.model_validate_json(text)
    except ValidationError as exc:
        raise HTTPException(502, f"Gemini returned {label} in an unexpected format. Please try again.") from exc


def _is_transient(exc: Exception) -> bool:
    """Errors worth retrying on the fallback model: overload, timeouts, and rate limits
    (free-tier quotas are per model, so the fallback usually still has quota)."""
    if isinstance(exc, httpx.TimeoutException):
        return True
    return isinstance(exc, errors.APIError) and exc.code in (429, 500, 503, 504)


def generate_structured(
    client: genai.Client,
    models: list[str],
    *,
    system_instruction: str,
    prompt: str,
    schema: type[Schema],
    label: str,
) -> tuple[Schema, str]:
    """Ask Gemini for JSON matching `schema`, falling back to the next model on overload.

    Returns the validated result and the model that produced it. `label` names the
    content in error messages (e.g. "notes", "flashcards").
    """
    for attempt, model in enumerate(models):
        is_last = attempt == len(models) - 1
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=schema,
                ),
            )
        except (errors.APIError, httpx.TimeoutException) as exc:
            if _is_transient(exc) and not is_last:
                logger.warning("Gemini model %s failed (%s); trying %s", model, exc.__class__.__name__, models[attempt + 1])
                continue
            if isinstance(exc, httpx.TimeoutException):
                raise HTTPException(504, "Gemini took too long to respond. Please try again.") from exc
            logger.warning("Gemini API error %s %s: %s", exc.code, exc.status, exc.message)
            raise _api_error(exc, model) from exc
        except httpx.TransportError as exc:
            raise HTTPException(502, "Couldn't connect to Gemini. Check your internet connection.") from exc
        return _parse(response, schema, label), model
    raise HTTPException(502, "No Gemini model is configured.")
