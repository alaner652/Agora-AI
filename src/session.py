import json
import pathlib
from datetime import datetime

from client import get_page, login

_CACHE_FILE = pathlib.Path(".cache/session.json")
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


async def _validate(jsessionid: str) -> bool:
    try:
        html = await get_page(jsessionid, _VALIDATE_URL)
        return "重新登入" not in html
    except Exception:
        return False


async def get_session(uid: str) -> str:
    """取得有效的 JSESSIONID。有暫存且有效直接回傳；否則提示輸入密碼後重新登入。"""
    cached = _load()
    if cached:
        print("驗證 session 中...", end=" ", flush=True)
        if await _validate(cached):
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
