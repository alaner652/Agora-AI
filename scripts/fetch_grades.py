import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

from client import login
from actions.fetch_grades.index import get_grades
from utils.render_grades.index import render

UID = os.environ.get("TPCU_UID", "")
PWD = os.environ.get("TPCU_PWD", "")


async def main():
    if not UID or not PWD:
        raise SystemExit("請先設定環境變數 TPCU_UID 和 TPCU_PWD")

    print("1. 登入...")
    jsessionid = await login(UID, PWD)
    print(f"   JSESSIONID: {jsessionid}\n")

    print("2. 查詢歷年成績...")
    entries = await get_grades(jsessionid)
    if not entries:
        raise SystemExit("無法取得成績資料")
    print(f"   解析到 {len(entries)} 筆成績\n")

    semesters = list(dict.fromkeys(e["semester"] for e in entries))
    for i, s in enumerate(semesters):
        print(f"   [{i + 1}] {s}")

    raw = input("\n請選擇學期（直接 Enter 選最新）: ").strip()
    chosen = semesters[int(raw) - 1] if raw.isdigit() else semesters[-1]
    print(f"   已選：{chosen}\n")

    filtered = [e for e in entries if e["semester"] == chosen]

    print("3. 成績明細：")
    for e in filtered:
        flag = "X" if not e["passed"] else " "
        print(f"   [{flag}] {e['course']:<20} {e['type']:<4} {e['credits']}學分  {e['score']}")

    print("\n4. 產生成績圖片...")
    out = render(filtered, title=chosen, output="output/grades.png")
    print(f"   已存至 {out}")


asyncio.run(main())
