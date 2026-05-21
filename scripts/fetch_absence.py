import asyncio
import os
from datetime import date, timedelta

from dotenv import load_dotenv

load_dotenv()

from log import setup_logging
from client import login
from actions.fetch_absence.index import get_options, get_absence
from utils.render_absence.index import render
from utils.json_output import save_json

UID = os.environ.get("TPCU_UID", "")
PWD = os.environ.get("TPCU_PWD", "")


def _to_roc(d: date) -> str:
    return f"{d.year - 1911}{d.month:02d}{d.day:02d}"


def _ask_date(prompt: str, default: str) -> str:
    raw = input(f"   {prompt}（民國 YYYMMDD，Enter 選 {default}）: ").strip()
    return raw if raw else default


async def main():
    if not UID or not PWD:
        raise SystemExit("請先設定環境變數 TPCU_UID 和 TPCU_PWD")

    print("1. 登入...")
    jsessionid = await login(UID, PWD)
    print(f"   JSESSIONID: {jsessionid}\n")

    print("2. 取得學期清單...")
    opts = await get_options(jsessionid)
    semesters = opts["semesters"]
    if not semesters:
        raise SystemExit("無法取得學期清單")

    for i, s in enumerate(semesters):
        mark = " (預設)" if s["selected"] else ""
        print(f"   [{i + 1}] {s['label']}{mark}")
    default_sem = next((i for i, s in enumerate(semesters) if s["selected"]), 0)
    raw = input("\n請選擇學期（直接 Enter 選預設）: ").strip()
    chosen_sem = semesters[int(raw) - 1] if raw.isdigit() else semesters[default_sem]
    print(f"   已選：{chosen_sem['label']}\n")

    print("3. 選擇查詢日期範圍...")
    today = date.today()
    print(f"   [1] 今天（{_to_roc(today)}）")
    print(f"   [2] 近 30 天（{_to_roc(today - timedelta(days=30))} ～ {_to_roc(today)}）")
    print(f"   [3] 自訂")
    raw = input("\n請選擇（直接 Enter 選近 30 天）: ").strip()

    if raw == "1":
        start = end = _to_roc(today)
    elif raw == "3":
        start = _ask_date("起始日期", _to_roc(today - timedelta(days=30)))
        end   = _ask_date("結束日期", _to_roc(today))
    else:
        start = _to_roc(today - timedelta(days=30))
        end   = _to_roc(today)
    print()

    print("4. 查詢缺曠...")
    entries = await get_absence(jsessionid, chosen_sem["value"],
                                start=start, end=end)

    if not entries:
        print("   查詢期間內無缺曠記錄")
        return

    print(f"   共 {len(entries)} 筆\n")
    print(f"   {'日期':<12} {'星期':<4} {'節次':<6} 假別")
    print("   " + "─" * 36)
    for e in entries:
        print(f"   {e['date']:<12} 週{e['weekday']:<3} {e['period']:<6} {e['type']}")

    print("\n5. 產生缺曠圖片...")
    out = render(entries, title=f"{chosen_sem['label']} 缺曠記錄",
                 date_range=f"{start} ～ {end}", output="output/absence.png")
    print(f"   已存至 {out}")

    json_path = save_json("absence.json", {
        "type": "absence",
        "semester": chosen_sem["label"],
        "date_range": {"start": start, "end": end},
        "entries": entries,
    })
    print(f"   JSON → {json_path}")


setup_logging()
asyncio.run(main())
