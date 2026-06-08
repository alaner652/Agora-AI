from __future__ import annotations

import json
import os
import pathlib
import stat
from datetime import datetime

from client import get_page, login
from utils.date import TZ

_API_CACHE_DIR = pathlib.Path(".cache/sessions")
_VALIDATE_URL = "/tsint/ck_pro/ck001_02.jsp"


async def _validate(jsessionid: str) -> bool:
    try:
        html = await get_page(jsessionid, _VALIDATE_URL)
        return "重新登入" not in html
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Per-uid 快取的 session（後端用；登入憑證由呼叫端傳入，全程無互動 / print）
# ---------------------------------------------------------------------------

def _api_cache_file(uid: str) -> pathlib.Path:
    return _API_CACHE_DIR / f"{uid}.json"


def _api_save(uid: str, jsessionid: str) -> None:
    _API_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    f = _api_cache_file(uid)
    f.write_text(
        json.dumps(
            {"jsessionid": jsessionid, "saved_at": datetime.now(TZ).isoformat(timespec="seconds")},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    os.chmod(f, stat.S_IRUSR | stat.S_IWUSR)


async def refresh_api(uid: str, pwd: str) -> str:
    """Session 中途失效時呼叫（API 用途，無 print/input）。"""
    jsessionid = await login(uid, pwd)
    # 防呆：學校忙線時 perchk 可能回「未認證頁」卻仍帶 JSESSIONID cookie，
    # login() 只擋「帳密錯誤」抓不到這種。登入後立刻用既有 _validate 驗一次，
    # 未通過就明確報錯且不存檔——避免「假登入成功 → 首次查詢就被倒回登入頁」。
    if not await _validate(jsessionid):
        raise ValueError("登入未成功（學校系統忙線或暫時無法驗證），請稍後再試")
    _api_save(uid, jsessionid)
    return jsessionid
