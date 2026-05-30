"""In-memory agent registry: token → (ChatAgent, asyncio.Lock)."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from openai import OpenAI

from agent import ChatAgent, ChatMemory, ConversationLogger
from agent.agent import SYSTEM_PROMPT  # noqa: F401 (re-used by app.py)

_LOG_DIR_BASE = __import__("pathlib").Path(".logs/api")
_EVICT_AFTER = 2 * 3600  # 2 hours of inactivity


@dataclass
class _UserState:
    agent: ChatAgent
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_active: float = field(default_factory=time.monotonic)


class AgentRegistry:
    def __init__(self, llm: OpenAI, model: str) -> None:
        self._llm = llm
        self._model = model
        self._store: dict[str, _UserState] = {}
        self._meta_lock = asyncio.Lock()

    async def get_or_create(self, token: str, jsessionid: str) -> tuple[ChatAgent, asyncio.Lock]:
        async with self._meta_lock:
            self._evict()
            if token not in self._store:
                log_dir = _LOG_DIR_BASE / token
                logger = ConversationLogger(log_dir)
                memory = ChatMemory()
                memory.remember("uid", token)
                agent = ChatAgent(
                    jsessionid=jsessionid,
                    llm=self._llm,
                    model=self._model,
                    memory=memory,
                    logger=logger,
                )
                self._store[token] = _UserState(agent=agent)
            state = self._store[token]
            state.last_active = time.monotonic()
            return state.agent, state.lock

    def update_session(self, token: str, jsessionid: str) -> None:
        if token in self._store:
            self._store[token].agent.update_session(jsessionid)

    def _evict(self) -> None:
        now = time.monotonic()
        stale = [t for t, s in self._store.items() if now - s.last_active > _EVICT_AFTER]
        for t in stale:
            del self._store[t]
