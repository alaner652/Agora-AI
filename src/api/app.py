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
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from openai import AsyncOpenAI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from agent import (
    AskUserEvent,
    DoneEvent,
    TextDeltaEvent,
    ThinkingDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageEvent,
)
from agent.providers import OpenAICompatProvider
from session import refresh_api as _fresh_login

from .models import AnswerRequest, ChatRequest, LoginRequest, LoginResponse
from .routes import router as data_router
from .state import AgentRegistry
from storage import (
    init_db,
    init_user_settings_db,
    init_token_usage_db,
    get_llm_config,
    record_usage,
    touch_session,
)

load_dotenv()

_WEB_DIST = Path(__file__).parent.parent.parent / "web" / "dist"

_LLM_API_KEY  = os.getenv("LLM_API_KEY", "")
_LLM_BASE_URL = os.getenv("LLM_BASE_URL")
_LLM_MODEL    = os.getenv("LLM_MODEL", "")

_registry: AgentRegistry | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _registry
    init_db()
    init_user_settings_db()
    init_token_usage_db()
    client = AsyncOpenAI(api_key=_LLM_API_KEY, base_url=_LLM_BASE_URL)
    provider = OpenAICompatProvider(client, _LLM_MODEL)
    _registry = AgentRegistry(provider=provider)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(data_router, prefix="/api")

if (_WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=_WEB_DIST / "assets"), name="static_assets")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _event_to_dict(event) -> dict:
    """Convert AgentEvent to JSON-serializable dict with robust type handling."""
    try:
        if isinstance(event, ToolCallEvent):
            return {"type": "tool_call", "name": event.name, "args": event.args}
        if isinstance(event, ToolResultEvent):
            # Ensure data is JSON-parseable string; if not, wrap it
            try:
                json.loads(event.data)
                data_val = event.data
            except (json.JSONDecodeError, TypeError):
                data_val = json.dumps({"error": "Invalid JSON in tool result", "raw": str(event.data)}, ensure_ascii=False)
            return {
                "type": "tool_result",
                "name": event.name,
                "ok": event.ok,
                "data": data_val,
                "unconfirmed": event.unconfirmed,
            }
        if isinstance(event, TextDeltaEvent):
            return {"type": "text_delta", "text": event.text}
        if isinstance(event, ThinkingDeltaEvent):
            return {"type": "thinking", "text": event.text}
        if isinstance(event, AskUserEvent):
            return {
                "type": "ask_user",
                "question": event.question,
                "options": event.options,
                "tool_call_id": event.tool_call_id,
            }
        if isinstance(event, UsageEvent):
            return {
                "type": "usage",
                "input_tokens": event.input_tokens,
                "output_tokens": event.output_tokens,
                "cached_tokens": event.cached_tokens,
                "cost_usd": float(event.cost_usd),
            }
        if isinstance(event, DoneEvent):
            return {"type": "done"}
        return {"type": "unknown"}
    except Exception as e:
        import logging
        logging.exception(f"Error serializing event {type(event).__name__}: {e}")
        return {"type": "error", "message": f"Event serialization failed: {str(e)}"}


async def _stream_events(gen, session_id: str, uid: str, model: str):
    async for event in gen:
        if isinstance(event, UsageEvent):
            record_usage(
                session_id=session_id,
                uid=uid,
                model=model,
                input_tokens=event.input_tokens,
                output_tokens=event.output_tokens,
                cached_tokens=event.cached_tokens,
                cost_usd=event.cost_usd,
            )
            touch_session(session_id)
        yield f"data: {json.dumps(_event_to_dict(event), ensure_ascii=False)}\n\n"


def _get_registry() -> AgentRegistry:
    if _registry is None:
        raise HTTPException(status_code=503, detail={"error": "服務未就緒", "error_code": "SVC_001"})
    return _registry


async def _resolve_agent(token: str, session_id: str | None):
    """Return (agent, lock, resolved_session_id) or raise 401."""
    reg = _get_registry()
    if session_id:
        result = await reg.get_by_session(token, session_id)
        resolved_sid = session_id
    else:
        result = await reg.get(token)
        resolved_sid = reg.get_active_session_id(token)

    if result is None:
        raise HTTPException(
            status_code=401,
            detail={"error": "Token 無效或已過期，請重新呼叫 /login", "error_code": "AUTH_002"},
        )
    agent, lock = result
    return agent, lock, resolved_sid


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
        client = AsyncOpenAI(api_key=user_cfg.api_key or "EMPTY", base_url=user_cfg.base_url)
        provider = OpenAICompatProvider(client, user_cfg.model)
    else:
        provider = None  # AgentRegistry will use its default

    token = secrets.token_urlsafe(32)
    session_id = await _get_registry().register(token, body.uid, jsessionid, provider=provider)
    return LoginResponse(token=token, session_id=session_id)


_UPLOAD_ROOT = Path(__file__).parent.parent.parent / "uploads"


def _load_attachment(path_str: str | None) -> tuple[str | None, str]:
    """Return (base64_data, mime_type) or (None, '') if not usable."""
    if not path_str:
        return None, ""
    p = Path(path_str).resolve()
    try:
        _UPLOAD_ROOT.resolve()
        p.relative_to(_UPLOAD_ROOT.resolve())
    except ValueError:
        return None, ""
    if not p.exists() or not p.is_file():
        return None, ""
    mime = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
    if not mime.startswith("image/"):
        return None, ""
    return base64.b64encode(p.read_bytes()).decode(), mime


@app.post("/chat")
@limiter.limit("5/minute")
async def chat(request: Request, body: ChatRequest):
    agent, lock, session_id = await _resolve_agent(body.token, body.session_id)

    if lock.locked():
        raise HTTPException(status_code=429, detail="上一個請求仍在處理中")

    uid = _get_registry().get_uid(body.token) or ""
    image_b64, image_mime = _load_attachment(body.attachment_path)

    async def generate():
        async with lock:
            async for chunk in _stream_events(
                agent.step(body.message, image_b64=image_b64, image_mime=image_mime),
                session_id=session_id,
                uid=uid,
                model=agent._provider.model,
            ):
                yield chunk
            # Persist agent memory in OpenAI format so it survives server restarts
            # and is available to GET /api/history for display.
            from storage import save_history as _save
            _save(session_id, uid, agent._memory.history)

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/answer")
@limiter.limit("5/minute")
async def answer(request: Request, body: AnswerRequest):
    agent, lock, session_id = await _resolve_agent(body.token, body.session_id)

    if lock.locked():
        raise HTTPException(status_code=429, detail="上一個請求仍在處理中")

    uid = _get_registry().get_uid(body.token) or ""

    async def generate():
        async with lock:
            async for chunk in _stream_events(
                agent.answer_ask_user(body.selected),
                session_id=session_id,
                uid=uid,
                model=agent._provider.model,
            ):
                yield chunk
            from storage import save_history as _save
            _save(session_id, uid, agent._memory.history)

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    index = _WEB_DIST / "index.html"
    if not index.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(index)
