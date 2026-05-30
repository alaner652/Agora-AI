#!/usr/bin/env python3

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent / "scripts"

_VENV_PYTHON = Path(__file__).parent / ".venv" / "bin" / "python"
_PYTHON = str(_VENV_PYTHON) if _VENV_PYTHON.exists() else sys.executable

_WEB_DIR = Path(__file__).parent / "web"

MENU = [
    ("查詢課表",               "fetch_schedule.py"),
    ("查詢缺曠",               "fetch_absence.py"),
    ("查詢成績",               "fetch_grades.py"),
    ("申請請假",               "apply_leave.py"),
    ("管理假單",               "manage_leaves.py"),
    ("AI 助理",               "chatbot.py"),
    ("啟動 API 伺服器",         "serve.py"),
    ("啟動完整服務（後端+前端）", None),
]


def print_menu() -> None:
    print()
    print("╔══════════════════════════════════╗")
    print("║       TPCU 學生資訊工具          ║")
    print("╠══════════════════════════════════╣")
    for i, (label, _) in enumerate(MENU, 1):
        print(f"║  [{i}] {label:<28}║")
    print("║  [0] 離開                        ║")
    print("╚══════════════════════════════════╝")
    print()


def run_script(script: str) -> None:
    path = SCRIPTS_DIR / script
    result = subprocess.run(
        [_PYTHON, str(path)],
        cwd=str(Path(__file__).parent),
    )
    if result.returncode != 0:
        print(f"\n腳本結束（returncode={result.returncode}）")


def run_full_stack() -> None:
    if not _WEB_DIR.exists():
        print("找不到 web/ 目錄，請先建立前端（npm create vite）")
        return

    backend = subprocess.Popen(
        [_PYTHON, str(SCRIPTS_DIR / "serve.py")],
        cwd=str(Path(__file__).parent),
    )
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(_WEB_DIR),
    )
    print("\n後端 http://localhost:8000 + 前端 http://localhost:5173 已啟動")
    print("按 Ctrl+C 停止所有服務\n")
    try:
        backend.wait()
    except KeyboardInterrupt:
        pass
    finally:
        backend.terminate()
        frontend.terminate()
        backend.wait()
        frontend.wait()
        print("\n服務已停止")


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
            if script is None:
                run_full_stack()
            else:
                run_script(script)
            if script is not None:
                input("\n按 Enter 返回選單...")
        else:
            print(f"  無效選項「{raw}」，請重新輸入。")


if __name__ == "__main__":
    main()
