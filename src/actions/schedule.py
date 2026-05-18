import dataclasses

from client import fetch_schedule as _fetch, fetch_schedule_form as _fetch_form
from parser import parse_schedule, parse_select


async def get_schedule_options(jsessionid: str) -> dict:
    """取得可查詢的學期清單。"""
    html = await _fetch_form(jsessionid)
    return {"semesters": parse_select(html, "yms")}


async def get_schedule(jsessionid: str, yms: str = "114,2") -> list[dict]:
    """查詢指定學期課表，回傳課程清單。"""
    html = await _fetch(jsessionid, yms)
    return [dataclasses.asdict(e) for e in parse_schedule(html)]