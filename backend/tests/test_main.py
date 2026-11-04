def test_health_reports_gemini_configured(client):
    assert client.get("/health").json() == {"status": "ok", "gemini_configured": True}


def test_health_reports_missing_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY")
    assert client.get("/health").json()["gemini_configured"] is False


def test_placeholder_key_counts_as_missing(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "replace_with_your_key")
    assert client.get("/health").json()["gemini_configured"] is False


def test_transcribe_rejects_unsupported_format(client):
    response = client.post("/transcribe", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert response.status_code == 400
    assert response.json() == {"detail": "Supported formats: MP4, MP3, WAV, M4A"}


def test_transcribe_requires_a_file(client):
    assert client.post("/transcribe").status_code == 422
