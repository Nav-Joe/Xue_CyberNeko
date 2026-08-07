from __future__ import annotations

import io
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from stt_service import app as app_module
from stt_service.app import create_app
from stt_service.sensevoice import resolve_model_dir


def _mono_wav_bytes(duration_sec: float = 0.2, rate: int = 16000, freq: float = 440.0) -> bytes:
    n = int(rate * duration_sec)
    t = np.arange(n, dtype=np.float32) / rate
    samples = (0.2 * np.sin(2 * np.pi * freq * t) * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


@pytest.fixture()
def client() -> TestClient:
    app_module.bound_port = 8767
    application = create_app()
    with TestClient(application) as c:
        yield c


def test_cors_allows_renderer_origins(client: TestClient) -> None:
    """渲染进程直连侧车；无 CORS 时 fetch 失败并误报未启动。"""
    res = client.options(
        "/v1/recognize",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == "*"

    health = client.get("/health", headers={"Origin": "null"})
    assert health.status_code == 200
    assert health.headers.get("access-control-allow-origin") == "*"




def test_recognize_rejects_empty_file(client: TestClient) -> None:
    if not app_module.engine.model_ready:
        # 无模型时先保证 503，而不是误成 400
        res = client.post(
            "/v1/recognize",
            files={"file": ("empty.wav", b"", "audio/wav")},
        )
        assert res.status_code == 503
        assert res.json()["error"] == "model_not_ready"
        return

    res = client.post(
        "/v1/recognize",
        files={"file": ("empty.wav", b"", "audio/wav")},
    )
    assert res.status_code == 400
    assert res.json()["error"] == "bad_audio"


def test_recognize_rejects_wrong_rate(client: TestClient) -> None:
    if not app_module.engine.model_ready:
        pytest.skip("SenseVoice model not available")
    bad = _mono_wav_bytes(rate=8000)
    res = client.post(
        "/v1/recognize",
        files={"file": ("bad.wav", bad, "audio/wav")},
    )
    assert res.status_code == 400
    assert res.json()["error"] == "bad_audio"


@pytest.mark.skipif(resolve_model_dir() is None, reason="SenseVoice model dir missing")
def test_recognize_zh_sample(client: TestClient) -> None:
    model_dir = resolve_model_dir()
    assert model_dir is not None
    wav_path = model_dir / "test_wavs" / "zh.wav"
    if not wav_path.is_file():
        pytest.skip("zh.wav missing")
    data = wav_path.read_bytes()
    res = client.post(
        "/v1/recognize",
        files={"file": ("zh.wav", data, "audio/wav")},
        data={"language": "auto"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert isinstance(body["text"], str)
    assert body["text"]  # 样例应有内容
    assert "decodeMs" in body
    assert "durationMs" in body
