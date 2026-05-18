import httpx

BASE_URL = "https://siw.tpcu.edu.tw"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=BASE_URL, verify=False, follow_redirects=True)


async def login(uid: str, pwd: str) -> str:
    """登入學校系統，回傳 JSESSIONID。"""
    async with _client() as c:
        resp = await c.post(
            "/tsint/perchk.jsp",
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
    async with _client() as c:
        resp = await c.post(
            "/tsint/system/sys001_00.jsp",
            params={"spath": spath},
            data={"fncid": fncid},
            cookies={"JSESSIONID": jsessionid},
        )
    _check_session(resp.text)
    return resp.text


async def post_data(jsessionid: str, url: str, data: dict) -> str:
    """通用第二階段：帶狀態送出 POST，回傳結果 HTML。"""
    async with _client() as c:
        resp = await c.post(
            url,
            data=data,
            cookies={"JSESSIONID": jsessionid},
        )
    _check_session(resp.text)
    return resp.text


async def get_page(jsessionid: str, url: str) -> str:
    """通用 GET，回傳頁面 HTML。"""
    async with _client() as c:
        resp = await c.get(
            url,
            cookies={"JSESSIONID": jsessionid},
        )
    _check_session(resp.text)
    return resp.text


def _check_session(text: str) -> None:
    if "重新登入" in text:
        raise ValueError("Session 過期，請重新登入")
