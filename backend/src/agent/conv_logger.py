"""Append-only conversation logger — writes one JSON file per session."""

from __future__ import annotations

import json
import pathlib
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

from utils.date import TZ


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
    _meta: dict | None = None


@dataclass
class SessionLog:
    session_id: str
    started_at: str
    ended_at: str = ""
    model: str = ""
    turns: list[TurnLog] = field(default_factory=list)


_SENSITIVE = {"jsessionid", "password", "pwd"}


class ConversationLogger:
    """Writes a JSON file per session under `log_dir/`.

    Hooks (call in order per turn):
        on_user_message(text)
        on_tool_call(name, args, result_json, latency_ms)   [0..N times]
        on_assistant_response(text, *, llm_calls, llm_ms, token_usage)
    Call close() when the session ends to stamp ended_at.
    """

    def __init__(
        self,
        log_dir: pathlib.Path,
        keep: int = 30,
        uid: str = "",
        model: str = "",
        persist_fn: Callable[[str, str, str, str, int, str, int, str, str], None] | None = None,
    ) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        self._dir = log_dir
        self._uid = uid
        self._model = model
        self._persist_fn = persist_fn
        self._title = ""
        self._session = self._new_session()
        self._current_turn: TurnLog | None = None
        self._turn_start: float = 0.0
        self._rotate(keep)

    # ------------------------------------------------------------------
    # Hooks
    # ------------------------------------------------------------------

    def on_user_message(self, text: str) -> None:
        turn_id = len(self._session.turns) + 1
        self._current_turn = TurnLog(turn_id=turn_id, user=text)
        self._turn_start = time.monotonic()
        if not self._title:
            self._title = text[:30]

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

    def on_assistant_response(
        self,
        text: str,
        *,
        llm_calls: int = 0,
        llm_ms: float = 0.0,
        token_usage: dict | None = None,
    ) -> None:
        if self._current_turn is None:
            return
        self._current_turn.assistant = text
        total_ms = round((time.monotonic() - self._turn_start) * 1000, 1)
        tool_ms = round(sum(tc.latency_ms for tc in self._current_turn.tool_calls), 1)
        self._current_turn._meta = {
            "confidence": self._compute_confidence(self._current_turn),
            "latency": {
                "total_ms": total_ms,
                "llm_ms": round(llm_ms, 1),
                "tool_ms": tool_ms,
            },
            "llm_calls": llm_calls,
            **({"tokens": token_usage} if token_usage else {}),
        }
        self._session.turns.append(self._current_turn)
        self._current_turn = None
        self._flush()

    def flush_on_error(self) -> None:
        """Flush current partial turn on abnormal exit (no assistant response recorded)."""
        if self._current_turn is None:
            return
        self._current_turn._meta = {"error": True}
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

        _PATH_PATTERNS = ("/Users/", "/home/", "/root/", "output/", ".json")
        path_query = any(p in turn.user for p in _PATH_PATTERNS)
        hallucination_risk = path_query and len(calls) == 0

        score = 1.0
        if not all_ok:
            score -= 0.4
        if error_codes:
            score -= 0.2
        if has_unconfirmed:
            score -= 0.2
        if used_confirm:
            score += 0.1
        if hallucination_risk:
            score -= 0.3
        score = max(0.0, min(1.0, round(score, 2)))

        return {
            "score": score,
            "source": "rule",
            "signals": {
                "all_tools_ok":       all_ok,
                "used_ask_user":      used_confirm,
                "unconfirmed":        has_unconfirmed,
                "tool_count":         len(calls),
                "error_codes":        error_codes,
                "hallucination_risk": hallucination_risk,
            },
        }

    def set_model(self, model: str) -> None:
        self._model = model
        self._session.model = model

    def start_new_session(self) -> None:
        if self._current_turn is not None:
            self._session.turns.append(self._current_turn)
            self._current_turn = None
        self._flush()
        self._title = ""
        self._session = self._new_session()

    def close(self) -> None:
        self._session.ended_at = datetime.now(TZ).isoformat(timespec="milliseconds")
        self._flush()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _new_session(self) -> SessionLog:
        now = datetime.now(TZ)
        date_str = now.strftime("%Y-%m-%d")
        existing = list(self._dir.glob(f"{date_str}-session-*.json"))
        idx = len(existing) + 1
        return SessionLog(
            session_id=f"{date_str}-session-{idx:02d}",
            started_at=now.isoformat(timespec="milliseconds"),
            model=self._model,
        )

    def _rotate(self, keep: int) -> None:
        files = sorted(self._dir.glob("*.json"))
        for old in files[:-keep] if len(files) > keep else []:
            old.unlink(missing_ok=True)

    def _flush(self) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        path = self._dir / f"{self._session.session_id}.json"
        path.write_text(
            json.dumps(asdict(self._session), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        if self._persist_fn and self._session.turns:
            t = self._session.turns[-1]
            tool_calls_data = [
                {
                    "name": tc.name,
                    "input": tc.args,
                    "output": tc.result,
                    "ok": tc.ok,
                    "latency_ms": tc.latency_ms,
                    "error_code": tc.error_code,
                }
                for tc in t.tool_calls
            ]
            self._persist_fn(
                self._session.session_id,
                self._uid,
                self._session.started_at,
                self._session.ended_at,
                len(self._session.turns),
                self._title,
                t.turn_id,
                t.user,
                t.assistant,
                tool_calls_data,
            )
