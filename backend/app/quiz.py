"""Gemini-generated multiple-choice quizzes grounded in a Whisper transcript.

Every question is validated before it reaches the student: exactly four distinct
options, one correct answer, no "all/none of the above" style options, at least
one real transcript citation, and no duplicate questions. Options are shuffled
on the server because language models tend to put the correct answer first.
"""

import random
import re
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

QUESTION_COUNTS = (5, 10, 20)
OPTIONS_PER_QUESTION = 4
# Ask for a few extra questions so we can still return the requested count after
# discarding invalid ones.
EXTRA_QUESTIONS = {5: 2, 10: 3, 20: 4}

# Options that make a multiple-choice question ambiguous or guessable.
AMBIGUOUS_OPTION = re.compile(
    r"\b(all|none|any|both) of the (above|options|answers)\b|^(both|neither)\b|^[a-d] and [a-d]$",
    re.IGNORECASE,
)

router = APIRouter()


class QuizRequest(TranscriptRequest):
    num_questions: Literal[5, 10, 20] = 10


# ---------------------------------------------------------------------------
# API response models
# ---------------------------------------------------------------------------

class QuizQuestion(BaseModel):
    id: str
    question: str
    options: list[str] = Field(min_length=OPTIONS_PER_QUESTION, max_length=OPTIONS_PER_QUESTION)
    correct_index: int = Field(ge=0, lt=OPTIONS_PER_QUESTION)
    explanation: str
    difficulty: Literal["easy", "medium", "hard"]
    topic: str
    segment_ids: list[int] = Field(min_length=1)
    sources: list[SourceRange] = Field(min_length=1)


class QuizResponse(BaseModel):
    questions: list[QuizQuestion] = Field(min_length=1, max_length=max(QUESTION_COUNTS))
    requested: int
    model: str
    generated_at: str


# ---------------------------------------------------------------------------
# Structured output schema that Gemini fills in
# ---------------------------------------------------------------------------

class Difficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class GeminiQuestion(BaseModel):
    question: str = Field(description="A clear, self-contained question with exactly one correct answer.")
    options: list[str] = Field(description="Exactly four distinct answer options.")
    correct_option: int = Field(description="Index (0-3) of the correct option in `options`.")
    explanation: str = Field(description="1-2 sentences explaining why the correct option is right, based on the lecture.")
    difficulty: Difficulty = Field(description="easy = recall a fact; medium = understand or relate; hard = apply or reason.")
    topic: str = Field(description="Short topic or category name (1-4 words), reused across related questions.")
    segment_ids: list[int] = Field(description=SEGMENT_IDS_DESCRIPTION)


class GeminiQuiz(BaseModel):
    questions: list[GeminiQuestion]


SYSTEM_INSTRUCTION = f"""\
You are an experienced examiner who writes fair multiple-choice questions from lecture transcripts.

Rules:
- Every question, correct answer, and explanation must be supported by the transcript. Do not test outside knowledge.
- {ASR_RULE}
- Each question has exactly four options and exactly one correct option. The other three are plausible \
but clearly wrong according to the lecture.
- Never use "all of the above", "none of the above", "both A and B", or similar options.
- Options should be similar in length and style so the answer can't be guessed from its form.
- Questions must be unambiguous and make sense on their own. Do not ask the same thing twice.
- Difficulty: "easy" recalls a definition or fact; "medium" checks understanding or relationships; \
"hard" requires applying a concept or reasoning about a consequence the lecture supports.
- Cite the IDs of the transcript segments that support the correct answer. Use only IDs that appear in the transcript.
- Write in the same language as the transcript."""


def build_prompt(request: QuizRequest) -> str:
    count = request.num_questions + EXTRA_QUESTIONS[request.num_questions]
    return f"""\
Create {count} multiple-choice questions that cover the lecture's most important ideas, in the order they \
are taught. Aim for a mix of roughly 30% easy, 40% medium, and 30% hard questions. If the transcript is too \
short to support {count} distinct, well-grounded questions, create fewer rather than repeating ideas or \
testing outside knowledge.

{format_transcript(request)}"""


def _normalize(text: str) -> str:
    return re.sub(r"[^\w\s]", "", clean(text).lower())


def validate_question(question: GeminiQuestion, segments: list[Segment]) -> str | None:
    """Return why a generated question is unusable, or None if it is valid."""
    if not clean(question.question) or not question.explanation.strip():
        return "missing question or explanation"
    options = [clean(option) for option in question.options]
    if len(options) != OPTIONS_PER_QUESTION:
        return "does not have four options"
    if any(not option for option in options) or len({_normalize(o) for o in options}) != OPTIONS_PER_QUESTION:
        return "blank or duplicate options"
    if any(AMBIGUOUS_OPTION.search(option) for option in options):
        return "ambiguous option"
    if not 0 <= question.correct_option < OPTIONS_PER_QUESTION:
        return "correct option out of range"
    if not valid_segment_ids(question.segment_ids, segments):
        return "no valid transcript citation"
    return None


def shuffle_options(options: list[str], correct_index: int, rng: random.Random) -> tuple[list[str], int]:
    order = list(range(len(options)))
    rng.shuffle(order)
    return [options[i] for i in order], order.index(correct_index)


def to_response(result: GeminiQuiz, request: QuizRequest, model: str, rng: random.Random) -> QuizResponse:
    questions: list[QuizQuestion] = []
    seen: set[str] = set()
    for generated in result.questions:
        key = _normalize(generated.question)
        if validate_question(generated, request.segments) or key in seen:
            continue
        seen.add(key)
        options, correct_index = shuffle_options([clean(o) for o in generated.options], generated.correct_option, rng)
        segment_ids = valid_segment_ids(generated.segment_ids, request.segments)
        questions.append(
            QuizQuestion(
                id=f"q-{len(questions) + 1}",
                question=clean(generated.question),
                options=options,
                correct_index=correct_index,
                explanation=generated.explanation.strip(),
                difficulty=generated.difficulty.value,
                topic=clean(generated.topic) or "General",
                segment_ids=segment_ids,
                sources=to_sources(segment_ids, request.segments),
            )
        )
        if len(questions) == request.num_questions:
            break

    if not questions:
        raise HTTPException(502, "Gemini didn't return any valid questions grounded in this transcript. Please try again.")
    return QuizResponse(questions=questions, requested=request.num_questions, model=model, generated_at=now_iso())


def get_rng() -> random.Random:
    """FastAPI dependency so tests can make option shuffling deterministic."""
    return random.Random()


@router.post("/quiz", response_model=QuizResponse)
def create_quiz(
    request: QuizRequest,
    client: genai.Client = Depends(get_gemini_client),
    rng: random.Random = Depends(get_rng),
) -> QuizResponse:
    check_transcript_size(request)
    result, model = generate_structured(
        client,
        get_gemini_models(),
        system_instruction=SYSTEM_INSTRUCTION,
        prompt=build_prompt(request),
        schema=GeminiQuiz,
        label="quiz questions",
    )
    return to_response(result, request, model, rng)
