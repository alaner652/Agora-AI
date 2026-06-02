"""結構化 logging 基礎設施(structlog + stdlib 橋接)。

- get_logger(name): 取得 tpcu.{name} logger。慣例：actions.fetch_schedule、parsers.schedule 等。
  回傳的 logger 相容於既有 `_log.info("msg %s", x)` 的 %-style 呼叫。
- setup_logging(): 由入口點（main.py）呼叫一次，設定 JSON 輸出與 handler。
- bind_request()/clear_request(): 把 request_id / uid 綁進 contextvars，
  之後所有 log 自動帶上，貫穿 middleware → agent → tools → client。
"""

from __future__ import annotations

import logging
import os
import pathlib

import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars, merge_contextvars

# 集中式敏感欄位遮蔽清單。新增的 client/middleware log 不會外洩這些值。
_SENSITIVE = {
    "jsessionid", "password", "pwd", "token", "api_key",
    "authorization", "cookie", "cookies", "set-cookie",
}
_REDACTED = "***"

_LOG_FILE = pathlib.Path("logs/system.jsonl")


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


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """取得 tpcu.{name} 結構化 logger。"""
    return structlog.stdlib.get_logger(f"tpcu.{name}")


def setup_logging() -> None:
    """設定 structlog + stdlib，輸出 JSON 到 stderr 與 logs/system.jsonl。

    LOG_LEVEL 環境變數控制層級（預設 INFO）。冪等：重入不重複加 handler。
    """
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    # structlog 與 stdlib 共用的前處理鏈（contextvars → redaction → 位置參數）。
    shared_processors = [
        merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        _redact,
    ]

    structlog.configure(
        processors=shared_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # ProcessorFormatter 讓 stdlib LogRecord（含 uvicorn 等第三方）也走 JSON 渲染。
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
    )

    # Handler 掛在 root，讓 uvicorn 等第三方 log 也走 JSON 渲染（透過
    # foreign_pre_chain）。root 維持 WARNING 以避免第三方 INFO 噪音；
    # tpcu.* 自己設成 LOG_LEVEL，其 INFO 仍會冒泡到 root handler。
    root = logging.getLogger()
    if not any(getattr(h, "_tpcu_json", False) for h in root.handlers):
        stream = logging.StreamHandler()
        stream.setFormatter(formatter)
        stream._tpcu_json = True
        root.addHandler(stream)

        _LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(_LOG_FILE, encoding="utf-8")
        file_handler.setFormatter(formatter)
        file_handler._tpcu_json = True
        root.addHandler(file_handler)

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
