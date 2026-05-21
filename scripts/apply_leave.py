import asyncio
import os
from datetime import date

from dotenv import load_dotenv

load_dotenv()

from client import login
from actions.apply_leave.index import LEAVE_TYPES, PUBLIC_LEAVE_REASONS, apply_leave, get_leave_form
from utils.json_output import save_json

UID = os.environ.get("TPCU_UID", "")
PWD = os.environ.get("TPCU_PWD", "")


def _today_roc() -> str:
    d = date.today()
    return f"{d.year - 1911}{d.month:02d}{d.day:02d}"


def _parse_periods(raw: str, period_order: list[str]) -> list[str]:
    """解析使用者輸入的節次字串，回傳 period_order 中的 labels。"""
    raw = raw.strip().lower()
    all_labels = period_order

    if raw in ("all", "整天", "全部"):
        return all_labels

    shortcuts = {
        "1-4": ["1", "2", "3", "4"],
        "1至4": ["1", "2", "3", "4"],
        "5-8": ["5", "6", "7", "8"],
        "5至8": ["5", "6", "7", "8"],
        "a-e": ["A", "B", "C", "D", "E"],
        "a至e": ["A", "B", "C", "D", "E"],
        "11-15": ["A", "B", "C", "D", "E"],
        "11至15": ["A", "B", "C", "D", "E"],
    }
    if raw in shortcuts:
        return shortcuts[raw]

    # 逗號分隔或空白分隔
    tokens = [t.strip() for t in raw.replace(",", " ").split() if t.strip()]
    result = []
    label_map = {l.lower(): l for l in period_order}
    for tok in tokens:
        if tok in label_map:
            result.append(label_map[tok])
        else:
            print(f"   ⚠ 找不到節次「{tok}」，略過")
    return result


async def main():
    if not UID or not PWD:
        raise SystemExit("請先設定環境變數 TPCU_UID 和 TPCU_PWD")

    print("1. 登入...")
    jsessionid = await login(UID, PWD)
    print(f"   JSESSIONID: {jsessionid}\n")

    # 2. 詢問日期
    today = _today_roc()
    raw_date = input(f"2. 請假日期（民國 YYYMMDD，Enter = 今天 {today}）: ").strip()
    leave_date = raw_date if raw_date else today
    print(f"   已選：{leave_date}\n")

    # 3. 取得表單（節次順序 + 當日課表）
    print("3. 取得節次資訊...")
    form = await get_leave_form(jsessionid, leave_date if raw_date else None)
    period_order = form["period_order"] or \
        ["朝會", "早自習", "1", "2", "3", "4", "5", "6", "7", "8", "9", "K", "A", "B", "C", "D", "E"]
    scheduled = set(form["scheduled"])
    print(f"   節次順序：{' | '.join(period_order)}")
    if scheduled:
        print(f"   今日有課：{', '.join(p for p in period_order if p in scheduled)}\n")
    else:
        print("   （無法取得當日課表資訊）\n")

    # 4. 選假別
    print("4. 假別選單：")
    for i, lt in enumerate(LEAVE_TYPES):
        print(f"   [{i + 1}] {lt['name']}（{lt['id']}）")
    raw = input("\n請選擇假別: ").strip()
    if not raw.isdigit() or not (1 <= int(raw) <= len(LEAVE_TYPES)):
        raise SystemExit("無效選擇")
    chosen_type = LEAVE_TYPES[int(raw) - 1]
    print(f"   已選：{chosen_type['name']}\n")

    # 5. 請假原因
    if chosen_type["id"] == "23":
        print("5. 公假事由（限下列選項）：")
        for i, r in enumerate(PUBLIC_LEAVE_REASONS, 1):
            print(f"   [{i}] {r}")
        raw_r = input("\n請選擇事由: ").strip()
        if not raw_r.isdigit() or not (1 <= int(raw_r) <= len(PUBLIC_LEAVE_REASONS)):
            raise SystemExit("無效選擇")
        reason = PUBLIC_LEAVE_REASONS[int(raw_r) - 1]
        print(f"   已選：{reason}\n")
    else:
        reason = input("5. 請假原因: ").strip()
        if not reason:
            raise SystemExit("請假原因不可空白")
        print()

    # 6. 節次選擇
    print("6. 節次清單（★ = 今日有排課）：")
    display = [f"★{p}" if p in scheduled else p for p in period_order]
    print("   " + "  ".join(display))
    print("\n   快速輸入：all=整天  1-4  5-8  a-e=A至E堂")
    raw_periods = input("   請輸入節次（如 1,2,3 或 all）: ").strip()
    periods = _parse_periods(raw_periods, period_order)
    if not periods:
        raise SystemExit("未選擇任何節次")
    print(f"   已選：{', '.join(periods)}\n")

    # 7. 附件（公假必填，日間部支援 JPEG/PNG/PDF）
    image_path: str | None = None
    if chosen_type["id"] == "23":
        image_path = input("7. 公假需上傳佐證文件，請輸入檔案路徑（JPEG / PDF）: ").strip()
        if not image_path:
            raise SystemExit("公假必須提供附件")
        if not os.path.exists(image_path):
            raise SystemExit(f"找不到檔案：{image_path}")
        ext = os.path.splitext(image_path)[1].lower()
        if ext not in (".jpg", ".jpeg", ".pdf"):
            raise SystemExit(f"不支援的格式 {ext}，請使用 JPEG / PDF")
    else:
        print("7. 附件：略過（非公假）\n")

    # 8. 確認
    print("─" * 40)
    print(f"日期：{leave_date}　假別：{chosen_type['name']}　節次：{', '.join(periods)}")
    print(f"原因：{reason}")
    if image_path:
        print(f"附件：{image_path}")
    confirm = input("確認送出？（y/N）: ").strip().lower()
    if confirm != "y":
        raise SystemExit("已取消")
    print()

    # 9. 送出
    print("8. 送出請假申請...")
    result = await apply_leave(
        jsessionid=jsessionid,
        date=leave_date,
        periods=periods,
        leave_id=chosen_type["id"],
        leave_name=chosen_type["name"],
        reason=reason,
        image_path=image_path,
    )

    status = "成功" if result["success"] else ("失敗" if result["success"] is False else "未知")
    print(f"   結果：{status}　訊息：{result['message']}\n")

    json_path = save_json("leave_result.json", {
        "type": "leave_result",
        "request": {
            "date": leave_date,
            "leave_id": chosen_type["id"],
            "leave_name": chosen_type["name"],
            "periods": periods,
            "reason": reason,
        },
        "result": result,
    })
    print(f"   JSON → {json_path}")


asyncio.run(main())
