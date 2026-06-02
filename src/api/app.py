"""FastAPI application — TPCU chatbot REST API."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
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
from session import refresh_api as _fresh_login

from .models import AnswerRequest, ChatRequest, LoginRequest, LoginResponse
from .routes import router as data_router
from .state import AgentRegistry
from storage import init_db, init_user_settings_db, init_sessions_db, init_files_db, init_messages_db, init_settings_db, get_file, get_llm_config

load_dotenv()

_LLM_API_KEY  = os.getenv("LLM_API_KEY", "")
_LLM_BASE_URL = os.getenv("LLM_BASE_URL")
_LLM_MODEL    = os.getenv("LLM_MODEL", "")

_registry: AgentRegistry | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _registry
    init_db()
    init_user_settings_db()
    init_sessions_db()
    init_files_db()
    init_messages_db()
    init_settings_db()
    llm = OpenAI(api_key=_LLM_API_KEY, base_url=_LLM_BASE_URL)
    _registry = AgentRegistry(llm=llm, model=_LLM_MODEL)
    app.state.registry = _registry
    yield


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="TPCU API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        sanitized = {k: ("<binary>" if isinstance(v, bytes) else v) for k, v in err.items()}
        errors.append(sanitized)
    return JSONResponse(status_code=422, content={"detail": errors})
_CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
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
        raise HTTPException(status_code=503, detail={"error": "服務未就緒", "error_code": "SVC_001"})
    return _registry


async def _get_agent_or_401(token: str):
    result = await _get_registry().get(token)
    if result is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期，請重新呼叫 /login", "error_code": "AUTH_002"})
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
        jsessionid = await _fresh_login(body.uid, body.pwd)
    except Exception as e:
        raise HTTPException(status_code=401, detail={"error": f"登入失敗：{e}", "error_code": "AUTH_001"})

    user_cfg = get_llm_config(body.uid)
    if user_cfg:
        llm = OpenAI(api_key=user_cfg.api_key or "EMPTY", base_url=user_cfg.base_url)
        model = user_cfg.model
    else:
        llm = None   # AgentRegistry will use its default
        model = None

    token = secrets.token_urlsafe(32)
    await _get_registry().register(token, body.uid, jsessionid, llm=llm, model=model)
    return LoginResponse(token=token)


def _load_attachment(file_id: str | None, uid: str) -> tuple[str | None, str]:
    """Return (base64_data, mime_type) or (None, '') if not usable.

    Validates file ownership via DB — no path is ever exposed to callers.
    """
    if not file_id or not uid:
        return None, ''
    meta = get_file(file_id, uid)
    if meta is None:
        return None, ''
    p = Path(meta["storage_path"])
    if not p.exists() or not p.is_file():
        return None, ''
    mime = meta["mime_type"] or mimetypes.guess_type(str(p))[0] or 'application/octet-stream'
    if not mime.startswith('image/'):
        return None, ''
    return base64.b64encode(p.read_bytes()).decode(), mime


@app.post("/chat")
@limiter.limit("5/minute")
async def chat(request: Request, body: ChatRequest):
    agent, lock = await _get_agent_or_401(body.token)
    uid = _get_registry().get_uid(body.token) or ''

    if lock.locked():
        raise HTTPException(status_code=429, detail="上一個請求仍在處理中")

    image_b64, image_mime = _load_attachment(body.file_id, uid)

    async def generate():
        async with lock:
            async for chunk in _stream_events(
                agent.step(body.message, image_b64=image_b64, image_mime=image_mime)
            ):
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
