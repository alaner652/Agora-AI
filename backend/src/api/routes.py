"""Direct data endpoints — no LLM involved."""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import tempfile

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import OpenAI
from pydantic import BaseModel

from actions.apply_leave.index import LEAVE_TYPES
from actions.apply_leave.index import apply_leave as _apply_leave
from actions.apply_leave.index import get_leave_form as _get_leave_form
from actions.delete_leave.index import delete_leave as _delete_leave
from actions.fetch_absence.index import get_absence as _absence
from actions.fetch_absence.index import get_options as _abs_opts
from actions.fetch_grades.index import get_grades as _grades
from actions.fetch_leaves.index import get_leaves as _leaves
from actions.fetch_schedule.index import get_options as _sched_opts
from actions.fetch_schedule.index import get_schedule as _sched
from session import _validate as _validate_session
from storage import (
    clear_history,
    delete_all_sessions,
    delete_llm_config,
    delete_session,
    get_conversation_messages,
    get_file,
    get_llm_config,
    get_session_display_messages,
    get_session_messages_slim,
    get_settings,
    get_viewed_session_id,
    insert_file,
    list_sessions,
    load_history,
    patch_settings,
    save_history,
    set_llm_config,
)

from .models import (
    FullSettingsResponse,
    LLMBehaviourSettings,
    LLMConfigRequest,
    LLMConfigResponse,
    LLMModelsRequest,
    SettingsPatch,
    UsageResponse,
    UserSettings,
)
from .state import AgentRegistry

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


async def _resolve_session(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
) -> str:
    reg = _get_registry(request)
    jsessionid = await reg.get_jsessionid_checked(creds.credentials)
    if jsessionid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期，請重新呼叫 /login", "error_code": "AUTH_002"})
    return jsessionid


async def _resolve_uid(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
) -> str:
    reg = _get_registry(request)
    uid = await reg.get_uid_checked(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期", "error_code": "AUTH_002"})
    return uid


async def _handle_exc(e: Exception, jsessionid: str | None = None) -> HTTPException:
    msg = str(e)
    if "Session 過期" in msg:
        return HTTPException(status_code=401, detail={"error": msg, "error_code": "NET_002"})
    if isinstance(e, httpx.TimeoutException):
        if jsessionid and not await _validate_session(jsessionid):
            return HTTPException(status_code=401, detail={"error": "Session 已過期（連線逾時），請重新登入", "error_code": "NET_002"})
        return HTTPException(status_code=504, detail={"error": "學校系統連線逾時", "error_code": "NET_001"})
    if isinstance(e, httpx.NetworkError):
        return HTTPException(status_code=502, detail={"error": "學校系統連線失敗", "error_code": "NET_003"})
    return HTTPException(status_code=500, detail={"error": msg, "error_code": "UNKNOWN"})


# ---------------------------------------------------------------------------
# Student profile info
# ---------------------------------------------------------------------------

@router.get("/info")
async def student_info(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    """回傳登入時從 perchk 解析的學生個人資訊與當前學年學期。"""
    reg = _get_registry(request)
    profile = reg.get_profile(creds.credentials)
    if profile is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期", "error_code": "AUTH_002"})
    return {
        "name": profile.name,
        "student_id": profile.student_id,
        "year": profile.year,
        "semester": profile.semester,
        "semester_value": profile.semester_value,
    }


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------

@router.get("/semester-options")
async def semester_options(jsessionid: str = Depends(_resolve_session)):
    try:
        return await _sched_opts(jsessionid)
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e


@router.get("/schedule")
async def schedule(semester: str, jsessionid: str = Depends(_resolve_session)):
    try:
        entries = await _sched(jsessionid, semester)
        return {"entries": entries}
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e


# ---------------------------------------------------------------------------
# Absence
# ---------------------------------------------------------------------------

@router.get("/absence/options")
async def absence_options(jsessionid: str = Depends(_resolve_session)):
    try:
        return await _abs_opts(jsessionid)
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e


@router.get("/absence/summary")
async def absence_summary(jsessionid: str = Depends(_resolve_session)):
    """Return count of unexcused absences (缺曠) for the current semester."""
    try:
        opts = await _abs_opts(jsessionid)
        semesters = opts.get("semesters", [])
        current = next((s["value"] for s in semesters if s.get("selected")), None)
        if not current and semesters:
            current = semesters[0]["value"]
        if not current:
            return {"total": 0, "semester": ""}
        entries = await _absence(jsessionid, current, leave="00")
        # Count only truancy (缺曠) entries
        truancy = [e for e in entries if e.get("type") == "缺曠"]
        return {"total": len(truancy), "semester": current}
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e


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
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e


# ---------------------------------------------------------------------------
# Grades
# ---------------------------------------------------------------------------

@router.get("/grades")
async def grades(jsessionid: str = Depends(_resolve_session)):
    try:
        entries = await _grades(jsessionid)
        return {"entries": entries}
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e


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
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e


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
        raise await _handle_exc(e, jsessionid) from e


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
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)  # noqa: SIM115 (檔案於請求結束才刪)
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
        raise await _handle_exc(e, jsessionid) from e
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
    # IDOR 防護：確認這張假單真的屬於當前登入者本人。
    # 用本人的 JSESSIONID 重查假單列表（查詢範圍即假單自身日期，故假單必落在
    # 範圍內），要刪的 barcode 必須出現在本人名下，否則拒絕——杜絕有人帶他人的
    # stdkey/barcode 刪掉別人的假單（gateway 補學校端的 IDOR）。能否刪除由學校
    # 自行判斷，這裡只把關「擁有權」。日期只取數字轉 compact YYYMMDD 供查詢；
    # 實際 delete 呼叫沿用原值不變。
    q_sdate = "".join(c for c in body.start_date if c.isdigit())
    q_edate = "".join(c for c in body.end_date if c.isdigit())
    try:
        own = await _leaves(jsessionid, q_sdate, q_edate)
    except Exception as e:
        raise await _handle_exc(e, jsessionid) from e
    if not any(e.get("barcode") == body.barcode for e in own):
        raise HTTPException(
            status_code=403,
            detail={"error": "查無此假單或無權刪除", "error_code": "FORBIDDEN"},
        )

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
        raise await _handle_exc(e, jsessionid) from e


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------

class SaveHistoryBody(BaseModel):
    messages: list[dict]


@router.get("/history")
async def get_history(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    reg = _get_registry(request)
    uid = await reg.get_uid_checked(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期", "error_code": "AUTH_002"})
    session_id = reg.get_current_session_id(creds.credentials)
    if session_id:
        display = await asyncio.to_thread(get_session_display_messages, session_id, uid)
        if display:
            return {"messages": display, "viewed_session_id": session_id}
    messages = await asyncio.to_thread(load_history, uid)
    viewed_session_id = await asyncio.to_thread(get_viewed_session_id, uid)
    return {"messages": messages, "viewed_session_id": viewed_session_id}


@router.post("/history")
async def post_history(body: SaveHistoryBody, uid: str = Depends(_resolve_uid)):
    await asyncio.to_thread(save_history, uid, body.messages)
    return {"ok": True}


async def _clear_current_conversation(reg, token: str, uid: str) -> None:
    """Wipe the user's *current* conversation everywhere it lives.

    GET /history reconstructs the live conversation from the in-memory agent's
    current session, so clearing the SQLite stores alone is not enough — the
    agent session must be rotated too, otherwise the "deleted" conversation
    reappears. Order matters: rotate first (flushes the old session to the DB),
    then delete that session's rows, then clear the live snapshot.
    """
    sid = reg.get_current_session_id(token)
    await reg.new_session(token)
    if sid:
        await asyncio.to_thread(delete_session, sid, uid)
    await asyncio.to_thread(clear_history, uid)


async def _clear_all_conversations(reg, token: str, uid: str) -> int:
    """Wipe every conversation: rotate the live agent, then nuke all stores."""
    await reg.new_session(token)
    deleted = await asyncio.to_thread(delete_all_sessions, uid)
    await asyncio.to_thread(clear_history, uid)
    return deleted


@router.delete("/history")
async def delete_history(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    reg = _get_registry(request)
    uid = await reg.get_uid_checked(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期", "error_code": "AUTH_002"})
    await _clear_current_conversation(reg, creds.credentials, uid)
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
    await asyncio.to_thread(clear_history, uid)
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
    sessions = await asyncio.to_thread(list_sessions, uid)
    return {
        "sessions": sessions,
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
    slim = await asyncio.to_thread(get_session_messages_slim, session_id, uid)
    if slim is None:
        raise HTTPException(status_code=404, detail={"error": "Session 不存在", "error_code": "NOT_FOUND"})
    await reg.restore_session(creds.credentials, slim)
    display = await asyncio.to_thread(get_session_display_messages, session_id, uid) or slim
    await asyncio.to_thread(save_history, uid, display, viewed_session_id=session_id)
    return {"messages": display}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages_detail(session_id: str, uid: str = Depends(_resolve_uid)):
    messages = await asyncio.to_thread(get_conversation_messages, session_id, uid)
    if messages is None:
        raise HTTPException(status_code=404, detail={"error": "Session 不存在", "error_code": "NOT_FOUND"})
    return {"messages": messages}


@router.delete("/sessions/{session_id}")
async def delete_session_endpoint(session_id: str, uid: str = Depends(_resolve_uid)):
    ok = await asyncio.to_thread(delete_session, session_id, uid)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "Session 不存在", "error_code": "NOT_FOUND"})
    return {"ok": True}


# ---------------------------------------------------------------------------
# File upload (for leave attachments)
# ---------------------------------------------------------------------------

_UPLOAD_DIR = pathlib.Path(__file__).parent.parent.parent / "uploads"
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# Unified user settings (non-sensitive JSON)
# ---------------------------------------------------------------------------

def _to_user_settings(raw: dict) -> UserSettings:
    llm = raw.get("llm", {})
    return UserSettings(llm=LLMBehaviourSettings(
        temperature=llm.get("temperature", 0.7),
        max_tokens=llm.get("max_tokens", 2048),
        system_prompt=llm.get("system_prompt", ""),
        context_length=llm.get("context_length", 20),
    ))


@router.get("/settings", response_model=FullSettingsResponse)
async def get_full_settings(uid: str = Depends(_resolve_uid)):
    cfg = await asyncio.to_thread(get_llm_config, uid)
    raw_settings = await asyncio.to_thread(get_settings, uid)
    return FullSettingsResponse(
        uid=uid,
        settings=_to_user_settings(raw_settings),
        llm_status=LLMConfigResponse(
            has_custom_config=cfg is not None,
            base_url=cfg.base_url if cfg else "",
            model=cfg.model if cfg else "",
        ),
    )


@router.patch("/settings", response_model=UserSettings)
async def patch_user_settings(body: SettingsPatch, uid: str = Depends(_resolve_uid)):
    patch: dict = {}
    if body.llm is not None:
        patch["llm"] = {k: v for k, v in body.llm.model_dump().items() if v is not None}
    merged = await asyncio.to_thread(patch_settings, uid, patch)
    return _to_user_settings(merged)


@router.delete("/settings/history")
async def delete_history_settings(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    reg = _get_registry(request)
    uid = await reg.get_uid_checked(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期", "error_code": "AUTH_002"})
    await _clear_current_conversation(reg, creds.credentials, uid)
    return {"ok": True}


@router.delete("/settings/sessions")
async def delete_all_sessions_settings(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    request: Request = None,
):
    reg = _get_registry(request)
    uid = await reg.get_uid_checked(creds.credentials)
    if uid is None:
        raise HTTPException(status_code=401, detail={"error": "Token 無效或已過期", "error_code": "AUTH_002"})
    deleted = await _clear_all_conversations(reg, creds.credentials, uid)
    return {"deleted": deleted}


# ---------------------------------------------------------------------------
# LLM settings
# ---------------------------------------------------------------------------

@router.get("/settings/llm", response_model=LLMConfigResponse)
async def get_llm_settings(uid: str = Depends(_resolve_uid)):
    cfg = await asyncio.to_thread(get_llm_config, uid)
    if cfg is None:
        return LLMConfigResponse(has_custom_config=False)
    return LLMConfigResponse(has_custom_config=True, base_url=cfg.base_url, model=cfg.model)


@router.put("/settings/llm", response_model=LLMConfigResponse)
async def put_llm_settings(body: LLMConfigRequest, uid: str = Depends(_resolve_uid)):
    await asyncio.to_thread(set_llm_config, uid, base_url=body.base_url, api_key=body.api_key, model=body.model)
    return LLMConfigResponse(has_custom_config=True, base_url=body.base_url, model=body.model)


@router.delete("/settings/llm")
async def delete_llm_settings(uid: str = Depends(_resolve_uid)):
    await asyncio.to_thread(delete_llm_config, uid)
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


_USAGE_LOG_DIR = pathlib.Path(__file__).parent.parent.parent / "logs" / "api"


def _aggregate_token_usage(uid: str) -> UsageResponse:
    log_dir = _USAGE_LOG_DIR / uid
    day_stats: dict[str, dict[str, int]] = {}

    if log_dir.exists():
        for f in log_dir.glob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            date = (data.get("session_id") or "")[:10]
            if len(date) != 10:
                continue
            stats = day_stats.setdefault(date, {"prompt": 0, "completion": 0, "turns": 0})
            for turn in data.get("turns", []):
                tokens = ((turn.get("_meta") or {}).get("tokens")) or {}
                stats["prompt"] += int(tokens.get("prompt") or 0)
                stats["completion"] += int(tokens.get("completion") or 0)
                stats["turns"] += 1

    sorted_days = sorted(day_stats.items(), reverse=True)[:7]
    days = [{"date": d, **s} for d, s in sorted_days]
    return UsageResponse(
        days=days,
        total_prompt=sum(d["prompt"] for d in days),
        total_completion=sum(d["completion"] for d in days),
        total_turns=sum(d["turns"] for d in days),
    )


@router.get("/settings/usage", response_model=UsageResponse)
async def get_token_usage(uid: str = Depends(_resolve_uid)):
    return await asyncio.to_thread(_aggregate_token_usage, uid)


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

    file_id = await asyncio.to_thread(insert_file, uid, safe_name, str(dest), len(content))
    return {"file_id": file_id, "filename": safe_name}


@router.get("/files/{file_id}")
async def serve_file(file_id: str, uid: str = Depends(_resolve_uid)):
    meta = await asyncio.to_thread(get_file, file_id, uid)
    if meta is None:
        raise HTTPException(status_code=403, detail={"error": "檔案不存在或無權限", "error_code": "FORBIDDEN"})
    p = pathlib.Path(meta["storage_path"])
    if not p.exists():
        raise HTTPException(status_code=404, detail={"error": "檔案已刪除", "error_code": "NOT_FOUND"})
    return FileResponse(p, media_type=meta["mime_type"], filename=meta["filename"])
