from fastapi.testclient import TestClient

from memory_service.app import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_summarize_template():
    res = client.post(
        "/v1/summarize",
        json={
            "session_id": "s1",
            "messages": [
                {"role": "user", "content": "今天天气不错"},
                {"role": "assistant", "content": "嗯嗯～"},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["session_id"] == "s1"
    assert "今天天气不错" in body["summary"]
    assert body["key_facts"] == ["今天天气不错"]
    assert body["engine"] == "template"
