import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

from log import setup_logging
from client import login
from actions.fetch_leaves.index import get_leaves
from actions.delete_leave.index import delete_leave
from utils.json_output import save_json
from utils.date import today_roc, days_ago_roc

UID = os.environ.get("TPCU_UID", "")
PWD = os.environ.get("TPCU_PWD", "")


async def main():
    if not UID or not PWD:
        raise SystemExit("請先設定環境變數 TPCU_UID 和 TPCU_PWD")

    print("1. 登入...")
    jsessionid = await login(UID, PWD)
    print("   登入成功\n")

    today = today_roc()
    default_start = days_ago_roc(30)
    print(f"2. 查詢日期範圍（民國 YYYMMDD）")
    raw_start = input(f"   起始日期（Enter = {default_start}）: ").strip()
    raw_end   = input(f"   結束日期（Enter = {today}）: ").strip()
    start = raw_start if raw_start else default_start
    end   = raw_end   if raw_end   else today
    print()

    print(f"3. 查詢假單（{start} ～ {end}）...")
    leaves = await get_leaves(jsessionid, start, end)

    if not leaves:
        print("   查詢期間內無假單記錄\n")
        save_json("leaves.json", {
            "type": "leaves",
            "date_range": {"start": start, "end": end},
            "entries": [],
        })
        return

    print(f"   共 {len(leaves)} 筆\n")
    print(f"   {'#':<3} {'假單編號':<16} {'原因':<12} {'起始日':<8} {'結束日':<8} {'導師':<8} 可刪除")
    print("   " + "─" * 68)
    for lv in leaves:
        deletable = "Y" if lv["can_delete"] else "N"
        print(f"   {lv['index']:<3} {lv['barcode']:<16} {lv['reason']:<12} "
              f"{lv['start_date']:<8} {lv['end_date']:<8} {lv['teacher_status']:<8} {deletable}")

    json_path = save_json("leaves.json", {
        "type": "leaves",
        "date_range": {"start": start, "end": end},
        "entries": leaves,
    })
    print(f"\n   JSON → {json_path}\n")

    deletable = [lv for lv in leaves if lv["can_delete"]]
    if not deletable:
        print("   （目前所有假單均已核准或無法刪除）")
        return

    raw = input("4. 輸入要刪除的項次（Enter 略過）: ").strip()
    if not raw:
        return

    target = next((lv for lv in leaves if lv["index"] == raw), None)
    if not target:
        print(f"   找不到項次 {raw}")
        return
    if not target["can_delete"]:
        print(f"   假單 {target['barcode']} 無法刪除（可能已核准）")
        return

    print(f"\n   將刪除：{target['barcode']}  原因：{target['reason']}  {target['start_date']}～{target['end_date']}")
    confirm = input("   確認刪除？（y/N）: ").strip().lower()
    if confirm != "y":
        print("   已取消")
        return

    print("\n5. 刪除中...")
    result = await delete_leave(
        jsessionid,
        stdkey=target["stdkey"],
        barcode=target["barcode"],
        sdate=target["start_date"],
        edate=target["end_date"],
    )
    status = "成功" if result["success"] else ("失敗" if result["success"] is False else "未知")
    print(f"   結果：{status}　訊息：{result['message']}")


setup_logging()
asyncio.run(main())
