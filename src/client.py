import httpx

BASE_URL = "https://siw.tpcu.edu.tw"

_COOKIES = {"JSESSIONID": ""}  # template, filled per-call


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


async def fetch_schedule_form(jsessionid: str) -> str:
    """取得課表選擇表單 HTML（含可用學期選項）。"""
    async with _client() as c:
        resp = await c.post(
            "/tsint/system/sys001_00.jsp",
            params={"spath": "ag_pro/ag222.jsp?"},
            data={"fncid": "AG222"},
            cookies={"JSESSIONID": jsessionid},
        )
    _check_session(resp.text)
    return resp.text


async def fetch_schedule(jsessionid: str, yms: str = "114,2") -> str:
    """抓取課表的原始 HTML。"""
    year, semester = yms.split(",")
    async with _client() as c:
        resp = await c.post(
            "/tsint/ag_pro/ag222.jsp",
            data={"yms": yms, "spath": "ag_pro/ag222.jsp?",
                  "arg01": year.strip(), "arg02": semester.strip()},
            cookies={"JSESSIONID": jsessionid},
        )
    _check_session(resp.text)
    return resp.text


async def fetch_absence_form(jsessionid: str) -> str:
    """GET 缺曠查詢表單，回傳 HTML（含可用學期與假別選項）。"""
    async with _client() as c:
        resp = await c.get(
            "/tsint/ak_pro/ak002_01.jsp",
            cookies={"JSESSIONID": jsessionid},
        )
    _check_session(resp.text)
    return resp.text


async def fetch_absence(
    jsessionid: str,
    yms: str,
    leave_type: str,
    start: str,   # ROC compact, e.g. "1150101"
    end: str,     # ROC compact, e.g. "1150518"
) -> str:
    """POST 缺曠查詢，回傳結果 HTML。"""
    async with _client() as c:
        resp = await c.post(
            "/tsint/ak_pro/ak002_01.jsp",
            data={
                "yms":         yms,
                "leave":       leave_type,
                "etxt_syear":  start[:3],
                "etxt_smonth": start[3:5],
                "etxt_sday":   start[5:7],
                "etxt_eyear":  end[:3],
                "etxt_emonth": end[3:5],
                "etxt_eday":   end[5:7],
                "spath":       "",
                "sdate":       start,
                "edate":       end,
            },
            cookies={"JSESSIONID": jsessionid},
        )
    _check_session(resp.text)
    return resp.text


def _check_session(text: str) -> None:
    if "重新登入" in text:
        raise ValueError("Session 過期，請重新登入")
