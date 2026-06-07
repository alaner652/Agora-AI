"""結構化 logging 基礎設施(structlog + stdlib 橋接)。

- get_logger(name): 取得 tpcu.{name} logger。慣例：actions.fetch_schedule、parsers.schedule 等。
  回傳的 logger 相容於既有 `_log.info("msg %s", x)` 的 %-style 呼叫。
- setup_logging(): 由入口點（main.py）呼叫一次，設定 JSON 輸出與 handler。
- bind_request()/clear_request(): 把 request_id / uid 綁進 contextvars，
  之後所有 log 自動帶上，貫穿 middleware → agent → tools → client。
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import threading
import time
import urllib.request
from logging.handlers import TimedRotatingFileHandler

import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars, merge_contextvars

# 集中式敏感欄位遮蔽清單。新增的 client/middleware log 不會外洩這些值。
_SENSITIVE = {
    "jsessionid", "password", "pwd", "token", "api_key",
    "authorization", "cookie", "cookies", "set-cookie",
}
_REDACTED = "***"

_PROJECT_ROOT = pathlib.Path(__file__).parent.parent
_LOG_FILE = _PROJECT_ROOT / "logs" / "system.jsonl"
_ERROR_FILE = _PROJECT_ROOT / "logs" / "errors.jsonl"


def _console_filter(_logger, _method, event_dict: dict) -> dict:
    """console 專用：過濾 OPTIONS preflight 與空事件（仍寫入 file）。"""
    event = event_dict.get("event") or ""
    if not str(event).strip():
        raise structlog.DropEvent()
    if event == "http_request" and event_dict.get("method") == "OPTIONS":
        raise structlog.DropEvent()
    return event_dict


def _console_format(_logger, _method, event_dict: dict) -> dict:
    """console 專用：縮短 request_id、慢請求加 ⚠ 前綴。"""
    if rid := event_dict.get("request_id"):
        event_dict["request_id"] = rid[:8]
    if (event_dict.get("duration_ms") or 0) > 2000:
        event_dict["event"] = "⚠ " + str(event_dict.get("event", ""))
    return event_dict


def _redact(_logger, _method, event_dict: dict) -> dict:
    """structlog processor：遞迴遮蔽敏感 key（不分大小寫）。"""
    def scrub(obj):
        if isinstance(obj, dict):
            return {
                k: (_REDACTED if isinstance(k, str) and k.lower() in _SENSITIVE else scrub(v))
                for k, v in obj.items()
            }
        if isinstance(obj, (list, tuple)):
            return type(obj)(scrub(v) for v in obj)
        return obj

    return scrub(event_dict)


class WebhookAlertHandler(logging.Handler):
    """WARNING+ 事件即時推到 webhook（Discord / Slack / 通用 JSON）。

    - 內容沿用 json_formatter（同 errors.jsonl）→ 敏感欄位已遮蔽，不會外洩。
    - 非阻塞：每則於 daemon thread 短逾時送出，發送失敗靜默吞掉，
      告警管線絕不能拖垮或拖慢主請求。
    - 冷卻：同一 (logger, 訊息) 在 cooldown 秒內只發一次，避免洗版。
    僅當設了 ALERT_WEBHOOK_URL 時才掛上，未設則完全不啟用。
    """

    def __init__(self, url: str, cooldown: float = 60.0) -> None:
        super().__init__(level=logging.WARNING)
        self._url = url
        self._cooldown = cooldown
        self._last: dict[str, float] = {}
        self._lock = threading.Lock()
        # Discord 用 "content"、Slack 與多數通用 webhook 用 "text"。
        self._payload_key = "content" if "discord" in url else "text"

    def emit(self, record: logging.LogRecord) -> None:
        try:
            key = f"{record.name}:{str(record.msg)[:80]}"
            now = time.monotonic()
            with self._lock:
                if now - self._last.get(key, 0.0) < self._cooldown:
                    return
                self._last[key] = now

            body = self.format(record)  # 已套 _redact 的 JSON
            if len(body) > 1500:
                body = body[:1500] + "…"
            text = f"⚠️ Agora 後端告警\n```json\n{body}\n```"
            data = json.dumps({self._payload_key: text}).encode("utf-8")
            threading.Thread(target=self._post, args=(data,), daemon=True).start()
        except Exception:
            pass

    def _post(self, data: bytes) -> None:
        try:
            req = urllib.request.Request(
                self._url, data=data, headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=5)  # noqa: S310 (url 來自自家環境變數)
        except Exception:
            pass


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """取得 tpcu.{name} 結構化 logger。"""
    return structlog.stdlib.get_logger(f"tpcu.{name}")


def setup_logging() -> None:
    """設定 structlog + stdlib，輸出到 stderr 與 logs/system.jsonl + logs/errors.jsonl。

    console 永遠彩色人讀格式（HH:MM:SS 本地時間）；file handler 永遠 JSON（ISO UTC）。
    LOG_LEVEL 環境變數控制層級（預設 INFO）。冪等：重入不重複加 handler。
    """
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    # timestamp 以外的共用前處理，timestamp 由各 formatter 自行加，避免格式衝突。
    base_processors = [
        merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        _redact,
    ]

    structlog.configure(
        processors=base_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    json_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=base_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
    )

    console_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=base_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.TimeStamper(fmt="%H:%M:%S", utc=False),
            _console_filter,
            _console_format,
            structlog.dev.ConsoleRenderer(colors=True, pad_event=0),
        ],
    )

    root = logging.getLogger()
    if not any(getattr(h, "_tpcu_json", False) for h in root.handlers):
        stream = logging.StreamHandler()
        stream.setFormatter(console_formatter)
        stream._tpcu_json = True
        root.addHandler(stream)

        _LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

        # system.jsonl — 每天午夜 rotate，保留 30 天
        file_handler = TimedRotatingFileHandler(
            _LOG_FILE, when="midnight", backupCount=30, encoding="utf-8"
        )
        file_handler.setFormatter(json_formatter)
        file_handler._tpcu_json = True
        root.addHandler(file_handler)

        # errors.jsonl — 僅 WARNING+，同樣按日 rotate
        error_handler = TimedRotatingFileHandler(
            _ERROR_FILE, when="midnight", backupCount=30, encoding="utf-8"
        )
        error_handler.setLevel(logging.WARNING)
        error_handler.setFormatter(json_formatter)
        error_handler._tpcu_json = True
        root.addHandler(error_handler)

        # 選用：WARNING+ 即時 webhook 告警。未設 ALERT_WEBHOOK_URL 則不掛。
        if alert_url := os.environ.get("ALERT_WEBHOOK_URL"):
            alert_handler = WebhookAlertHandler(
                alert_url, cooldown=float(os.environ.get("ALERT_COOLDOWN", "60"))
            )
            alert_handler.setFormatter(json_formatter)
            alert_handler._tpcu_json = True
            root.addHandler(alert_handler)

    root.setLevel(logging.WARNING)
    logging.getLogger("tpcu").setLevel(level)


def bind_request(request_id: str, uid: str | None = None) -> None:
    """把 request_id（與可選 uid）綁進 contextvars，貫穿整條請求鏈路。"""
    bind_contextvars(request_id=request_id)
    if uid:
        bind_contextvars(uid=uid)


def bind_uid(uid: str) -> None:
    """請求中途解析出 uid 時疊加進 contextvars（request_id 已先綁定）。"""
    if uid:
        bind_contextvars(uid=uid)


def clear_request() -> None:
    """請求結束時清除 contextvars，避免跨請求殘留。"""
    clear_contextvars()
