#!/usr/bin/env python3
"""Entry point: start the TPCU FastAPI server."""

import os
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "src"))

import uvicorn

HOST = os.getenv("API_HOST", "0.0.0.0")
PORT = int(os.getenv("API_PORT", "8000"))

if __name__ == "__main__":
    uvicorn.run("api.app:app", host=HOST, port=PORT, reload=False)