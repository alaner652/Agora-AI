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
        
        Ensures:
        1. No orphaned tool messages (tool result without preceding assistant call)
        2. No broken tool chains (assistant tool_call must be followed by complete tool results)
        3. Always returns at least one user message if history exists
        """
        if len(self.history) <= max_msgs:
            return list(self.history)

        trimmed = self.history[-max_msgs:]

        # Phase 1: Drop leading orphaned tool messages
        start_idx = 0
        while start_idx < len(trimmed) and trimmed[start_idx].get("role") == "tool":
            start_idx += 1
        
        # Phase 2: Find a safe starting point (user or assistant message)
        # Walk forward from start_idx until we find a user or initial assistant message
        while start_idx < len(trimmed):
            msg = trimmed[start_idx]
            role = msg.get("role")
            
            # Safe to start from: user, or assistant without preceding incomplete tool_call
            if role == "user":
                break
            if role == "assistant":
                # Check if this is an initial message (not a continuation of tool calls)
                if start_idx == 0 or trimmed[start_idx - 1].get("role") != "tool":
                    break
            
            start_idx += 1
        
        if start_idx >= len(trimmed):
            # Couldn't find a safe starting point; return most recent user message
            for msg in reversed(self.history):
                if msg.get("role") == "user":
                    return [msg]
            return []
        
        trimmed = trimmed[start_idx:]

        # Phase 3: Validate tool call chains
        # If trimmed ends with an assistant message that has tool_calls,
        # ensure they would be answered by tool results in subsequent messages
        result = []
        i = 0
        while i < len(trimmed):
            msg = trimmed[i]
            result.append(msg)
            
            # If this is an assistant message with tool calls, ensure tool results follow
            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                tool_call_ids = {tc["id"] for tc in msg.get("tool_calls", [])}
                answered_ids = set()
                
                # Collect tool results for these tool calls
                j = i + 1
                while j < len(trimmed) and trimmed[j].get("role") == "tool":
                    tool_call_id = trimmed[j].get("tool_call_id")
                    if tool_call_id in tool_call_ids:
                        answered_ids.add(tool_call_id)
                    result.append(trimmed[j])
                    j += 1
                
                # If some tool calls are not answered, we have a broken chain at the boundary
                # Stop here to avoid incomplete context
                if len(answered_ids) < len(tool_call_ids):
                    # Remove unanswered tool calls and their assistant message
                    result = result[:-1]  # Remove the assistant message with incomplete tool_calls
                    break
                
                i = j - 1

            i += 1

        # Ensure we always have at least one user message to work with
        if not result or not any(m.get("role") == "user" for m in result):
            for msg in reversed(self.history):
                if msg.get("role") == "user":
                    return [msg]
            return []

        return result

    def remember(self, key: str, value) -> None:
        self.prefs[key] = value

    def recall(self, key: str, default=None):
        return self.prefs.get(key, default)
