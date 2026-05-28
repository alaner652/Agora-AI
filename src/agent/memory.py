from __future__ import annotations


_MAX_MESSAGES = 40


class ChatMemory:
    """Conversation history, data cache, and user preferences."""

    def __init__(self) -> None:
        self.history: list[dict] = []
        self.cache: dict = {}   # keyed by "schedule" / "absence" / "grades"
        self.prefs: dict = {}   # user preferences (e.g. last_semester)

    def add(self, msg: dict) -> None:
        self.history.append(msg)

    def get_context(self, max_msgs: int = _MAX_MESSAGES) -> list[dict]:
        """Return trimmed history safe for the next LLM call.

        Fixes the original bug: after slicing, if the first message is a tool
        result (no preceding assistant tool_call), walk forward until we reach
        a safe starting point so the API never receives an orphaned tool msg.
        """
        if len(self.history) <= max_msgs:
            return list(self.history)

        trimmed = self.history[-max_msgs:]

        # Drop leading tool messages that have no matching assistant message
        while trimmed and trimmed[0].get("role") == "tool":
            trimmed = trimmed[1:]

        # If everything was trimmed, return the single most-recent user message
        # so the next API call always has something to work with.
        if not trimmed:
            for msg in reversed(self.history):
                if msg.get("role") == "user":
                    return [msg]
            return []

        return trimmed

    def remember(self, key: str, value) -> None:
        self.prefs[key] = value

    def recall(self, key: str, default=None):
        return self.prefs.get(key, default)
