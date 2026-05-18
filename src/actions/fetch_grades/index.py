import dataclasses

from client import post_data
from parser import parse_grades

URL = "/tsint/ag_pro/ag102.jsp"


async def get_grades(jsessionid: str) -> list[dict]:
    """查詢歷年成績，回傳所有學期的成績清單。"""
    html = await post_data(jsessionid, URL, {
        "arg01": "", "arg02": "", "arg03": "",
        "arg04": "", "arg05": "", "arg06": "",
        "fncid": "AG102",
    })
    return [dataclasses.asdict(e) for e in parse_grades(html)]
