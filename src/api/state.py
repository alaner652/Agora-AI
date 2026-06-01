"""In-memory agent registry: opaque token → multi-session state."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from agent import ChatAgent, ChatMemory, ConversationLogger
from agent.providers import OpenAICompatProvider, LLMProvider
from storage import create_session, load_history, save_history

_LOG_DIR_BASE = __import__("pathlib").Path("logs/api")
_EVICT_AFTER = 2 * 3600  # seconds of inactivity before eviction


@dataclass
class _SessionState:
    agent: ChatAgent
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_active: float = field(default_factory=time.monotonic)


@dataclass
class _UserState:
    uid: str
    jsessionid: str
    active_session_id: str | None
    sessions: dict[str, _SessionState] = field(default_factory=dict)  # session_id → state


class AgentRegistry:
    def __init__(self, provider: LLMProvider) -> None:
        self._default_provider = provider
        self._store: dict[str, _UserState] = {}  # token → state
        self._meta_lock = asyncio.Lock()

    def _make_agent(
        self,
        uid: str,
        jsessionid: str,
        session_id: str,
        provider: LLMProvider,
        token: str,
    ) -> ChatAgent:
        log_dir = _LOG_DIR_BASE / uid
        logger = ConversationLogger(log_dir)
        memory = ChatMemory()
        memory.remember("uid", uid)
        memory.remember("session_id", session_id)
        # Restore persisted history
        history = load_history(session_id)
        memory.history = history
        # Auto-refresh function: called when session expires
        async def refresh_fn(uid: str) -> str:
            """Automatically refresh TPCU session when expired."""
            from session import refresh_api as _fresh_login
            new_jsessionid = await _fresh_login(uid)
            self.update_session(token, new_jsessionid)
            return new_jsessionid
        return ChatAgent(
            jsessionid=jsessionid,
            provider=provider,
            memory=memory,
            logger=logger,
            refresh_fn=refresh_fn,
        )

    async def register(
        self,
        token: str,
        uid: str,
        jsessionid: str,
        provider: LLMProvider | None = None,
    ) -> str:
        """Create a new default session for the user (called on /login). Returns session_id."""
        effective_provider = provider if provider is not None else self._default_provider
        async with self._meta_lock:
            session_id = create_session(uid)
            agent = self._make_agent(uid, jsessionid, session_id, effective_provider, token)
            sess_state = _SessionState(agent=agent)
            self._store[token] = _UserState(
                uid=uid,
                jsessionid=jsessionid,
                active_session_id=session_id,
                sessions={session_id: sess_state},
            )
        return session_id

    async def get(self, token: str) -> tuple[ChatAgent, asyncio.Lock] | None:
        """Return (agent, lock) for the active session, or None if unknown/evicted."""
        async with self._meta_lock:
            self._evict()
            state = self._store.get(token)
            if state is None or state.active_session_id is None:
                return None
            sess = state.sessions.get(state.active_session_id)
            if sess is None:
                return None
            sess.last_active = time.monotonic()
            return sess.agent, sess.lock

    async def get_by_session(
        self, token: str, session_id: str
    ) -> tuple[ChatAgent, asyncio.Lock] | None:
        """Return (agent, lock) for a specific session_id."""
        async with self._meta_lock:
            self._evict()
            state = self._store.get(token)
            if state is None:
                return None
            sess = state.sessions.get(session_id)
            if sess is None:
                return None
            sess.last_active = time.monotonic()
            return sess.agent, sess.lock

    async def create_session(self, token: str) -> str | None:
        """Create a new session for this user, return session_id. Does NOT activate it."""
        async with self._meta_lock:
            state = self._store.get(token)
            if state is None:
                return None
            session_id = create_session(state.uid)
            provider = self._default_provider
            if state.sessions:
                # Reuse same provider as existing session
                any_agent = next(iter(state.sessions.values())).agent
                provider = any_agent._provider
            agent = self._make_agent(state.uid, state.jsessionid, session_id, provider, token)
            state.sessions[session_id] = _SessionState(agent=agent)
        return session_id

    async def switch_session(self, token: str, session_id: str) -> bool:
        """Activate a session. Saves current session memory first. Returns False if not found."""
        async with self._meta_lock:
            state = self._store.get(token)
            if state is None:
                return False

            # Persist current active session's memory
            if state.active_session_id and state.active_session_id in state.sessions:
                cur = state.sessions[state.active_session_id]
                save_history(state.active_session_id, state.uid, cur.agent._memory.history)

            # Load target session (create in-memory agent if not already loaded)
            if session_id not in state.sessions:
                provider = self._default_provider
                if state.sessions:
                    any_agent = next(iter(state.sessions.values())).agent
                    provider = any_agent._provider
                agent = self._make_agent(state.uid, state.jsessionid, session_id, provider, token)
                state.sessions[session_id] = _SessionState(agent=agent)

            state.active_session_id = session_id
            state.sessions[session_id].last_active = time.monotonic()
        return True

    def get_active_session_id(self, token: str) -> str | None:
        state = self._store.get(token)
        return state.active_session_id if state else None

    def get_uid(self, token: str) -> str | None:
        state = self._store.get(token)
        return state.uid if state else None

    def get_jsessionid(self, token: str) -> str | None:
        state = self._store.get(token)
        return state.jsessionid if state else None

    def update_session(self, token: str, jsessionid: str) -> None:
        state = self._store.get(token)
        if state is None:
            return
        state.jsessionid = jsessionid
        for sess in state.sessions.values():
            sess.agent.update_session(jsessionid)

    def _evict(self) -> None:
        now = time.monotonic()
        stale_tokens = []
        for token, state in self._store.items():
            # Persist and evict idle sessions within a user
            idle = [sid for sid, s in state.sessions.items() if now - s.last_active > _EVICT_AFTER]
            for sid in idle:
                sess = state.sessions.pop(sid)
                save_history(sid, state.uid, sess.agent._memory.history)
            # If no sessions remain and the user is inactive, remove the token
            if not state.sessions:
                stale_tokens.append(token)
        for t in stale_tokens:
            del self._store[t]
