from __future__ import annotations

import json
import os
import pathlib
import stat
from collections.abc import Awaitable, Callable
from datetime import datetime

from client import get_page, login

_CACHE_FILE = pathlib.Path(".cache/session.json")
_API_CACHE_DIR = pathlib.Path(".cache/sessions")
_VALIDATE_URL = "/tsint/ck_pro/ck001_02.jsp"


def _load() -> str | None:
    if not _CACHE_FILE.exists():
        return None
    try:
        return json.loads(_CACHE_FILE.read_text(encoding="utf-8")).get("jsessionid")
    except Exception:
        return None


def _save(jsessionid: str) -> None:
    _CACHE_FILE.parent.mkdir(exist_ok=True)
    _CACHE_FILE.write_text(
        json.dumps(
            {"jsessionid": jsessionid, "saved_at": datetime.now().isoformat(timespec="seconds")},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    os.chmod(_CACHE_FILE, stat.S_IRUSR | stat.S_IWUSR)


async def _validate(jsessionid: str) -> bool:
    try:
        html = await get_page(jsessionid, _VALIDATE_URL)
        return "重新登入" not in html
    except Exception:
        return False


async def get_session(
    uid: str,
    extra_validate: Callable[[str], Awaitable[bool]] | None = None,
) -> str:
    """取得有效的 JSESSIONID。有暫存且有效直接回傳；否則提示輸入密碼後重新登入。

    extra_validate: 可選的額外驗證函式，由呼叫端決定「有效」的標準
    （例如 chatbot 會額外確認課表 gateway 可用）。
    """
    cached = _load()
    if cached:
        print("驗證 session 中...", end=" ", flush=True)
        ok = await _validate(cached)
        if ok and extra_validate:
            ok = await extra_validate(cached)
        if ok:
            print("有效")
            return cached
        print("已過期")

    print(f"需要登入（帳號：{uid}）")
    pwd = input("請輸入密碼（不會儲存）: ")
    jsessionid = await login(uid, pwd)
    _save(jsessionid)
    print("登入成功，session 已暫存。\n")
    return jsessionid


async def refresh(uid: str) -> str:
    """Session 中途失效時呼叫，強制重新登入。"""
    print("\nSession 已失效，需要重新登入。")
    pwd = input(f"請輸入 {uid} 的密碼: ")
    jsessionid = await login(uid, pwd)
    _save(jsessionid)
    return jsessionid


# ---------------------------------------------------------------------------
# API-friendly versions (no print / input)
# ---------------------------------------------------------------------------

def _api_cache_file(uid: str) -> pathlib.Path:
    return _API_CACHE_DIR / f"{uid}.json"


def _api_load(uid: str) -> str | None:
    f = _api_cache_file(uid)
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8")).get("jsessionid")
    except Exception:
        return None


def _api_save(uid: str, jsessionid: str) -> None:
    _API_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    f = _api_cache_file(uid)
    f.write_text(
        json.dumps(
            {"jsessionid": jsessionid, "saved_at": datetime.now().isoformat(timespec="seconds")},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    os.chmod(f, stat.S_IRUSR | stat.S_IWUSR)


async def get_session_api(uid: str, pwd: str) -> str:
    """取得有效 JSESSIONID（API 用途，無 print/input）。
    有效快取直接回傳；否則用傳入的 pwd 登入。
    """
    cached = _api_load(uid)
    if cached and await _validate(cached):
        return cached
    jsessionid = await login(uid, pwd)
    _api_save(uid, jsessionid)
    return jsessionid


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
