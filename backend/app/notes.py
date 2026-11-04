"""Gemini-generated study notes built from a Whisper transcript."""

from fastapi import APIRouter, Depends
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
)

router = APIRouter()


# ---------------------------------------------------------------------------
# API response models
# ---------------------------------------------------------------------------

class Section(BaseModel):
    title: str
    summary: str
    points: list[str]
    sources: list[SourceRange]


class Concept(BaseModel):
    term: str
    definition: str
    sources: list[SourceRange]


class Takeaway(BaseModel):
    text: str
    sources: list[SourceRange]


class NotesResponse(BaseModel):
    summary: str
    sections: list[Section]
    concepts: list[Concept]
    takeaways: list[Takeaway]
    model: str
    generated_at: str


# ---------------------------------------------------------------------------
# Structured output schema that Gemini fills in
# ---------------------------------------------------------------------------

class GeminiSection(BaseModel):
    title: str = Field(description="Short topic heading.")
    summary: str = Field(description="One or two sentences explaining what this part of the lecture covers.")
    points: list[str] = Field(description="Detailed note bullet points for this topic.")
    segment_ids: list[int] = Field(description=SEGMENT_IDS_DESCRIPTION)


class GeminiConcept(BaseModel):
    term: str = Field(description="The concept, term, or formula name.")
    definition: str = Field(description="Clear definition as explained in the lecture.")
    segment_ids: list[int] = Field(description=SEGMENT_IDS_DESCRIPTION)


class GeminiTakeaway(BaseModel):
    text: str = Field(description="One key point a student should remember.")
    segment_ids: list[int] = Field(description=SEGMENT_IDS_DESCRIPTION)


class GeminiNotes(BaseModel):
    summary: str = Field(description="A 3-5 sentence overview of the whole lecture.")
    sections: list[GeminiSection] = Field(description="Topic-wise notes in the order topics are taught.")
    concepts: list[GeminiConcept] = Field(description="Important concepts and their definitions.")
    takeaways: list[GeminiTakeaway] = Field(description="The most important things to remember.")


SYSTEM_INSTRUCTION = f"""\
You are an expert teaching assistant who writes accurate, well-organized study notes from lecture transcripts.

Rules:
- Use only information stated in the transcript. Do not add outside facts, examples, or opinions.
- {ASR_RULE}
- Every section, concept, and takeaway must cite the IDs of the transcript segments that support it. \
Use only IDs that appear in the transcript.
- Write the notes in the same language as the transcript.
- Match the depth to the lecture: a short clip needs only a few items, a long lecture needs more sections."""


def build_prompt(request: TranscriptRequest) -> str:
    return f"""\
Create study notes containing:
1. summary: a 3-5 sentence overview of the whole lecture.
2. sections: the lecture's topics in teaching order. Each has a short title, a 1-2 sentence summary, \
2-6 detailed bullet points, and supporting segment IDs.
3. concepts: important terms, ideas, or formulas with clear definitions as explained in the lecture.
4. takeaways: the 3-7 most important things a student should remember.

{format_transcript(request)}"""


def to_response(notes: GeminiNotes, segments: list[Segment], model: str) -> NotesResponse:
    return NotesResponse(
        summary=notes.summary.strip(),
        sections=[
            Section(
                title=clean(s.title),
                summary=s.summary.strip(),
                points=[clean(p) for p in s.points if p.strip()],
                sources=to_sources(s.segment_ids, segments),
            )
            for s in notes.sections
            if s.title.strip()
        ],
        concepts=[
            Concept(term=clean(c.term), definition=c.definition.strip(), sources=to_sources(c.segment_ids, segments))
            for c in notes.concepts
            if c.term.strip() and c.definition.strip()
        ],
        takeaways=[
            Takeaway(text=t.text.strip(), sources=to_sources(t.segment_ids, segments))
            for t in notes.takeaways
            if t.text.strip()
        ],
        model=model,
        generated_at=now_iso(),
    )


@router.post("/notes", response_model=NotesResponse)
def create_notes(request: TranscriptRequest, client: genai.Client = Depends(get_gemini_client)) -> NotesResponse:
    check_transcript_size(request)
    notes, model = generate_structured(
        client,
        get_gemini_models(),
        system_instruction=SYSTEM_INSTRUCTION,
        prompt=build_prompt(request),
        schema=GeminiNotes,
        label="notes",
    )
    return to_response(notes, request.segments, model)
