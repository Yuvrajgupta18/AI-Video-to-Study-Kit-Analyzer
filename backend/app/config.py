import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Load backend/.env no matter which directory uvicorn is started from.
# Variables already set in the real environment take precedence.
load_dotenv(BACKEND_DIR / ".env", override=False)

# Pinned models: the "-latest" aliases and the newest releases were frequently
# overloaded or timing out during testing (Oct 2026).
DEFAULT_GEMINI_MODEL = "gemini-3.6-flash"
DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash"
_PLACEHOLDER_KEY = "replace_with_your_key"


def get_gemini_api_key() -> str | None:
    """Return the Gemini API key, or None if it is missing or still the placeholder."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return key if key and key != _PLACEHOLDER_KEY else None


def get_gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODEL


def get_gemini_models() -> list[str]:
    """Primary model followed by an optional fallback used when the primary is overloaded."""
    fallback = os.getenv("GEMINI_FALLBACK_MODEL", DEFAULT_GEMINI_FALLBACK_MODEL).strip()
    primary = get_gemini_model()
    return [primary] + ([fallback] if fallback and fallback != primary else [])


DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def get_embedding_model_name() -> str:
    return os.getenv("EMBEDDING_MODEL", "").strip() or DEFAULT_EMBEDDING_MODEL


def get_chroma_path() -> Path:
    """Where ChromaDB persists vectors (backend/data/chroma by default, gitignored)."""
    return Path(os.getenv("CHROMA_PATH", "").strip() or BACKEND_DIR / "data" / "chroma")
