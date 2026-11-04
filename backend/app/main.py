import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

from .config import get_gemini_api_key
from .flashcards import router as flashcards_router
from .notes import router as notes_router
from .quiz import router as quiz_router
from .rag.router import register_error_handlers as register_rag_error_handlers
from .rag.router import router as rag_router

app = FastAPI(title="AI Video Study Kit")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])
app.include_router(notes_router)
app.include_router(flashcards_router)
app.include_router(quiz_router)
app.include_router(rag_router)
register_rag_error_handlers(app)
model = None

@app.get("/health")
def health():
    return {"status": "ok", "gemini_configured": get_gemini_api_key() is not None}

@app.post("/transcribe")
def transcribe(file: UploadFile = File(...)):
    global model
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".mp3", ".wav", ".m4a"}:
        raise HTTPException(400, "Supported formats: MP4, MP3, WAV, M4A")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / ("upload" + suffix)
        with path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        audio = Path(folder) / "audio.wav"
        try:
            subprocess.run(["ffmpeg", "-y", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", str(audio)], check=True, capture_output=True)
            if model is None:
                model = WhisperModel("base", device="cpu", compute_type="int8")
            segments, info = model.transcribe(str(audio), beam_size=5)
            rows = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments]
            return {"language": info.language, "segments": rows, "transcript": " ".join(s["text"] for s in rows)}
        except (subprocess.CalledProcessError, RuntimeError) as exc:
            raise HTTPException(500, f"Processing failed: {str(exc)[:250]}") from exc
