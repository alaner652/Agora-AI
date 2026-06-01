"""Direct data endpoints — no LLM involved."""

from __future__ import annotations

import json
import os
import pathlib
import tempfile

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from openai import OpenAI

from actions.fetch_schedule.index import get_options as _sched_opts, get_schedule as _sched
from actions.fetch_absence.index import get_options as _abs_opts, get_absence as _absence
from actions.fetch_grades.index import get_grades as _grades
from actions.fetch_leaves.index import get_leaves as _leaves
from actions.apply_leave.index import apply_leave as _apply_leave, get_leave_form as _get_leave_form, LEAVE_TYPES
from actions.delete_leave.index import delete_leave as _delete_leave
from storage import save_history, load_history, clear_history, get_llm_config, set_llm_config, delete_llm_config, list_sessions, get_session_messages_slim, delete_session

from .models import LLMConfigRequest, LLMConfigResponse, LLMModelsRequest
from .state import AgentRegistry

_IMAGE_DIR = pathlib.Path(__file__).parent.parent.parent / "output"
_ALLOWED_IMAGE_TYPES = {"schedule", "absence", "grades"}

router = APIRouter()
_bearer = HTTPBearer()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_registry(request: Request) -> AgentRegistry:
    reg = request.app.state.registry
    if reg is None:
        raise HTTPException(status_code=503, detail={"error": "服務未就緒", "error_code": "SVC_001"})
    return reg


def _resolve_session(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
) -> str:
    reg = _get_registry(request)
    jsessionid = reg.get_jsessionid(creds.credentials)
    if jsessionid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期，請重新呼叫 /login", "error_code": "AUTH_002"})
    return jsessionid


def _resolve_uid(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
) -> str:
    reg = _get_registry(request)
    uid = reg.get_uid(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期", "error_code": "AUTH_002"})
    return uid


def _handle_exc(e: Exception) -> HTTPException:
    msg = str(e)
    if "Session 過期" in msg:
        return HTTPException(status_code=401, detail={"error": msg, "error_code": "NET_002"})
    if isinstance(e, httpx.TimeoutException):
        return HTTPException(status_code=504, detail={"error": "學校系統連線逾時", "error_code": "NET_001"})
    if isinstance(e, httpx.NetworkError):
        return HTTPException(status_code=502, detail={"error": "學校系統連線失敗", "error_code": "NET_003"})
    return HTTPException(status_code=500, detail={"error": msg, "error_code": "UNKNOWN"})


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------

@router.get("/semester-options")
async def semester_options(jsessionid: str = Depends(_resolve_session)):
    try:
        return await _sched_opts(jsessionid)
    except Exception as e:
        raise _handle_exc(e)


@router.get("/schedule")
async def schedule(semester: str, jsessionid: str = Depends(_resolve_session)):
    try:
        entries = await _sched(jsessionid, semester)
        return {"entries": entries}
    except Exception as e:
        raise _handle_exc(e)


# ---------------------------------------------------------------------------
# Absence
# ---------------------------------------------------------------------------

@router.get("/absence/options")
async def absence_options(jsessionid: str = Depends(_resolve_session)):
    try:
        return await _abs_opts(jsessionid)
    except Exception as e:
        raise _handle_exc(e)


@router.get("/absence")
async def absence(
    semester: str,
    start: str = "",
    end: str = "",
    type: str = "00",
    jsessionid: str = Depends(_resolve_session),
):
    try:
        entries = await _absence(jsessionid, semester, leave=type, start=start, end=end)
        return {"entries": entries}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise _handle_exc(e)


# ---------------------------------------------------------------------------
# Grades
# ---------------------------------------------------------------------------

@router.get("/grades")
async def grades(jsessionid: str = Depends(_resolve_session)):
    try:
        entries = await _grades(jsessionid)
        return {"entries": entries}
    except Exception as e:
        raise _handle_exc(e)


# ---------------------------------------------------------------------------
# Leaves
# ---------------------------------------------------------------------------

@router.get("/leaves")
async def leaves(
    start: str,
    end: str,
    jsessionid: str = Depends(_resolve_session),
):
    try:
        items = await _leaves(jsessionid, start, end)
        return {"leaves": items}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise _handle_exc(e)


# ---------------------------------------------------------------------------
# Leave form & application
# ---------------------------------------------------------------------------

@router.get("/leave-form")
async def leave_form(date: str = "", jsessionid: str = Depends(_resolve_session)):
    try:
        result = await _get_leave_form(jsessionid, date or None)
        result["leave_types"] = LEAVE_TYPES
        return result
    except Exception as e:
        raise _handle_exc(e)


@router.post("/apply-leave")
async def apply_leave_endpoint(
    date:         str                = Form(...),
    periods_json: str                = Form(...),
    leave_id:     str                = Form(...),
    reason:       str                = Form(...),
    attachment:   UploadFile | None  = File(None),
    jsessionid:   str                = Depends(_resolve_session),
):
    periods = json.loads(periods_json)
    image_path: str | None = None
    if attachment and attachment.filename:
        suffix = pathlib.Path(attachment.filename).suffix.lower()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(await attachment.read())
        tmp.close()
        image_path = tmp.name
    try:
        result = await _apply_leave(
            jsessionid=jsessionid,
            date=date,
            periods=periods,
            leave_id=leave_id,
            reason=reason,
            image_path=image_path,
        )
        return result
    except Exception as e:
        raise _handle_exc(e)
    finally:
        if image_path:
            os.unlink(image_path)


class DeleteLeaveBody(BaseModel):
    stdkey: str
    barcode: str
    start_date: str
    end_date: str


@router.post("/delete-leave")
async def delete_leave_endpoint(
    body: DeleteLeaveBody,
    jsessionid: str = Depends(_resolve_session),
):
    try:
        result = await _delete_leave(
            jsessionid=jsessionid,
            stdkey=body.stdkey,
            barcode=body.barcode,
            sdate=body.start_date,
            edate=body.end_date,
        )
        return result
    except Exception as e:
        raise _handle_exc(e)


# ---------------------------------------------------------------------------
# AI-rendered images
# ---------------------------------------------------------------------------

@router.get("/image/{image_type}")
async def rendered_image(
    image_type: str,
    _jsessionid: str = Depends(_resolve_session),
):
    if image_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=404, detail={"error": "未知圖片類型", "error_code": "NOT_FOUND"})
    path = _IMAGE_DIR / f"{image_type}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail={"error": "圖片不存在，請先透過 AI 助理產生", "error_code": "NOT_FOUND"})
    return FileResponse(path, media_type="image/png")


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------

class SaveHistoryBody(BaseModel):
    messages: list[dict]


@router.get("/history")
async def get_history(uid: str = Depends(_resolve_uid)):
    return {"messages": load_history(uid)}


@router.post("/history")
async def post_history(body: SaveHistoryBody, uid: str = Depends(_resolve_uid)):
    save_history(uid, body.messages)
    return {"ok": True}


@router.delete("/history")
async def delete_history(uid: str = Depends(_resolve_uid)):
    clear_history(uid)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Session history
# ---------------------------------------------------------------------------

@router.post("/sessions/new")
async def new_session_endpoint(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    reg = _get_registry(request)
    uid = reg.get_uid(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效", "error_code": "AUTH_002"})
    await reg.new_session(creds.credentials)
    clear_history(uid)
    return {"ok": True}


@router.get("/sessions")
async def get_sessions(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    reg = _get_registry(request)
    uid = reg.get_uid(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效", "error_code": "AUTH_002"})
    return {
        "sessions": list_sessions(uid),
        "current_session_id": reg.get_current_session_id(creds.credentials),
    }


@router.post("/sessions/{session_id}/switch")
async def switch_session_endpoint(
    session_id: str,
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    reg = _get_registry(request)
    uid = reg.get_uid(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效", "error_code": "AUTH_002"})
    messages = get_session_messages_slim(session_id, uid)
    if messages is None:
        raise HTTPException(status_code=404, detail={"error": "Session 不存在", "error_code": "NOT_FOUND"})
    await reg.restore_session(creds.credentials, messages)
    save_history(uid, messages)
    return {"messages": messages}


@router.delete("/sessions/{session_id}")
async def delete_session_endpoint(session_id: str, uid: str = Depends(_resolve_uid)):
    ok = delete_session(session_id, uid)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "Session 不存在", "error_code": "NOT_FOUND"})
    return {"ok": True}


# ---------------------------------------------------------------------------
# File upload (for leave attachments)
# ---------------------------------------------------------------------------

_UPLOAD_DIR = pathlib.Path(__file__).parent.parent.parent / "uploads"
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# LLM settings
# ---------------------------------------------------------------------------

@router.get("/settings/llm", response_model=LLMConfigResponse)
async def get_llm_settings(uid: str = Depends(_resolve_uid)):
    cfg = get_llm_config(uid)
    if cfg is None:
        return LLMConfigResponse(has_custom_config=False)
    return LLMConfigResponse(has_custom_config=True, base_url=cfg.base_url, model=cfg.model)


@router.put("/settings/llm", response_model=LLMConfigResponse)
async def put_llm_settings(body: LLMConfigRequest, uid: str = Depends(_resolve_uid)):
    set_llm_config(uid, base_url=body.base_url, api_key=body.api_key, model=body.model)
    return LLMConfigResponse(has_custom_config=True, base_url=body.base_url, model=body.model)


@router.delete("/settings/llm")
async def delete_llm_settings(uid: str = Depends(_resolve_uid)):
    delete_llm_config(uid)
    return {"ok": True}


@router.post("/settings/llm/test")
async def test_llm_settings(body: LLMConfigRequest, uid: str = Depends(_resolve_uid)):
    try:
        client = OpenAI(api_key=body.api_key or "EMPTY", base_url=body.base_url)
        resp = client.chat.completions.create(
            model=body.model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
        )
        reply = resp.choices[0].message.content or ""
        return {"ok": True, "reply": reply}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/settings/llm/models")
async def list_llm_models(body: LLMModelsRequest, uid: str = Depends(_resolve_uid)):
    try:
        client = OpenAI(api_key=body.api_key or "EMPTY", base_url=body.base_url)
        result = client.models.list()
        ids = sorted(m.id for m in result.data)
        return {"ok": True, "models": ids}
    except Exception as e:
        return {"ok": False, "models": [], "error": str(e)}


# ---------------------------------------------------------------------------
# File upload (for leave attachments)
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    uid: str = Depends(_resolve_uid),
):
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail={"error": "檔案過大（上限 10 MB）"})

    dest_dir = _UPLOAD_DIR / uid
    dest_dir.mkdir(parents=True, exist_ok=True)

    safe_name = pathlib.Path(file.filename or "upload").name
    dest = dest_dir / safe_name
    dest.write_bytes(content)

    return {"path": str(dest), "name": safe_name}
