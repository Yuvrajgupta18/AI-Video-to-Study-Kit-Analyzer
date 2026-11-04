# AI Video-to-Study Kit Analyzer

Upload a lecture recording (MP4, MP3, WAV, M4A), get a timestamped transcript, use Gemini to generate study notes, interactive flashcards, and practice quizzes with performance analytics, and ask a RAG-based assistant questions that it answers only from that lecture, with clickable timestamp citations.

```
video-study-kit-starter/
├── backend/    FastAPI + faster-whisper + FFmpeg + Google GenAI SDK + Sentence Transformers + ChromaDB
│   ├── app/main.py         /transcribe, /health
│   ├── app/gemini.py       shared Gemini client, model fallback, error mapping, transcript → timestamps
│   ├── app/notes.py · flashcards.py · quiz.py
│   └── app/rag/            chunking · embeddings · ChromaDB store · /lectures/{id}/index and /ask
└── frontend/   React + Vite + Tailwind CSS + Lucide + Axios
```

## Prerequisites

- **Python 3.10+**
- **Node.js 20.19+** (or 22.12+) and npm
- **A Gemini API key** from https://aistudio.google.com/apikey (for notes, flashcards, quizzes, and Ask AI answers)
- About **2 GB of disk** for the Python packages (PyTorch comes with Sentence Transformers) plus ~90 MB for the embedding model, downloaded on first use
- **FFmpeg** on your PATH. Check with `ffmpeg -version`.
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg` (then reopen the terminal)
  - Ubuntu/Debian: `sudo apt install ffmpeg`

## 1. Start the backend (terminal 1)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env             # then put your key in .env (GEMINI_API_KEY=...)
uvicorn app.main:app --reload
```

`backend/.env` is gitignored, so never commit it or paste the key into frontend code. The backend reads the key at startup; restart it after changing `.env`. Optional settings in `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model used for notes |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash` | Retried once if the main model is rate-limited (429), overloaded (5xx), or times out. Each model has its own free-tier quota. Set it empty to disable. |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Sentence Transformers model for Ask AI. Changing it re-indexes lectures automatically. |
| `CHROMA_PATH` | `backend/data/chroma` | Where ChromaDB stores vectors (gitignored). |

The API runs at http://127.0.0.1:8000, with interactive docs at http://127.0.0.1:8000/docs.
The first transcription downloads the Whisper `base` model (~150 MB). CPU transcription can be slow for long lectures.
The first Ask AI use downloads the embedding model (~90 MB) and loads PyTorch, which takes 30–60 seconds once; after that, indexing a lecture takes a few seconds.

## 2. Start the frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

The dev server proxies every `/api/*` request to the backend at `http://127.0.0.1:8000`, so the browser never makes a cross-origin request. To point at a different backend, copy `frontend/.env.example` to `frontend/.env` and change `BACKEND_URL`.

### Frontend scripts

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Start the dev server with hot reload          |
| `npm run build`   | Production build into `frontend/dist`         |
| `npm run preview` | Serve the production build (proxy included)   |
| `npm run lint`    | Run ESLint                                    |
| `npm test`        | Run the frontend tests (Vitest)               |

## Features

- **Dashboard**: lecture, study-time, study-material, and quiz metrics computed from your saved data; recent lectures; quick access to each study tool; and weak topics to focus on. New users get a getting-started guide.
- **My Lectures**: responsive card grid or list, with search across titles and transcripts, sorting, available study materials, latest quiz score, and delete with confirmation.
- **App shell**: collapsible sidebar (remembered between visits), mobile navigation drawer, optional dark mode, toast notifications, and full keyboard navigation.
- **Upload**: drag-and-drop or file picker, with format and size (500 MB) checks, upload progress, a transcription timer, cancel, and clear error messages. A transcription keeps running if you switch pages; the sidebar shows its status.
- **Lecture details**: tabs for Transcript (timestamped segments with search, copy, and `.txt` download), Notes, Flashcards, Quiz, and Ask AI.
- **AI study notes** (Notes tab): a lecture summary, topic-wise notes, concepts and definitions, and key takeaways. Each item has source timestamps; click one to jump to the highlighted transcript segments. Notes can be regenerated and downloaded as Markdown.
- **AI flashcards** (Flashcards tab): 10–20 question/answer cards, each with a difficulty (easy, medium, hard), a topic, and source timestamps.
  - Click a card to flip it. Move with **Previous**/**Next** or the ← → keys; a progress bar shows your position.
  - Mark cards **Known** or **Needs revision**. Marking moves to the next card; clicking the active mark again clears it.
  - Filter by difficulty or revision status, and shuffle the deck or restore its original order.
  - On the back of a card, click its timestamp to see the source in the transcript. **Back to flashcards** returns to the same card.
  - Regenerate the deck (this resets revision marks) or download it as JSON or CSV (CSV opens in Excel and Google Sheets; both include your marks).
- **AI practice quiz** (Quiz tab): multiple-choice questions with four options, one correct answer, an explanation, a difficulty, a topic, and source timestamps.
  - **Setup:** choose 5, 10, or 20 questions.
  - **Taking the quiz:** one question at a time with **Previous**/**Next**, a progress bar, and a numbered navigator to jump between questions. **Submit quiz** asks for confirmation and warns about unanswered questions, which count as incorrect.
  - **Results:** score, percentage accuracy, correct/incorrect counts, every answer with its explanation and source timestamp, a "show incorrect only" filter, accuracy by topic, and weak topics (below 70%).
  - **Revision plan:** built from your wrong answers with no extra AI call. For each weak topic it points to the lecture timestamps to rewatch, the matching notes sections and definitions, and related flashcards, plus a tip based on the difficulty of what you missed.
  - **Performance dashboard:** latest, best, and average score; change since the previous attempt; a score-by-attempt chart (hover or focus a column for details, or open the table view); accuracy by topic; and the attempt history. **Retake quiz** starts a fresh attempt; **New quiz** generates a new set and keeps your past scores.
- **Ask AI** (lecture assistant): a chat that answers questions using only the selected lecture.
  - The lecture is indexed automatically the first time you open the tab; the header shows *Lecture indexed · N searchable passages*. **Rebuild index** forces a fresh index.
  - Message bubbles, a typing indicator, Enter to send (Shift+Enter for a new line), suggested starter questions, and **Clear chat**.
  - Suggested questions come from your own study data: weak quiz topics, flashcards marked *Needs revision*, and notes concepts, with general questions as a fallback.
  - Answers show inline citation numbers and a **Sources from the lecture** list with timestamps and excerpts. Clicking either opens the transcript with those segments highlighted; **Back to Ask AI** returns to the chat.
  - When the lecture doesn't cover a question, the answer is marked **Not covered in this lecture** instead of guessing.
  - Follow-up questions ("what if it's too small?") work: the last 6 messages are sent as context.
  - Conversations are saved per lecture in the browser. Deleting a lecture also deletes its vectors on the backend.
- **Backend status**: indicator in the sidebar (polls `/health`).

Transcripts, notes, flashcards, revision progress, quizzes, quiz attempts, and Ask AI conversations are saved in the browser's localStorage, attached to their lecture. They stay on that browser only, and clearing site data removes them.

### How AI output stays grounded

The backend numbers each transcript segment and sends `[id] time text` lines to Gemini. Gemini returns structured JSON, validated with Pydantic, that cites **segment IDs**, never timestamps. The backend drops IDs that don't exist, merges adjacent cited segments into ranges, and takes `start`/`end` from the real Whisper segments. Every timestamp shown therefore points to real transcript text.

Flashcards are filtered further. A card that cites no valid segment is discarded, as are blank or duplicate cards, and the deck is capped at 20. A very short recording may produce fewer than 10 cards, because Gemini is told not to pad the deck with repeated or outside facts.

Quiz questions get the strictest checks. A question is discarded unless it has exactly four distinct, non-blank options; a valid correct-answer index; no "all/none of the above" or "both A and B" style options; an explanation; and at least one valid transcript citation. Duplicate questions are discarded too. The backend asks Gemini for a few extra questions so it can still return the number you chose, and it shuffles the options so the correct answer isn't always in the same position. If a short lecture supports fewer questions, the quiz says so instead of padding it.

**Scoring happens in the browser.** The correct answers arrive with the quiz and are never displayed until you submit; grading, analytics, and recommendations make no further API calls. This is a self-study tool, not an exam system: the answers are in the page's data (browser storage and dev tools), so don't use it for graded assessments.

The Gemini API key is read only by the backend (`backend/.env`). The browser sends the transcript to the FastAPI server, which calls Gemini, so the key never reaches the frontend.

### The RAG pipeline (Ask AI)

```
 Indexing (once per transcript version)
 ─────────────────────────────────────
 Whisper segments ──► chunker ──────────► Sentence Transformers ──► ChromaDB
 [{start,end,text}]   ~80-word chunks,      384-dim normalized         one collection; each chunk stores
                      ~25-word overlap,     embeddings                 lecture_id, chunk index, start/end,
                      never splits a                                    segment_ids, transcript hash,
                      segment; breaks at                                model + chunker version
                      long pauses

 Answering
 ─────────
 question (+ previous question for follow-ups)
   └► embed ──► ChromaDB similarity search  WHERE lecture_id = <this lecture>
                 └► keep top 5 with cosine similarity ≥ 0.2
                     ├─ none ──► "Not covered in this lecture" (no Gemini call)
                     └─ some ──► Gemini: numbered excerpts + last 6 messages + strict instructions
                                   └► JSON {answerable, answer, citations} validated with Pydantic
                                       └► citation check: unknown numbers removed, grouped markers
                                          like [2, 3] expanded, renumbered in reading order;
                                          "answerable" with no valid citation ► treated as not covered
```

1. **Chunking** (`app/rag/chunking.py`): chunks are built from whole Whisper segments, so every chunk keeps exact start/end times and the IDs of its segments. A chunk closes at about 80 words, or earlier at a pause of 2 seconds or more once it has 40 words. It never exceeds 140 words unless a single segment is longer. Consecutive chunks share about 25 words of trailing segments, so an idea on a boundary can be found from either side.
2. **Embeddings** (`app/rag/embeddings.py`): `all-MiniLM-L6-v2` by default, normalized so cosine similarity is a dot product. The model loads lazily on first use, so the API starts quickly.
3. **Storage** (`app/rag/store.py`): one ChromaDB collection with cosine distance. Every read, write, and delete is filtered by `lecture_id`, and query results are re-checked against the requested lecture. A question about lecture A can never use lecture B's chunks.
4. **Re-index avoidance:** the backend fingerprints the transcript (SHA-256 of times + normalized text). `POST /index` does nothing if the stored fingerprint, embedding model, and chunker version all match. The browser keeps the fingerprint, so reopening Ask AI only makes a status check.
5. **Retrieval:** the question is embedded and the 5 most similar chunks from that lecture are fetched. For follow-ups, the previous question is also searched together with the new one, and each chunk keeps its best score. Chunks below 0.2 cosine similarity are dropped. The threshold was calibrated on real lectures: off-topic questions scored about 0.1, briefly covered topics about 0.24, and well-covered topics about 0.5.
6. **Grounded generation** (`app/rag/router.py`): Gemini receives only the numbered excerpts (with timestamps), the recent conversation, and instructions to use nothing else, to cite every claim, and to set `answerable: false` when the excerpts aren't enough. The conversation is context for words like "it", never a source.
7. **Citation validation:** citations can only point at excerpts that were actually retrieved, so every timestamp comes from ChromaDB metadata, never from the model.

Two safeguards stop invented answers. If nothing relevant is retrieved, Gemini is never called. If something is retrieved but doesn't answer the question (for example, the lecture only says "next week we'll cover CNNs"), Gemini must say so, and an "answer" without a valid citation is downgraded to *not covered*.

### API

| Endpoint | Body | Returns |
| --- | --- | --- |
| `POST /transcribe` | multipart `file` | `{language, segments: [{start, end, text}], transcript}` |
| `POST /notes` | `{title, language, segments}` | `{summary, sections, concepts, takeaways, model, generated_at}` |
| `POST /flashcards` | `{title, language, segments}` | `{cards: [{id, question, answer, difficulty, topic, segment_ids, sources: [{start, end}]}], model, generated_at}` |
| `POST /quiz` | `{title, language, segments, num_questions: 5 \| 10 \| 20}` | `{questions: [{id, question, options[4], correct_index, explanation, difficulty, topic, segment_ids, sources}], requested, model, generated_at}` |
| `POST /lectures/{id}/index` | `{title, language, segments, force?}` | `{indexed, up_to_date, reindexed, transcript_hash, chunk_count, embedding_model, indexed_at}` |
| `GET /lectures/{id}/index?transcript_hash=` | none | Index status: `indexed`, `up_to_date` (matches the hash, model, and chunker), `chunk_count`, … |
| `POST /lectures/{id}/ask` | `{question, history: [{role, content}], transcript_hash?}` | `{answer, answerable, citations: [{id, chunk_id, start, end, segment_ids, excerpt}], model, retrieved}` |
| `DELETE /lectures/{id}/index` | none | Removes the lecture's vectors |

`/ask` returns **409** if the lecture isn't indexed or its index is stale; the frontend then re-indexes and retries once. Embedding-model and ChromaDB failures return **503** with a clear message. Indexing doesn't need the Gemini key; only answering does.

Interactive docs: http://127.0.0.1:8000/docs.

## Running the tests

```bash
# Backend (uses a fake Gemini client and a deterministic fake embedder with a real,
# temporary ChromaDB, so no API calls, no key, and no model download are needed)
cd backend
pip install -r requirements-dev.txt
pytest

# Optional: check retrieval with the real Sentence Transformers model (downloads it once)
RUN_EMBEDDING_TESTS=1 pytest tests/test_rag_real_embeddings.py

# Frontend
cd frontend
npm test
npm run lint
npm run build
```

## Testing AI features by hand

### Notes


1. Start the backend and frontend. The sidebar should say *Backend online*.
2. Upload a short lecture clip (1–5 minutes is ideal) and wait for the transcript.
3. Open the **Notes** tab and click **Generate notes**. A short clip takes roughly 10–30 seconds.
4. Check the summary, takeaways, topic notes, and concepts. Click a timestamp chip: the Transcript tab opens with the source segments highlighted. Browser Back or **Back to notes** returns to the notes.
5. Click **Download .md** and open the file.
6. Reload the page. The notes are still there, and the lecture shows a *Notes* link on its card in **My Lectures**.
7. Error states: stop the backend and click **Regenerate** to see the offline message. To see the "not configured" message, remove the key from `.env` and restart.

### Flashcards

Use a lecture of at least 1–2 minutes so there is enough material for 10+ cards.

1. Open the lecture's **Flashcards** tab and click **Generate flashcards**. A loading panel with a timer and **Cancel** appears; a 2-minute lecture takes about 30 seconds.
2. Check the counter (for example *Card 1 of 12*) and the difficulty chips (*Easy (3) · Medium (5) · Hard (4)*).
3. Click the card to flip it, then use **Next**/**Previous** or the ← → keys. The card flips back to the question whenever you move.
4. Click **Known** on one card and **Needs revision** on another. The counts update and the deck moves to the next card.
5. Choose **Needs revision** in the status dropdown to study only those cards. Try the difficulty chips, **Shuffle**, and **Original order**.
6. Flip a card and click its source timestamp. The transcript opens with the source highlighted; **Back to flashcards** returns to the same card.
7. Click **JSON** and **CSV** and open the files. Your marks appear in the `status` column.
8. Reload the page. The deck and your marks are still there, and **My Lectures** shows a *Flashcards* link on its card.
9. Click **Regenerate** and confirm. A new deck appears and the marks reset.
10. Error states: with the backend stopped, **Generate**/**Regenerate** shows the offline message and a **Try again** button.

### Quiz (complete workflow)

Use a lecture of at least 1–2 minutes; a 20-question quiz needs a longer, denser lecture.

1. **Configure:** open the **Quiz** tab, choose **5**, **10**, or **20** questions, and click **Generate**. A loading panel with a timer and **Cancel** appears; 5–10 questions usually take 20–90 seconds.
2. **Review the quiz:** the summary shows the question count, the difficulty mix, and the number of topics. Click **Start quiz**.
3. **Take it:** answer some questions correctly and some wrongly, and leave one blank. Use **Next**/**Previous** and the numbered navigator. The progress bar tracks how many you've answered, and no correct answers or explanations are visible.
4. **Submit:** click **Submit quiz**. The confirmation says how many questions are unanswered. Try **Keep working**, then submit.
5. **Results:** check the score (for example *3/5*, *60% accuracy*), the correct/incorrect counts, the topic chart with *Needs revision* flags, and the **Revision plan**. Review the answers, explanations, and the **Incorrect** filter.
6. **Sources:** click a timestamp under an explanation or in the revision plan. The transcript opens highlighted; **Back to quiz** returns to the same results.
7. **Retake:** click **Retake quiz**, answer everything correctly, and submit. The results show the change (for example *+40 pts vs previous attempt (60%)*) and your best score.
8. **Performance dashboard:** shows the stat tiles, the score-by-attempt chart (hover a column; open **View as table**), accuracy by topic, and the attempt history with **View results**.
9. **Persistence:** reload the page. The quiz and every attempt are still there. **My Lectures** shows the latest score on the lecture's card, and the dashboard shows the average score and any weak topics.
10. **New quiz:** click **New quiz**, choose a count, and generate. Older attempts stay in the history marked *earlier quiz*.
11. **Errors:** stop the backend and click **Generate**. You get the offline message and **Try again**, which retries with the same question count.

### Ask AI (lecture assistant)

Use a lecture of at least 1–2 minutes, ideally one you already have notes, flashcards, or a quiz for, so the suggested questions are personalised.

1. **Index:** open the lecture's **Ask AI** tab. The header shows *Indexing the lecture for search…* (30–60 s the very first time while the model loads), then *Lecture indexed · N searchable passages*. Reload and reopen the tab: it only checks the index status and does not re-index.
2. **Answerable question:** click a suggested question, or ask something the lecture explains (for example *"How does the learning rate affect training?"*). The answer has inline citation numbers and a **Sources from the lecture** list.
3. **Follow-up:** ask *"And what happens if it is too small?"*. "It" is understood from the previous question.
4. **Citations:** click a citation number or a source. The Transcript tab opens with those segments highlighted; **Back to Ask AI** returns to the chat.
5. **Off-topic question:** ask *"Who won the 2022 FIFA World Cup?"*. You'll get an instant *Not covered in this lecture* reply (no Gemini call).
6. **Mentioned but not explained:** ask about something the lecture only names in passing (in our demo lecture, *"Explain how convolutional neural networks process images."*). The assistant says the lecture only mentions it rather than explaining from general knowledge.
7. **Isolation:** open a different lecture's Ask AI tab and ask about the first lecture's topic. It's *not covered*, because each lecture searches only its own chunks.
8. **History:** reload the page; the conversation is still there. **Clear chat** asks for confirmation and empties it.
9. **Errors:** stop the backend and ask a question to see the error bubble with **Retry**. If Gemini's quota is used up, you'll see the quota message; indexing and off-topic detection still work because they don't use Gemini.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Couldn't reach the transcription server" / sidebar says *Backend offline* | Start the backend (step 1) and make sure it's on port 8000. |
| "The server hit an unexpected error…" | Read the traceback in the backend terminal. Usual causes: FFmpeg isn't installed or isn't on PATH, or PyAV is too new (see next row). |
| `TypeError: open() got an unexpected keyword argument 'metadata_errors'` | PyAV 19 is incompatible with faster-whisper 1.2.1. Run `pip install "av<19"` in the backend venv. `requirements.txt` already pins this. |
| "AI features aren't configured" | Add `GEMINI_API_KEY=...` to `backend/.env` and restart the backend. |
| "Gemini rejected the API key" | The key is wrong or revoked. Create a new one in Google AI Studio. |
| "rate limit or quota was reached" | Free-tier limit hit. Wait a minute, or check quota in AI Studio. |
| "daily free-tier quota is used up" | The free tier allows a limited number of requests per day **per model** (20 per day for the flash models at the time of writing). Both configured models are used up; wait for the reset, or set `GEMINI_MODEL` to another model (e.g. `gemini-3.5-flash-lite`) and restart the backend. |
| Ask AI says *Indexing…* for a long time | The first run downloads the embedding model (~90 MB) and loads PyTorch. Watch the backend terminal. |
| "Couldn't load the embedding model" | The model couldn't be downloaded or loaded. Check your internet connection for the first run, and that `EMBEDDING_MODEL` names a Sentence Transformers model. |
| "…vector database…" (503) | ChromaDB couldn't open or write `CHROMA_PATH`. Check the folder is writable. You can delete `backend/data/chroma` to reset; lectures re-index automatically when you open Ask AI. |
| Ask AI answers "not covered" for something the lecture does mention | Try rephrasing with the lecture's own words, or use **Rebuild index**. Very brief mentions can fall below the retrieval threshold. |
| "temporarily unavailable" / "took too long" | Both the main and fallback models were overloaded. Try again, or set `GEMINI_MODEL` to another model. |
| "didn't return any flashcards grounded in this transcript" | Gemini's cards didn't cite valid transcript segments, so all were discarded. Try again; very short or silent recordings may not have enough content. |
| Fewer than 10 flashcards | The recording is short. Gemini makes fewer cards instead of inventing material. |
| "You asked for N questions, but this lecture only supported M" | Some generated questions failed validation (ambiguous, ungrounded, or duplicate) or the lecture is short. Choose a smaller count or generate again. |
| "didn't return any valid questions grounded in this transcript" | Every generated question failed validation. Try again; very short recordings may not support a quiz. |
| Transcription seems stuck | CPU transcription takes time; the first run also downloads the model. Watch the backend terminal. |

## Next phase

Add persistent storage, accounts, and background jobs on the backend (lectures currently live in each browser), and move long-running AI work to a queue. The current API is a minimal local prototype. Do not expose it publicly without authentication, upload limits, and request controls.
