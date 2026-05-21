import json
import pathlib
from datetime import datetime

OUTPUT_DIR = pathlib.Path("output")


def save_json(filename: str, payload: dict) -> pathlib.Path:
    payload["generated_at"] = datetime.now().isoformat(timespec="seconds")
    path = OUTPUT_DIR / filename
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
