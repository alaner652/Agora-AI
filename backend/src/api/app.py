"""FastAPI application — TPCU chatbot REST API."""

from __future__ import annotations

import asyncio
import base64
import json
import mimetypes
import os
import secrets
import time
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

import summary
from agent import (
    AskUserEvent,
    DoneEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from log import bind_request, bind_uid, clear_request, get_logger
from session import login_with_profile as _fresh_login
from storage import (
    get_file,
    get_llm_config,
    init_db,
    init_files_db,
    init_messages_db,
    init_sessions_db,
    init_settings_db,
    init_usage_db,
    init_user_settings_db,
    record_and_check,
)

from .models import AnswerRequest, ChatRequest, LoginRequest, LoginResponse
from .routes import router as data_router
from .state import AgentRegistry

load_dotenv()

_LLM_API_KEY  = os.getenv("LLM_API_KEY", "")
_LLM_BASE_URL = os.getenv("LLM_BASE_URL")
_LLM_MODEL    = os.getenv("LLM_MODEL", "")

# 免費伺服器 LLM 額度（只作用在「沒帶自己金鑰」的使用者）。
# per-user <= 0 等同關閉免費額度 → 一律走 BYOK（並被友善引導，不是 401）。
_SERVER_LLM_AVAILABLE = bool(_LLM_API_KEY)
_FREE_DAILY_PER_USER  = int(os.getenv("FREE_DAILY_PER_USER", "20"))
_FREE_DAILY_GLOBAL    = int(os.getenv("FREE_DAILY_GLOBAL", "500"))

# 每日摘要排程：到點由跑著的後端自己彙整推 webhook（取代外部 cron）。
# DAILY_SUMMARY_AT 為 Asia/Taipei 的 HH:MM；留空關閉。需設好 webhook 才會啟用。
_DAILY_SUMMARY_AT = os.getenv("DAILY_SUMMARY_AT", "00:10")

# 慢請求門檻（毫秒）：超過則在 http_request log 標 slow=true —— 仍是 INFO，不是錯誤。
# TPCU 上游查詢常態 2~3s，門檻設高於此，避免正常查詢被當異常洗版告警。
_SLOW_REQUEST_MS = float(os.getenv("SLOW_REQUEST_MS", "4000"))

_registry: AgentRegistry | None = None

_log = get_logger("api")


async def _daily_summary_loop(hh: int, mm: int) -> None:
    """每日於 Asia/Taipei HH:MM 彙整前一日指標推 webhook。

    在 lifespan 內、與請求共用同一 event loop —— 專案跑著就會自己送，不靠 cron。
    彙整是阻塞 IO（讀檔/SQLite），丟到執行緒避免卡住事件迴圈。
    """
    while True:
        await asyncio.sleep(summary.seconds_until(hh, mm))
        try:
            day = summary.day_to_summarize()
            text, posted = await asyncio.to_thread(summary.send, day)
            _log.info("daily_summary", day=day, posted=posted)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            _log.warning("daily_summary_failed", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _registry
    init_db()
    init_user_settings_db()
    init_sessions_db()
    init_files_db()
    init_messages_db()
    init_settings_db()
    init_usage_db()
    llm = OpenAI(api_key=_LLM_API_KEY, base_url=_LLM_BASE_URL)
    _registry = AgentRegistry(llm=llm, model=_LLM_MODEL)
    app.state.registry = _registry

    # 每日摘要排程：設了時間且有 webhook 才啟用。
    summary_task = None
    hhmm = summary.parse_hhmm(_DAILY_SUMMARY_AT) if _DAILY_SUMMARY_AT else None
    if hhmm and summary.webhook_url():
        summary_task = asyncio.create_task(_daily_summary_loop(*hhmm))
        _log.info("daily_summary_scheduled", at=_DAILY_SUMMARY_AT)
    elif _DAILY_SUMMARY_AT and not summary.webhook_url():
        _log.info("daily_summary_disabled", reason="no webhook url")

    try:
        yield
    finally:
        if summary_task:
            summary_task.cancel()


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


class RequestContextMiddleware:
    """純 ASGI middleware：產生/沿用 request_id，記 access log，並把 request_id
    綁進 contextvars 貫穿整條鏈路。刻意不用 BaseHTTPMiddleware，以免緩衝 SSE 串流。
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        incoming = headers.get(b"x-request-id")
        request_id = incoming.decode("latin-1") if incoming else secrets.token_hex(8)
        client = scope.get("client")
        client_ip = client[0] if client else ""
        method = scope.get("method", "")
        path = scope.get("path", "")

        bind_request(request_id)
        start = time.monotonic()
        status_holder = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["code"] = message["status"]
                message.setdefault("headers", []).append(
                    (b"x-request-id", request_id.encode("latin-1"))
                )
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            status = status_holder["code"]
            # 分級由「狀態碼」決定，不由延遲決定：5xx 才是錯誤（→ errors.jsonl + 告警）；
            # 慢但成功的請求只是帶 slow 旗標的 INFO，不污染錯誤檔，也不觸發 webhook。
            log_fn = _log.error if status >= 500 else _log.info
            log_fn(
                "http_request",
                method=method,
                path=path,
                status=status,
                duration_ms=duration_ms,
                slow=duration_ms > _SLOW_REQUEST_MS,
                client_ip=client_ip,
            )
            clear_request()


app.add_middleware(RequestContextMiddleware)
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


async def _enforce_llm_quota(token: str, uid: str) -> None:
    """免費伺服器 LLM 的額度閘門（每則新訊息計一次）。

    BYOK（自帶金鑰）一律放行；用伺服器 LLM 的人若無可用金鑰或超出每日/全站
    額度，回 402 + error_code，前端據此引導去設定填自己的金鑰，而非 raw 401。
    """
    if _get_registry().is_byok(token):
        return
    if not _SERVER_LLM_AVAILABLE or _FREE_DAILY_PER_USER <= 0:
        _log.info("quota_block", error_code="LLM_001")
        raise HTTPException(status_code=402, detail={
            "error": "目前未提供共用 AI，請到設定填入自己的 AI 金鑰即可開始使用。",
            "error_code": "LLM_001",
        })
    ok, code = await asyncio.to_thread(
        record_and_check, uid, _FREE_DAILY_PER_USER, _FREE_DAILY_GLOBAL
    )
    if not ok:
        _log.info("quota_block", error_code=code)
        msg = (
            "今日免費額度已用完，明天再來，或到設定填入自己的 AI 金鑰即可無限使用。"
            if code == "QUOTA_001"
            else "今日免費體驗名額已滿，到設定填入自己的 AI 金鑰即可繼續使用。"
        )
        raise HTTPException(status_code=402, detail={"error": msg, "error_code": code})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "model": _LLM_MODEL}


@app.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    client_ip = request.client.host if request.client else ""
    try:
        jsessionid, profile = await _fresh_login(body.uid, body.pwd)
    except Exception as e:
        _log.warning("auth_login", uid=body.uid, ok=False, client_ip=client_ip, reason=str(e))
        raise HTTPException(status_code=401, detail={"error": f"登入失敗：{e}", "error_code": "AUTH_001"}) from e
    _log.info("auth_login", uid=body.uid, ok=True, client_ip=client_ip,
              has_profile=bool(profile))

    user_cfg = await asyncio.to_thread(get_llm_config, body.uid)
    if user_cfg:
        llm = OpenAI(api_key=user_cfg.api_key or "EMPTY", base_url=user_cfg.base_url)
        model = user_cfg.model
    else:
        llm = None   # AgentRegistry will use its default
        model = None

    token = secrets.token_urlsafe(32)
    reg = _get_registry()
    await reg.register(token, body.uid, jsessionid, llm=llm, model=model,
                       byok=user_cfg is not None, profile=profile)

    # 把當前學年學期存入 agent memory，讓需要學期參數的工具可以直接套用，
    # 不必每次都先呼叫 get_semester_options。
    if profile.semester_value:
        state = reg._store.get(token)
        if state:
            state.agent._memory.remember("last_semester", profile.semester_value)

    return LoginResponse(
        token=token,
        name=profile.name,
        semester_value=profile.semester_value,
    )


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
@limiter.limit("20/minute")
async def chat(request: Request, body: ChatRequest):
    agent, lock = await _get_agent_or_401(body.token)
    uid = _get_registry().get_uid(body.token) or ''
    bind_uid(uid)

    if lock.locked():
        raise HTTPException(status_code=429, detail="上一個請求仍在處理中")

    await _enforce_llm_quota(body.token, uid)

    image_b64, image_mime = await asyncio.to_thread(_load_attachment, body.file_id, uid)

    async def generate():
        async with lock:
            async for chunk in _stream_events(
                agent.step(body.message, image_b64=image_b64, image_mime=image_mime)
            ):
                yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/answer")
@limiter.limit("20/minute")
async def answer(request: Request, body: AnswerRequest):
    agent, lock = await _get_agent_or_401(body.token)

    if lock.locked():
        raise HTTPException(status_code=429, detail="上一個請求仍在處理中")

    async def generate():
        async with lock:
            async for chunk in _stream_events(agent.answer_ask_user(body.selected)):
                yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")
