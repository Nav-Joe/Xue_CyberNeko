"""
memory_service — M4 异步 LLM 侧车（总结 / 后续情感打分）。

边界：
- 禁止直接打开 Electron `{userData}/memory.db`
- 仅接收 Node 经 HTTP 投递的 JSON，返回结果由 Node 落库
- M4.1：提供模板/LLM 总结端点；默认可由 Node 本地模板降级，本服务可选启动
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Xue CyberNeko Memory Service", version="0.1.0")


class ChatTurn(BaseModel):
    role: str
    content: str


class SummarizeRequest(BaseModel):
    session_id: str
    messages: list[ChatTurn] = Field(default_factory=list)


class SummarizeResponse(BaseModel):
    session_id: str
    summary: str
    key_facts: list[str]
    emotion_tags: list[str]
    engine: str = "template"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/summarize", response_model=SummarizeResponse)
def summarize(body: SummarizeRequest) -> SummarizeResponse:
    user_lines = [m.content.strip() for m in body.messages if m.role == "user" and m.content.strip()]
    assistant_n = sum(1 for m in body.messages if m.role == "assistant" and m.content.strip())
    head = user_lines[0][:80] if user_lines else "（无用户发言）"
    summary = (
        f"会话摘要（memory_service 模板）：用户提到「{head}」等共 {len(user_lines)} 条；"
        f"助手回复 {assistant_n} 条。"
    )
    key_facts = [line[:120] for line in user_lines[:3]]
    return SummarizeResponse(
        session_id=body.session_id,
        summary=summary,
        key_facts=key_facts,
        emotion_tags=[],
        engine="template",
    )


def build_app() -> Any:
    return app
