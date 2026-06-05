from client import login as _login


async def login(uid: str, pwd: str) -> dict:
    """登入學校系統，回傳 jsessionid。"""
    jsessionid = await _login(uid, pwd)
    return {"jsessionid": jsessionid}
