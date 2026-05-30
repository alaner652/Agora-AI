"""Append-only conversation logger — writes one JSON file per session."""

from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any


@dataclass
class ToolCallLog:
    name: str
    args: dict
    result: Any
    latency_ms: float
    ok: bool
    error_code: str | None = None
    unconfirmed: bool = False


@dataclass
class TurnLog:
    turn_id: int
    user: str
    tool_calls: list[ToolCallLog] = field(default_factory=list)
    assistant: str = ""
    confidence: dict | None = None


@dataclass
class SessionLog:
    session_id: str
    started_at: str
    ended_at: str = ""
    turns: list[TurnLog] = field(default_factory=list)


_SENSITIVE = {"jsessionid", "password", "pwd"}


class ConversationLogger:
    """Writes a JSON file per session under `log_dir/`.

    Hooks (call in order per turn):
        on_user_message(text)
        on_tool_call(name, args, result_json, latency_ms)   [0..N times]
        on_assistant_response(text)
    Call close() when the session ends to stamp ended_at.
    """

    def __init__(self, log_dir: pathlib.Path, keep: int = 30) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        self._dir = log_dir
        self._session = self._new_session()
        self._current_turn: TurnLog | None = None
        self._rotate(keep)

    # ------------------------------------------------------------------
    # Hooks
    # ------------------------------------------------------------------

    def on_user_message(self, text: str) -> None:
        turn_id = len(self._session.turns) + 1
        self._current_turn = TurnLog(turn_id=turn_id, user=text)

    def on_tool_call(
        self,
        name: str,
        args: dict,
        result_json: str,
        latency_ms: float,
        unconfirmed: bool = False,
    ) -> None:
        if self._current_turn is None:
            return
        try:
            result = json.loads(result_json)
            if isinstance(result, dict):
                # Error if: has "error" key (legacy _err format) OR success is explicitly False
                ok = not ("error" in result or result.get("success") is False)
                error_code = result.get("error_code")
            else:
                ok, error_code = True, None
        except Exception:
            result, ok, error_code = result_json, False, "PARSE_ERROR"

        safe_args = {k: v for k, v in args.items() if k.lower() not in _SENSITIVE}
        self._current_turn.tool_calls.append(
            ToolCallLog(
                name=name,
                args=safe_args,
                result=result,
                latency_ms=round(latency_ms, 1),
                ok=ok,
                error_code=error_code,
                unconfirmed=unconfirmed,
            )
        )

    def on_assistant_response(self, text: str) -> None:
        if self._current_turn is None:
            return
        self._current_turn.assistant = text
        self._current_turn.confidence = self._compute_confidence(self._current_turn)
        self._session.turns.append(self._current_turn)
        self._current_turn = None
        self._flush()

    # ------------------------------------------------------------------
    # Confidence scoring
    # ------------------------------------------------------------------

    def _compute_confidence(self, turn: TurnLog) -> dict:
        calls = turn.tool_calls
        all_ok = all(tc.ok for tc in calls) if calls else True
        error_codes = [tc.error_code for tc in calls if tc.error_code]
        used_confirm = any(tc.name == "ask_user" for tc in calls)
        has_unconfirmed = any(tc.unconfirmed for tc in calls)

        score = 1.0
        if not all_ok:        score -= 0.4
        if error_codes:       score -= 0.2
        if has_unconfirmed:   score -= 0.2
        if used_confirm:      score += 0.1
        score = max(0.0, min(1.0, round(score, 2)))

        return {
            "score": score,
            "source": "rule",
            "signals": {
                "all_tools_ok":  all_ok,
                "used_ask_user": used_confirm,
                "unconfirmed":   has_unconfirmed,
                "tool_count":    len(calls),
                "error_codes":   error_codes,
            },
        }

    def close(self) -> None:
        self._session.ended_at = datetime.now().isoformat(timespec="milliseconds")
        self._flush()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _new_session(self) -> SessionLog:
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        existing = list(self._dir.glob(f"{date_str}-session-*.json"))
        idx = len(existing) + 1
        return SessionLog(
            session_id=f"{date_str}-session-{idx:02d}",
            started_at=now.isoformat(timespec="milliseconds"),
        )

    def _rotate(self, keep: int) -> None:
        files = sorted(self._dir.glob("*.json"))
        for old in files[:-keep] if len(files) > keep else []:
            old.unlink(missing_ok=True)

    def _flush(self) -> None:
        path = self._dir / f"{self._session.session_id}.json"
        path.write_text(
            json.dumps(asdict(self._session), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
