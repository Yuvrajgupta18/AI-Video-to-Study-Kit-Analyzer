import pytest

from app.gemini import Segment
from app.rag import chunking
from app.rag.chunking import MAX_WORDS, OVERLAP_WORDS, chunk_segments, transcript_hash
from tests.rag_fakes import NEURAL_NETWORKS, seg


def segments(raw):
    return [Segment(**s) for s in raw]


def words(n, word="word"):
    return " ".join([word] * n)


def test_chunks_cover_every_segment_in_order_with_real_timestamps():
    segs = segments(NEURAL_NETWORKS)
    chunks = chunk_segments(segs)

    assert len(chunks) > 1
    covered = sorted({i for c in chunks for i in c.segment_ids})
    assert covered == list(range(len(segs)))
    for n, chunk in enumerate(chunks):
        assert chunk.index == n
        ids = list(chunk.segment_ids)
        assert ids == list(range(ids[0], ids[-1] + 1))  # contiguous
        assert chunk.start == segs[ids[0]].start
        assert chunk.end == segs[ids[-1]].end
        assert chunk.text == " ".join(segs[i].text for i in ids)


def test_consecutive_chunks_overlap_at_their_boundary():
    segs = segments(NEURAL_NETWORKS)
    chunks = chunk_segments(segs)
    for previous, current in zip(chunks, chunks[1:]):
        shared = [i for i in previous.segment_ids if i in current.segment_ids]
        assert shared, "chunks should overlap"
        assert shared == list(previous.segment_ids[-len(shared):]) == list(current.segment_ids[: len(shared)])
        assert sum(len(segs[i].text.split()) for i in shared) >= min(OVERLAP_WORDS, len(segs[shared[-1]].text.split()))
        assert current.start < previous.end


def test_chunks_respect_the_word_limit():
    chunks = chunk_segments(segments([seg(i * 3, words(30)) for i in range(20)]))
    assert all(c.word_count <= MAX_WORDS for c in chunks)


def test_a_long_pause_ends_a_chunk_early():
    raw = [seg(0, words(25)), seg(4, words(25)), seg(30, words(25)), seg(34, words(25))]  # 22 s pause before segment 2
    chunks = chunk_segments(segments(raw))
    assert chunks[0].segment_ids == (0, 1)


def test_blank_segments_are_skipped_but_ids_are_preserved():
    raw = [seg(0, "Neurons have weights."), seg(4, "   "), seg(8, "Biases shift outputs.")]
    chunks = chunk_segments(segments(raw))
    assert len(chunks) == 1
    assert chunks[0].segment_ids == (0, 2)
    assert chunks[0].text == "Neurons have weights. Biases shift outputs."


def test_oversized_segments_become_their_own_chunks_and_chunking_terminates():
    chunks = chunk_segments(segments([seg(i * 10, words(200)) for i in range(4)]))
    assert [c.segment_ids for c in chunks] == [(0,), (1,), (2,), (3,)]


def test_empty_transcript_has_no_chunks():
    assert chunk_segments(segments([seg(0, "  ")])) == []


def test_smaller_targets_produce_more_chunks(monkeypatch):
    default_count = len(chunk_segments(segments(NEURAL_NETWORKS)))
    monkeypatch.setattr(chunking, "TARGET_WORDS", 20)
    monkeypatch.setattr(chunking, "OVERLAP_WORDS", 5)
    assert len(chunk_segments(segments(NEURAL_NETWORKS))) > default_count


@pytest.mark.parametrize(
    ("change", "same"),
    [
        (lambda s: s, True),
        (lambda s: [{**x, "text": "  " + x["text"].replace(" ", "  ") + " "} for x in s], True),  # whitespace only
        (lambda s: [{**s[0], "text": s[0]["text"] + " Extra."}] + s[1:], False),
        (lambda s: [{**s[0], "end": s[0]["end"] + 1}] + s[1:], False),
        (lambda s: s[:-1], False),
    ],
)
def test_transcript_hash_tracks_content_changes(change, same):
    original = transcript_hash(segments(NEURAL_NETWORKS))
    changed = transcript_hash(segments(change([dict(x) for x in NEURAL_NETWORKS])))
    assert (original == changed) is same
    assert len(original) == 64
