"""In-memory agent registry: opaque token → (ChatAgent, asyncio.Lock)."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from openai import OpenAI

from agent import ChatAgent, ChatMemory, ConversationLogger

_LOG_DIR_BASE = __import__("pathlib").Path("logs/api")
_EVICT_AFTER = 2 * 3600  # seconds of inactivity before eviction


@dataclass
class _UserState:
    uid: str
    agent: ChatAgent
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_active: float = field(default_factory=time.monotonic)


class AgentRegistry:
    def __init__(self, llm: OpenAI, model: str) -> None:
        self._llm = llm
        self._model = model
        self._store: dict[str, _UserState] = {}  # token → state
        self._meta_lock = asyncio.Lock()

    async def register(
        self,
        token: str,
        uid: str,
        jsessionid: str,
        llm: OpenAI | None = None,
        model: str | None = None,
    ) -> None:
        """Create a new agent for the user (called on successful /login).

        Pass llm/model to override the registry default (per-user config).
        """
        async with self._meta_lock:
            log_dir = _LOG_DIR_BASE / uid
            logger = ConversationLogger(log_dir)
            memory = ChatMemory()
            memory.remember("uid", uid)
            agent = ChatAgent(
                jsessionid=jsessionid,
                llm=llm if llm is not None else self._llm,
                model=model if model is not None else self._model,
                memory=memory,
                logger=logger,
                refresh_fn=None,  # no password stored — client must re-login
            )
            self._store[token] = _UserState(uid=uid, agent=agent)

    async def get(self, token: str) -> tuple[ChatAgent, asyncio.Lock] | None:
        """Return (agent, lock) for a token, or None if unknown/evicted."""
        async with self._meta_lock:
            self._evict()
            state = self._store.get(token)
            if state is None:
                return None
            state.last_active = time.monotonic()
            return state.agent, state.lock

    def get_jsessionid(self, token: str) -> str | None:
        state = self._store.get(token)
        return state.agent._session if state else None

    def get_uid(self, token: str) -> str | None:
        state = self._store.get(token)
        return state.uid if state else None

    def update_session(self, token: str, jsessionid: str) -> None:
        state = self._store.get(token)
        if state:
            state.agent.update_session(jsessionid)

    def _evict(self) -> None:
        now = time.monotonic()
        stale = [t for t, s in self._store.items() if now - s.last_active > _EVICT_AFTER]
        for t in stale:
            del self._store[t]
