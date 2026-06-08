#!/usr/bin/env python3
"""每日摘要 CLI（薄包裝）—— 核心在 src/summary.py，與後端排程共用。

平時不需要它：後端 lifespan 已內建每日排程（見 app.py + DAILY_SUMMARY_AT）。
這支留給手動檢視 / 補跑某天 / dry-run。

    python3 scripts/daily_summary.py --dry-run       # 今天，只印不推
    python3 scripts/daily_summary.py --yesterday     # 昨天
    python3 scripts/daily_summary.py --date 2026-06-08
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import summary  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="Agora 每日摘要")
    ap.add_argument("--date", help="指定日期 YYYY-MM-DD（Asia/Taipei）")
    ap.add_argument("--yesterday", action="store_true", help="改抓昨天")
    ap.add_argument("--dry-run", action="store_true", help="只印不推 webhook")
    args = ap.parse_args()

    if args.date:
        day = args.date
    else:
        d = datetime.now(summary.TZ).date()
        if args.yesterday:
            d -= timedelta(days=1)
        day = d.isoformat()

    if args.dry_run:
        print(summary.build(day))
        return

    env = summary.load_env()
    text, posted = summary.send(day, env)
    print(text)
    if posted:
        print("[daily_summary] 已推送。")
    elif not summary.webhook_url(env):
        print("[daily_summary] 未設 SUMMARY_WEBHOOK_URL / ALERT_WEBHOOK_URL，略過推送。")
    else:
        print("[daily_summary] webhook 推送失敗。")


if __name__ == "__main__":
    main()
