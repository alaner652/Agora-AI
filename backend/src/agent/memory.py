from __future__ import annotations

_CONTEXT_WINDOW = 40


class ChatMemory:
    """Conversation history, data cache, and user preferences."""

    def __init__(self) -> None:
        self.history: list[dict] = []
        self.cache: dict = {}   # keyed by "schedule" / "absence" / "grades"
        self.prefs: dict = {}   # user preferences (e.g. last_semester)

    def add(self, msg: dict) -> None:
        self.history.append(msg)

    def get_context(self, max_msgs: int = _CONTEXT_WINDOW) -> list[dict]:
        """Return trimmed history safe for the next LLM call.

        Three-phase validation prevents the API from receiving broken context:
        1. Drop leading orphaned tool messages (no preceding assistant)
        2. Find a safe starting point (user msg, or assistant not mid-tool-chain)
        3. Validate tool call chains — assistant with tool_calls must be followed
           by all their tool results before the slice ends.
        """
        if len(self.history) <= max_msgs:
            return list(self.history)

        trimmed = self.history[-max_msgs:]

        # Phase 1: drop leading orphaned tool messages
        start = 0
        while start < len(trimmed) and trimmed[start].get("role") == "tool":
            start += 1

        # Phase 2: walk forward to a clean starting point
        while start < len(trimmed):
            role = trimmed[start].get("role")
            if role == "user":
                break
            if role == "assistant" and (start == 0 or trimmed[start - 1].get("role") != "tool"):
                break
            start += 1

        if start >= len(trimmed):
            for msg in reversed(self.history):
                if msg.get("role") == "user":
                    return [msg]
            return []

        trimmed = trimmed[start:]

        # Phase 3: ensure every assistant tool_call block has complete tool results
        result: list[dict] = []
        i = 0
        while i < len(trimmed):
            msg = trimmed[i]
            result.append(msg)
            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                expected = {tc["id"] for tc in msg["tool_calls"]}
                answered: set[str] = set()
                j = i + 1
                while j < len(trimmed) and trimmed[j].get("role") == "tool":
                    answered.add(trimmed[j].get("tool_call_id", ""))
                    result.append(trimmed[j])
                    j += 1
                if expected != answered:
                    # Incomplete chain at tail — drop this block entirely
                    result = result[: -len(answered) - 1]
                    break
                i = j
            else:
                i += 1

        if not result:
            for msg in reversed(self.history):
                if msg.get("role") == "user":
                    return [msg]
            return []

        return result

    def remember(self, key: str, value) -> None:
        self.prefs[key] = value

    def recall(self, key: str, default=None):
        return self.prefs.get(key, default)

    def clear(self) -> None:
        uid = self.prefs.get("uid", "")
        self.history.clear()
        self.cache.clear()
        self.prefs.clear()
        if uid:
            self.prefs["uid"] = uid

    def load(self, messages: list[dict]) -> None:
        self.history = list(messages)
        self.cache.clear()
