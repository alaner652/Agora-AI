"""In-memory agent registry: opaque token → (ChatAgent, asyncio.Lock)."""

from __future__ import annotations

import asyncio
import time
import time as _time
from dataclasses import dataclass, field

from openai import OpenAI

from agent import ChatAgent, ChatMemory, ConversationLogger
from storage.messages import upsert_conversation_turn
from storage.sessions import insert_session_turn, upsert_session_meta

_LOG_DIR_BASE = __import__("pathlib").Path(__file__).parent.parent.parent / "logs" / "api"
_EVICT_AFTER = 2 * 3600  # seconds of inactivity before eviction


def _make_persist_fn(uid: str):
    def _persist(sid, _uid, started, ended, count, title, turn_id, user, assistant, tool_calls=None, user_kind="text"):
        upsert_session_meta(sid, uid, started, ended, count, title)
        insert_session_turn(sid, turn_id, user, assistant)
        upsert_conversation_turn(
            sid, turn_id, user, assistant,
            tool_calls or [],
            _time.time(),
            user_kind=user_kind,
        )
    return _persist


@dataclass
class _UserState:
    uid: str
    agent: ChatAgent
    byok: bool = False  # True = 使用者自帶金鑰，免費額度不計數、不擋
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
        byok: bool = False,
    ) -> None:
        """Create a new agent for the user (called on successful /login).

        Pass llm/model to override the registry default (per-user config).
        `byok=True` marks the token as using its own key (exempt from quota).
        """
        async with self._meta_lock:
            log_dir = _LOG_DIR_BASE / uid
            effective_model = model if model is not None else self._model
            logger = ConversationLogger(log_dir, uid=uid, model=effective_model, persist_fn=_make_persist_fn(uid))
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
            self._store[token] = _UserState(uid=uid, agent=agent, byok=byok)

    def is_byok(self, token: str) -> bool:
        """True if this token authenticated with its own LLM key (quota-exempt)."""
        state = self._store.get(token)
        return bool(state and state.byok)

    async def get(self, token: str) -> tuple[ChatAgent, asyncio.Lock] | None:
        """Return (agent, lock) for a token, or None if unknown/evicted."""
        async with self._meta_lock:
            self._evict()
            state = self._store.get(token)
            if state is None:
                return None
            state.last_active = time.monotonic()
            return state.agent, state.lock

    def get_uid(self, token: str) -> str | None:
        state = self._store.get(token)
        return state.uid if state else None

    async def get_jsessionid_checked(self, token: str) -> str | None:
        """Eviction-aware variant — triggers _evict() and updates last_active."""
        async with self._meta_lock:
            self._evict()
            state = self._store.get(token)
            if state is None:
                return None
            state.last_active = time.monotonic()
            return state.agent._session

    async def get_uid_checked(self, token: str) -> str | None:
        """Eviction-aware variant — triggers _evict() and updates last_active."""
        async with self._meta_lock:
            self._evict()
            state = self._store.get(token)
            if state is None:
                return None
            state.last_active = time.monotonic()
            return state.uid

    def update_session(self, token: str, jsessionid: str) -> None:
        state = self._store.get(token)
        if state:
            state.agent.update_session(jsessionid)

    def get_current_session_id(self, token: str) -> str | None:
        state = self._store.get(token)
        if state and state.agent._logger:
            return state.agent._logger._session.session_id
        return None

    async def restore_session(self, token: str, messages: list[dict]) -> None:
        async with self._meta_lock:
            state = self._store.get(token)
            if state:
                state.agent._memory.load(messages)

    async def new_session(self, token: str) -> None:
        async with self._meta_lock:
            state = self._store.get(token)
            if state:
                state.agent.new_session()

    def _evict(self) -> None:
        now = time.monotonic()
        stale = [t for t, s in self._store.items() if now - s.last_active > _EVICT_AFTER]
        for t in stale:
            del self._store[t]
