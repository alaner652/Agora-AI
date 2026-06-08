"""每日摘要核心：讀 logs/*.jsonl + SQLite，彙整當日指標、推 webhook。

被兩處共用：
- 後端 lifespan 的每日排程 task（app.py）——專案一直跑著、到點自己送。
- CLI 薄包裝 scripts/daily_summary.py——手動 / --dry-run / 補跑某天。

純標準庫，無業務相依。日界用 Asia/Taipei，對齊額度計算（storage/usage.py）。
"""

from __future__ import annotations

import glob
import json
import os
import sqlite3
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

_BACKEND = Path(__file__).resolve().parent.parent   # src/ → backend/
_LOGS = _BACKEND / "logs"
_DB = _BACKEND / "data" / "history.db"
TZ = ZoneInfo("Asia/Taipei")


# ---------------------------------------------------------------------------
# 排程輔助
# ---------------------------------------------------------------------------

def parse_hhmm(at: str) -> tuple[int, int] | None:
    """'HH:MM' → (h, m)，不合法回 None。"""
    try:
        h, m = at.strip().split(":")
        h, m = int(h), int(m)
        if 0 <= h < 24 and 0 <= m < 60:
            return h, m
    except (ValueError, AttributeError):
        pass
    return None


def seconds_until(h: int, m: int, now: datetime | None = None) -> float:
    """距下一個 Asia/Taipei HH:MM 的秒數。"""
    now = now or datetime.now(TZ)
    target = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def day_to_summarize(now: datetime | None = None) -> str:
    """排程觸發時要彙整哪一天：清晨觸發 → 昨天；其餘 → 今天。"""
    now = now or datetime.now(TZ)
    d = now.date()
    if now.hour < 12:
        d -= timedelta(days=1)
    return d.isoformat()


# ---------------------------------------------------------------------------
# webhook
# ---------------------------------------------------------------------------

def load_env() -> dict[str, str]:
    """環境變數 + backend/.env 補缺（CLI 在 host 跑時 env 可能沒載）。"""
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


def webhook_url(env: dict[str, str] | None = None) -> str | None:
    env = env or os.environ
    return env.get("SUMMARY_WEBHOOK_URL") or env.get("ALERT_WEBHOOK_URL") or None


def post_webhook(url: str, text: str) -> bool:
    # Discord 用 "content"、Slack 與多數通用 webhook 用 "text"（對齊 log.py）。
    key = "content" if "discord" in url else "text"
    data = json.dumps({key: text}).encode("utf-8")
    try:
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=10)  # noqa: S310
        return True
    except Exception:  # noqa: BLE001
        return False


# ---------------------------------------------------------------------------
# 蒐集
# ---------------------------------------------------------------------------

def _to_local_date(ts: str) -> str | None:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(TZ).date().isoformat()
    except (ValueError, AttributeError):
        return None


def _iter_log_records(pattern: str, day: str):
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

    errors: dict[str, int] = {}
    for rec in _iter_log_records("errors.jsonl*", day):
        lvl = rec.get("level", "?")
        errors[lvl] = errors.get(lvl, 0) + 1

    return {
        "active": active, "prompt_tok": prompt_tok, "completion_tok": completion_tok,
        "llm_calls": llm_calls, "quota": quota, "errors": errors,
    }


def _collect_from_db(day: str) -> dict:
    out = {"turns": 0, "shared_global": 0, "shared_users": 0}
    if not _DB.exists():
        return out
    start = datetime.fromisoformat(f"{day}T00:00:00").replace(tzinfo=TZ)
    lo, hi = start.timestamp(), (start + timedelta(days=1)).timestamp()
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
                "SELECT count FROM llm_quota WHERE scope='__global__' AND day=?", (day,)
            ).fetchone()
            out["shared_global"] = row[0] if row else 0
            row = conn.execute(
                "SELECT COUNT(*) FROM llm_quota WHERE scope != '__global__' AND day=?", (day,)
            ).fetchone()
            out["shared_users"] = row[0] if row else 0
        except sqlite3.Error:
            pass
    finally:
        conn.close()
    return out


def format_summary(day: str, logs: dict, db: dict) -> str:
    total_tok = logs["prompt_tok"] + logs["completion_tok"]
    lines = [
        f"📊 **Agora 每日摘要** · {day}",
        f"活躍使用者：{len(logs['active'])} 人（登入）",
        f"對話：{db['turns']} 則 · LLM 呼叫 {logs['llm_calls']} 次",
        f"Token：prompt {logs['prompt_tok']:,} + completion {logs['completion_tok']:,} = {total_tok:,}",
        f"共用 AI 用量：{db['shared_global']} 則（全站）· {db['shared_users']} 人使用",
    ]
    if logs["quota"]:
        lines.append("免費額度命中：" + "、".join(f"{k} ×{v}" for k, v in sorted(logs["quota"].items())))
    else:
        lines.append("免費額度命中：無")
    if logs["errors"]:
        total_err = sum(logs["errors"].values())
        lines.append(f"錯誤：{total_err}（" + "、".join(f"{k} ×{v}" for k, v in sorted(logs["errors"].items())) + "）")
    else:
        lines.append("錯誤：0")
    return "\n".join(lines)


def build(day: str) -> str:
    """彙整指定日，回傳摘要文字（不推送）。"""
    return format_summary(day, _collect_from_logs(day), _collect_from_db(day))


def send(day: str, env: dict[str, str] | None = None) -> tuple[str, bool]:
    """彙整並推 webhook，回 (text, posted)。沒設 webhook 則 posted=False。"""
    text = build(day)
    url = webhook_url(env)
    return text, (post_webhook(url, text) if url else False)
