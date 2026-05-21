import logging
import os


def get_logger(name: str) -> logging.Logger:
    """取得 tpcu.{name} logger。慣例：actions.fetch_schedule、parsers.schedule 等。"""
    return logging.getLogger(f"tpcu.{name}")


def setup_logging() -> None:
    """由 scripts/ 入口點呼叫一次，設定 root handler。LOG_LEVEL 環境變數控制層級（預設 WARNING）。"""
    level_name = os.environ.get("LOG_LEVEL", "WARNING").upper()
    level = getattr(logging, level_name, logging.WARNING)
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    ))
    root = logging.getLogger("tpcu")
    root.setLevel(level)
    if not root.handlers:
        root.addHandler(handler)
