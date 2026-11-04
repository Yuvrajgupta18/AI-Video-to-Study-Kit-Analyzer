from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.gemini import get_gemini_client

FAKE_KEY = "test-key-not-a-real-secret"


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    """Never use the developer's real key or model settings in tests."""
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_FALLBACK_MODEL", raising=False)


class FakeModels:
    """Stands in for client.models; replays queued responses or exceptions."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def fake_gemini():
    """Install a fake Gemini client. Call it with the outcomes to replay."""

    def install(*outcomes):
        models = FakeModels(outcomes)
        app.dependency_overrides[get_gemini_client] = lambda: SimpleNamespace(models=models)
        return models

    yield install
    app.dependency_overrides.clear()
