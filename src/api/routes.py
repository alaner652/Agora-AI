"""Direct data endpoints — no LLM involved."""

from __future__ import annotations

import pathlib

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from actions.fetch_schedule.index import get_options as _sched_opts, get_schedule as _sched
from actions.fetch_absence.index import get_options as _abs_opts, get_absence as _absence
from actions.fetch_grades.index import get_grades as _grades
from actions.fetch_leaves.index import get_leaves as _leaves

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
