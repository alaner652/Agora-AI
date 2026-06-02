#!/usr/bin/env python3
"""Entry point: start the TPCU FastAPI server."""

import os
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent / "src"))

import uvicorn

from log import setup_logging

HOST = os.getenv("API_HOST", "0.0.0.0")
PORT = int(os.getenv("API_PORT", "8000"))

if __name__ == "__main__":
    setup_logging()
    # log_config=None：不讓 uvicorn 安裝自己的 handler，改由 setup_logging
    # 設定的 root JSON handler 接管。access log 由 app.py 的 middleware 取代。
    uvicorn.run(
        "api.app:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_config=None,
        access_log=False,
    )