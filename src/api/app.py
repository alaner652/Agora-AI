"""FastAPI application — TPCU chatbot REST API."""

from __future__ import annotations

import json
import os
import secrets
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from agent import (
    AskUserEvent,
    DoneEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from session import get_session_api

from .models import AnswerRequest, ChatRequest, LoginRequest, LoginResponse
from .routes import router as data_router
from .state import AgentRegistry

load_dotenv()

_LLM_API_KEY  = os.getenv("LLM_API_KEY", "")
_LLM_BASE_URL = os.getenv("LLM_BASE_URL")
_LLM_MODEL    = os.getenv("LLM_MODEL", "gpt-4o-mini")

_registry: AgentRegistry | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _registry
    llm = OpenAI(api_key=_LLM_API_KEY, base_url=_LLM_BASE_URL)
    _registry = AgentRegistry(llm=llm, model=_LLM_MODEL)
    app.state.registry = _registry
    yield


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="TPCU API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(data_router, prefix="/api")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _event_to_dict(event) -> dict:
    if isinstance(event, ToolCallEvent):
        return {"type": "tool_call", "name": event.name, "args": event.args}
    if isinstance(event, ToolResultEvent):
        return {"type": "tool_result", "name": event.name, "ok": event.ok,
                "data": event.data, "unconfirmed": event.unconfirmed}
    if isinstance(event, TextDeltaEvent):
        return {"type": "text_delta", "text": event.text}
    if isinstance(event, AskUserEvent):
        return {"type": "ask_user", "question": event.question,
                "options": event.options, "tool_call_id": event.tool_call_id}
    if isinstance(event, DoneEvent):
        return {"type": "done"}
    return {"type": "unknown"}


async def _stream_events(gen):
    async for event in gen:
        yield f"data: {json.dumps(_event_to_dict(event), ensure_ascii=False)}\n\n"


def _get_registry() -> AgentRegistry:
    if _registry is None:
        raise HTTPException(status_code=503, detail="服務未就緒")
    return _registry


async def _get_agent_or_401(token: str):
    result = await _get_registry().get(token)
    if result is None:
        raise HTTPException(status_code=401, detail="Token 無效或已過期，請重新呼叫 /login")
    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "model": _LLM_MODEL}


@app.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    try:
        jsessionid = await get_session_api(body.uid, body.pwd)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"登入失敗：{e}")

    token = secrets.token_urlsafe(32)
    await _get_registry().register(token, body.uid, jsessionid)
    return LoginResponse(token=token)


@app.post("/chat")
@limiter.limit("5/minute")
async def chat(request: Request, body: ChatRequest):
    agent, lock = await _get_agent_or_401(body.token)

    if lock.locked():
        raise HTTPException(status_code=429, detail="上一個請求仍在處理中")

    async def generate():
        async with lock:
            async for chunk in _stream_events(agent.step(body.message)):
                yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/answer")
@limiter.limit("5/minute")
async def answer(request: Request, body: AnswerRequest):
    agent, lock = await _get_agent_or_401(body.token)

    if lock.locked():
        raise HTTPException(status_code=429, detail="上一個請求仍在處理中")

    async def generate():
        async with lock:
            async for chunk in _stream_events(agent.answer_ask_user(body.selected)):
                yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")
