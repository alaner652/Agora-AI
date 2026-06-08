#!/usr/bin/env python3
"""每日摘要：讀 logs/*.jsonl + SQLite，彙整當日指標推到 webhook。

設計成「需要時的輕量替代品」，取代常駐 Grafana：純標準庫、可在 host 直接跑
（logs/ 與 data/ 都是 compose 掛出來的 volume），也可 `docker compose exec
backend python scripts/daily_summary.py`。

指標：活躍人數、對話/LLM 呼叫數、token 用量、共用 AI 用量、免費額度命中、錯誤數。
日界用 Asia/Taipei，對齊額度計算（storage/usage.py）。

用法：
    python3 scripts/daily_summary.py                # 今天（Asia/Taipei）
    python3 scripts/daily_summary.py --yesterday    # 昨天（適合 00:0x 的 cron）
    python3 scripts/daily_summary.py --date 2026-06-08
    python3 scripts/daily_summary.py --dry-run      # 只印不推

webhook 取自 SUMMARY_WEBHOOK_URL，否則 fallback ALERT_WEBHOOK_URL；
未設且非 --dry-run 則只印到 stdout。
"""

from __future__ import annotations

import argparse
import glob
import json
import sqlite3
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

_BACKEND = Path(__file__).resolve().parent.parent
_LOGS = _BACKEND / "logs"
_DB = _BACKEND / "data" / "history.db"
_TZ = ZoneInfo("Asia/Taipei")


# ---------------------------------------------------------------------------
# 環境 / webhook
# ---------------------------------------------------------------------------

def _load_env() -> dict[str, str]:
    """讀環境變數，缺的話再從 backend/.env 補（純標準庫，免裝 dotenv）。"""
    import os

    env = dict(os.environ)
    envfile = _BACKEND / ".env"
    if envfile.exists():
        for line in envfile.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env.setdefault(k.strip(), v.strip())
    return env


def _post_webhook(url: str, text: str) -> bool:
    # Discord 用 "content"、Slack 與多數通用 webhook 用 "text"（對齊 log.py）。
    key = "content" if "discord" in url else "text"
    data = json.dumps({key: text}).encode("utf-8")
    try:
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=10)  # noqa: S310
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[daily_summary] webhook 推送失敗：{e}")
        return False


# ---------------------------------------------------------------------------
# 解析
# ---------------------------------------------------------------------------

def _to_local_date(ts: str) -> str | None:
    """ISO UTC 字串 → Asia/Taipei 日期字串（YYYY-MM-DD）。"""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.astimezone(_TZ).date().isoformat()
    except (ValueError, AttributeError):
        return None


def _iter_log_records(pattern: str, day: str):
    """逐行讀符合 glob 的 jsonl，yield 當日（Asia/Taipei）的 dict。"""
    for path in glob.glob(str(_LOGS / pattern)):
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if _to_local_date(rec.get("timestamp", "")) == day:
                        yield rec
        except OSError:
            continue


def _collect_from_logs(day: str) -> dict:
    active: set[str] = set()
    prompt_tok = completion_tok = llm_calls = 0
    quota: dict[str, int] = {}

    for rec in _iter_log_records("system.jsonl*", day):
        event = rec.get("event")
        if event == "auth_login" and rec.get("ok") is True:
            if uid := rec.get("uid"):
                active.add(uid)
        elif event == "llm_call":
            prompt_tok += int(rec.get("prompt_tokens") or 0)
            completion_tok += int(rec.get("completion_tokens") or 0)
            llm_calls += 1
        elif event == "quota_block":
            code = rec.get("error_code", "?")
            quota[code] = quota.get(code, 0) + 1

    # 錯誤：errors.jsonl 只含 WARN+，依 level 計數
    errors: dict[str, int] = {}
    for rec in _iter_log_records("errors.jsonl*", day):
        lvl = rec.get("level", "?")
        errors[lvl] = errors.get(lvl, 0) + 1

    return {
        "active": active,
        "prompt_tok": prompt_tok,
        "completion_tok": completion_tok,
        "llm_calls": llm_calls,
        "quota": quota,
        "errors": errors,
    }


def _collect_from_db(day: str) -> dict:
    """對話則數（當日 user 訊息）+ 共用 AI 用量（llm_quota）。"""
    out = {"turns": 0, "shared_global": 0, "shared_users": 0}
    if not _DB.exists():
        return out

    # 當日 Asia/Taipei 的 epoch 區間
    start = datetime.fromisoformat(f"{day}T00:00:00").replace(tzinfo=_TZ)
    lo = start.timestamp()
    hi = (start + timedelta(days=1)).timestamp()

    try:
        conn = sqlite3.connect(f"file:{_DB}?mode=ro", uri=True, timeout=5.0)
    except sqlite3.Error:
        return out
    try:
        try:
            row = conn.execute(
                "SELECT COUNT(*) FROM conversation_messages "
                "WHERE role='user' AND created_at >= ? AND created_at < ?",
                (lo, hi),
            ).fetchone()
            out["turns"] = row[0] if row else 0
        except sqlite3.Error:
            pass
        try:
            row = conn.execute(
                "SELECT count FROM llm_quota WHERE scope='__global__' AND day=?",
                (day,),
            ).fetchone()
            out["shared_global"] = row[0] if row else 0
            row = conn.execute(
                "SELECT COUNT(*) FROM llm_quota WHERE scope != '__global__' AND day=?",
                (day,),
            ).fetchone()
            out["shared_users"] = row[0] if row else 0
        except sqlite3.Error:
            pass
    finally:
        conn.close()
    return out


# ---------------------------------------------------------------------------
# 組訊息
# ---------------------------------------------------------------------------

def _format(day: str, logs: dict, db: dict) -> str:
    total_tok = logs["prompt_tok"] + logs["completion_tok"]
    lines = [f"📊 **Agora 每日摘要** · {day}"]
    lines.append(f"活躍使用者：{len(logs['active'])} 人（登入）")
    lines.append(f"對話：{db['turns']} 則 · LLM 呼叫 {logs['llm_calls']} 次")
    lines.append(
        f"Token：prompt {logs['prompt_tok']:,} + completion "
        f"{logs['completion_tok']:,} = {total_tok:,}"
    )
    lines.append(
        f"共用 AI 用量：{db['shared_global']} 則（全站）· {db['shared_users']} 人使用"
    )
    if logs["quota"]:
        hit = "、".join(f"{k} ×{v}" for k, v in sorted(logs["quota"].items()))
        lines.append(f"免費額度命中：{hit}")
    else:
        lines.append("免費額度命中：無")
    if logs["errors"]:
        err = "、".join(f"{k} ×{v}" for k, v in sorted(logs["errors"].items()))
        total_err = sum(logs["errors"].values())
        lines.append(f"錯誤：{total_err}（{err}）")
    else:
        lines.append("錯誤：0")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 主程式
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="Agora 每日摘要")
    ap.add_argument("--date", help="指定日期 YYYY-MM-DD（Asia/Taipei）")
    ap.add_argument("--yesterday", action="store_true", help="改抓昨天")
    ap.add_argument("--dry-run", action="store_true", help="只印不推 webhook")
    args = ap.parse_args()

    if args.date:
        day = args.date
    else:
        d = datetime.now(_TZ).date()
        if args.yesterday:
            d -= timedelta(days=1)
        day = d.isoformat()

    logs = _collect_from_logs(day)
    db = _collect_from_db(day)
    msg = _format(day, logs, db)
    print(msg)

    if args.dry_run:
        return

    env = _load_env()
    url = env.get("SUMMARY_WEBHOOK_URL") or env.get("ALERT_WEBHOOK_URL")
    if not url:
        print("[daily_summary] 未設 SUMMARY_WEBHOOK_URL / ALERT_WEBHOOK_URL，略過推送。")
        return
    if _post_webhook(url, msg):
        print("[daily_summary] 已推送。")


if __name__ == "__main__":
    main()
