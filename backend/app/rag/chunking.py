"""Split a transcript into overlapping, timestamped chunks for retrieval.

Chunks are built from whole Whisper segments, so every chunk keeps exact start
and end times and the IDs of the segments it contains. A chunk closes when it
reaches TARGET_WORDS, or earlier at a natural pause once it has MIN_WORDS_AT_PAUSE.
Consecutive chunks share about OVERLAP_WORDS of trailing segments so an idea that
straddles a boundary is still retrievable from either side.
"""

import hashlib
import json
from dataclasses import dataclass

from ..gemini import Segment

# Bump when chunking rules change so existing indexes are rebuilt.
CHUNKER_VERSION = "1"
TARGET_WORDS = 80
MAX_WORDS = 140
MIN_WORDS_AT_PAUSE = 40
PAUSE_SECONDS = 2.0
OVERLAP_WORDS = 25


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str
    start: float
    end: float
    segment_ids: tuple[int, ...]

    @property
    def word_count(self) -> int:
        return len(self.text.split())


def transcript_hash(segments: list[Segment]) -> str:
    """Stable fingerprint of the transcript content, used to skip unnecessary re-indexing."""
    canonical = json.dumps(
        [[round(s.start, 2), round(s.end, 2), " ".join(s.text.split())] for s in segments],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _words(segment: Segment) -> int:
    return len(segment.text.split())


def chunk_segments(segments: list[Segment]) -> list[Chunk]:
    # Keep the original segment IDs (positions) even when skipping blank segments.
    items = [(i, s) for i, s in enumerate(segments) if s.text.strip()]
    chunks: list[Chunk] = []
    start = 0
    while start < len(items):
        words = 0
        end = start
        while end < len(items):
            seg_words = _words(items[end][1])
            if end > start and words + seg_words > MAX_WORDS:
                break
            words += seg_words
            end += 1
            if words >= TARGET_WORDS:
                break
            at_pause = end < len(items) and items[end][1].start - items[end - 1][1].end >= PAUSE_SECONDS
            if at_pause and words >= MIN_WORDS_AT_PAUSE:
                break

        part = items[start:end]
        chunks.append(
            Chunk(
                index=len(chunks),
                text=" ".join(" ".join(s.text.split()) for _, s in part),
                start=part[0][1].start,
                end=part[-1][1].end,
                segment_ids=tuple(i for i, _ in part),
            )
        )
        if end >= len(items):
            break

        # Step back over trailing segments to create the overlap, always moving forward.
        back, overlap = end, 0
        while back - 1 > start and overlap < OVERLAP_WORDS:
            back -= 1
            overlap += _words(items[back][1])
        start = back
    return chunks
