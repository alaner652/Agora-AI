import dataclasses

from client import activate_feature, post_data
from parser import parse_schedule, parse_select

FNCID = "AG222"
SPATH = "ag_pro/ag222.jsp?"
URL   = "/tsint/ag_pro/ag222.jsp"


async def get_options(jsessionid: str) -> dict:
    """取得可查詢的學期清單。"""
    html = await activate_feature(jsessionid, FNCID, SPATH)
    return {"semesters": parse_select(html, "yms")}


async def get_schedule(jsessionid: str, yms: str) -> list[dict]:
    """查詢指定學期課表，回傳課程清單。"""
    year, semester = yms.split(",")
    html = await post_data(jsessionid, URL, {
        "yms":   yms,
        "spath": SPATH,
        "arg01": year.strip(),
        "arg02": semester.strip(),
    })
    return [dataclasses.asdict(e) for e in parse_schedule(html)]
