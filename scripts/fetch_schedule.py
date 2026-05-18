import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

from client import login
from actions.fetch_schedule.index import get_options, get_schedule
from utils.render_schedule.index import render

UID = os.environ.get("TPCU_UID", "")
PWD = os.environ.get("TPCU_PWD", "")


async def main():
    if not UID or not PWD:
        raise SystemExit("請先設定環境變數 TPCU_UID 和 TPCU_PWD")

    print("1. 登入...")
    jsessionid = await login(UID, PWD)
    print(f"   JSESSIONID: {jsessionid}\n")

    print("2. 取得可用學期...")
    result = await get_options(jsessionid)
    semesters = result["semesters"]
    if not semesters:
        raise SystemExit("無法取得學期清單")

    for i, s in enumerate(semesters):
        mark = " ← 預設" if s["selected"] else ""
        print(f"   [{i + 1}] {s['label']}{mark}")

    default_idx = next((i for i, s in enumerate(semesters) if s["selected"]), 0)
    raw = input("\n請選擇學期（直接 Enter 選預設）: ").strip()
    chosen = semesters[int(raw) - 1] if raw.isdigit() else semesters[default_idx]
    print(f"   已選：{chosen['label']}\n")

    print("3. 查詢課表...")
    entries = await get_schedule(jsessionid, chosen["value"])
    print(f"   解析到 {len(entries)} 筆課程\n")
    for e in entries:
        day = "一二三四五六日"[e["weekday"] - 1]
        print(f"   週{day} {e['period']} {e['time_range']}  {e['course']}  {e['teacher']}  {e['classroom']}")

    print("\n4. 產生課表圖片...")
    out = render(entries, title=chosen["label"], output="output/schedule.png")
    print(f"   已存至 {out}")


asyncio.run(main())
