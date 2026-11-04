"""Gemini-generated flashcards grounded in a Whisper transcript.

Cards that don't cite at least one real transcript segment are discarded, so
every card shown to the student can be traced back to the lecture.
"""

from enum import Enum
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from google import genai
from pydantic import BaseModel, Field

from .config import get_gemini_models
from .gemini import (
    ASR_RULE,
    SEGMENT_IDS_DESCRIPTION,
    Segment,
    SourceRange,
    TranscriptRequest,
    check_transcript_size,
    clean,
    format_transcript,
    generate_structured,
    get_gemini_client,
    now_iso,
    to_sources,
    valid_segment_ids,
)

MIN_CARDS = 10
MAX_CARDS = 20

router = APIRouter()


# ---------------------------------------------------------------------------
# API response models
# ---------------------------------------------------------------------------

class Flashcard(BaseModel):
    id: str
    question: str
    answer: str
    difficulty: Literal["easy", "medium", "hard"]
    topic: str
    segment_ids: list[int] = Field(min_length=1)
    sources: list[SourceRange] = Field(min_length=1)


class FlashcardsResponse(BaseModel):
    cards: list[Flashcard] = Field(min_length=1, max_length=MAX_CARDS)
    model: str
    generated_at: str


# ---------------------------------------------------------------------------
# Structured output schema that Gemini fills in
# ---------------------------------------------------------------------------

class Difficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class GeminiFlashcard(BaseModel):
    question: str = Field(description="A self-contained question that tests one idea from the lecture.")
    answer: str = Field(description="The correct answer in 1-3 sentences, as explained in the lecture.")
    difficulty: Difficulty = Field(description="easy = recall a fact; medium = explain or relate; hard = apply or reason.")
    topic: str = Field(description="Short topic or category name (1-4 words), reused across related cards.")
    segment_ids: list[int] = Field(description=SEGMENT_IDS_DESCRIPTION)


class GeminiFlashcards(BaseModel):
    cards: list[GeminiFlashcard] = Field(description=f"Between {MIN_CARDS} and {MAX_CARDS} flashcards.")


SYSTEM_INSTRUCTION = f"""\
You are an expert teacher who writes flashcards for active-recall study from lecture transcripts.

Rules:
- Every question and answer must be supported by the transcript. Do not add outside facts, examples, or details.
- {ASR_RULE}
- Each card tests exactly one idea. Questions must make sense on their own, without seeing the transcript.
- Answers are concise (1-3 sentences) and fully correct according to the lecture.
- Difficulty: "easy" recalls a definition or fact; "medium" asks to explain, compare, or relate ideas; \
"hard" asks to apply a concept or reason through a consequence the lecture supports.
- Cite the IDs of the transcript segments that contain the answer. Use only IDs that appear in the transcript.
- Do not repeat the same question in different words.
- Write the cards in the same language as the transcript."""


def build_prompt(request: TranscriptRequest) -> str:
    return f"""\
Create between {MIN_CARDS} and {MAX_CARDS} flashcards that cover the lecture's most important ideas, \
in the order they are taught. Aim for a mix of roughly 30% easy, 40% medium, and 30% hard cards. \
Use more cards for longer, denser lectures. If the transcript is too short to support {MIN_CARDS} \
distinct, well-grounded cards, create fewer rather than repeating ideas or adding outside information.

{format_transcript(request)}"""


def to_response(result: GeminiFlashcards, segments: list[Segment], model: str) -> FlashcardsResponse:
    cards: list[Flashcard] = []
    seen_questions: set[str] = set()
    for card in result.cards:
        question, answer, topic = clean(card.question), card.answer.strip(), clean(card.topic)
        segment_ids = valid_segment_ids(card.segment_ids, segments)
        key = question.lower()
        # Drop blank, duplicate, and ungrounded cards (no valid transcript citation).
        if not question or not answer or not segment_ids or key in seen_questions:
            continue
        seen_questions.add(key)
        cards.append(
            Flashcard(
                id=f"card-{len(cards) + 1}",
                question=question,
                answer=answer,
                difficulty=card.difficulty.value,
                topic=topic or "General",
                segment_ids=segment_ids,
                sources=to_sources(segment_ids, segments),
            )
        )
        if len(cards) == MAX_CARDS:
            break

    if not cards:
        raise HTTPException(502, "Gemini didn't return any flashcards grounded in this transcript. Please try again.")
    return FlashcardsResponse(cards=cards, model=model, generated_at=now_iso())


@router.post("/flashcards", response_model=FlashcardsResponse)
def create_flashcards(
    request: TranscriptRequest, client: genai.Client = Depends(get_gemini_client)
) -> FlashcardsResponse:
    check_transcript_size(request)
    result, model = generate_structured(
        client,
        get_gemini_models(),
        system_instruction=SYSTEM_INSTRUCTION,
        prompt=build_prompt(request),
        schema=GeminiFlashcards,
        label="flashcards",
    )
    return to_response(result, request.segments, model)
