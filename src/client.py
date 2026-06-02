import os
import pathlib
import ssl
import time

import certifi
import httpx

from log import get_logger

# 學校系統端點。預設公網網域；之後若改走內網，建議用 split-DNS 讓內部
# DNS 把 siw.tpcu.edu.tw 指向內網 IP（沿用網域名，憑證驗證照舊有效），
# 或在此以環境變數覆寫。改設定即可，不必動程式。
BASE_URL = os.getenv("SCHOOL_BASE_URL", "https://siw.tpcu.edu.tw")

_log = get_logger("client")

# 學校伺服器只送出 leaf 憑證、漏掉中繼憑證（TWCA Secure SSL CA），
# 導致 OpenSSL 無法建鏈而驗證失敗——但憑證本身是公信 CA（TWCA）簽發的。
# 解法：以 certifi 為信任根，補上隨附的中繼憑證讓鏈完整，即可正常驗證
# leaf + 主機名（解除 verify=False 的 MITM 風險），且憑證續期不受影響。
_INTERMEDIATE = pathlib.Path(__file__).parent / "certs" / "tpcu_intermediate.pem"
_ssl_ctx = ssl.create_default_context(cafile=certifi.where())
_ssl_ctx.load_verify_locations(cafile=str(_INTERMEDIATE))


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        verify=_ssl_ctx,
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
    log_fn = _log.warning if resp.status_code >= 400 else _log.info
    log_fn("upstream_call", method=method, path=url,
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


_SESSION_EXPIRED_MARKERS = ("重新登入", "Please Logon", "Please Login")


def _check_session(text: str) -> None:
    if any(m in text for m in _SESSION_EXPIRED_MARKERS):
        _log.warning("upstream_session_expired")
        raise ValueError("Session 過期，請重新登入")
