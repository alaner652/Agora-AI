import time

import httpx

from log import get_logger

BASE_URL = "https://siw.tpcu.edu.tw"

_log = get_logger("client")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        verify=False,
        follow_redirects=True,
        timeout=30.0,
    )


async def _send(method: str, url: str, **kwargs) -> httpx.Response:
    """送出一次上游請求並記錄結構化 log（method/path/status/耗時）。

    cookies 等敏感欄位由 log.py 的 redaction processor 統一遮蔽，這裡不入 log。
    """
    t0 = time.monotonic()
    try:
        async with _client() as c:
            resp = await c.request(method, url, **kwargs)
    except Exception as e:
        duration_ms = round((time.monotonic() - t0) * 1000, 1)
        _log.warning("upstream_call", method=method, path=url,
                     duration_ms=duration_ms, error=type(e).__name__)
        raise
    duration_ms = round((time.monotonic() - t0) * 1000, 1)
    _log.info("upstream_call", method=method, path=url,
              status=resp.status_code, duration_ms=duration_ms)
    return resp


async def login(uid: str, pwd: str) -> str:
    """登入學校系統，回傳 JSESSIONID。"""
    resp = await _send(
        "POST", "/tsint/perchk.jsp",
        data={"hid_type": "S", "uid": uid, "pwd": pwd,
              "err": "N", "fncid": "", "ls_chochk": "N"},
    )

    if "無此帳號或密碼" in resp.text:
        raise ValueError("帳號或密碼錯誤")

    jsessionid = resp.cookies.get("JSESSIONID")
    if not jsessionid:
        raise ValueError("登入失敗：未取得 JSESSIONID")

    return jsessionid


async def activate_feature(jsessionid: str, fncid: str, spath: str) -> str:
    """通用第一階段：激活功能閘門，回傳含選項的表單 HTML。"""
    resp = await _send(
        "POST", "/tsint/system/sys001_00.jsp",
        params={"spath": spath},
        data={"fncid": fncid},
        cookies={"JSESSIONID": jsessionid},
    )
    _check_session(resp.text)
    return resp.text


async def post_data(jsessionid: str, url: str, data: dict) -> str:
    """通用第二階段：帶狀態送出 POST，回傳結果 HTML。"""
    resp = await _send(
        "POST", url,
        data=data,
        cookies={"JSESSIONID": jsessionid},
    )
    _check_session(resp.text)
    return resp.text


async def get_page(jsessionid: str, url: str, params: dict | None = None) -> str:
    """通用 GET，回傳頁面 HTML。"""
    resp = await _send(
        "GET", url,
        params=params,
        cookies={"JSESSIONID": jsessionid},
    )
    _check_session(resp.text)
    return resp.text


async def post_multipart(
    jsessionid: str,
    url: str,
    data: dict,
    file_bytes: bytes = b"",
    filename: str = "",
    content_type: str = "application/octet-stream",
) -> str:
    """送出 multipart/form-data POST（含可選檔案上傳）。"""
    files = {"uploadfile": (filename, file_bytes, content_type)}
    resp = await _send(
        "POST", url,
        data=data,
        files=files,
        cookies={"JSESSIONID": jsessionid},
    )
    _check_session(resp.text)
    return resp.text


def _check_session(text: str) -> None:
    if "重新登入" in text:
        _log.warning("upstream_session_expired")
        raise ValueError("Session 過期，請重新登入")
