#!/usr/bin/env python3

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent / "scripts"

MENU = [
    ("查詢課表",    "fetch_schedule.py"),
    ("查詢缺曠",    "fetch_absence.py"),
    ("查詢成績",    "fetch_grades.py"),
    ("申請請假",    "apply_leave.py"),
    ("管理假單",    "manage_leaves.py"),
    ("AI 助理",    "chatbot.py"),
]


def print_menu() -> None:
    print()
    print("╔══════════════════════════════╗")
    print("║       TPCU 學生資訊工具      ║")
    print("╠══════════════════════════════╣")
    for i, (label, _) in enumerate(MENU, 1):
        print(f"║  [{i}] {label:<24}║")
    print("║  [0] 離開                    ║")
    print("╚══════════════════════════════╝")
    print()


def run_script(script: str) -> None:
    path = SCRIPTS_DIR / script
    result = subprocess.run(
        [sys.executable, str(path)],
        cwd=str(Path(__file__).parent),
    )
    if result.returncode != 0:
        print(f"\n腳本結束（returncode={result.returncode}）")


def main() -> None:
    while True:
        print_menu()
        try:
            raw = input("請選擇功能：").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n再見")
            break

        if raw == "0":
            print("再見")
            break

        if raw.isdigit() and 1 <= int(raw) <= len(MENU):
            label, script = MENU[int(raw) - 1]
            print(f"\n>>> {label}\n{'─' * 36}")
            run_script(script)
            input("\n按 Enter 返回選單...")
        else:
            print(f"  無效選項「{raw}」，請重新輸入。")


if __name__ == "__main__":
    main()
