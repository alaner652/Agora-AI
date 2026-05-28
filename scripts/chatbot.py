import asyncio
import os
import pathlib
import sys

from dotenv import load_dotenv
from openai import OpenAI, APITimeoutError, APIConnectionError

load_dotenv()

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))

from log import setup_logging
from session import get_session, refresh
from agent import (
    ChatAgent,
    ChatMemory,
    TextDeltaEvent,
    ToolCallEvent,
    AskUserEvent,
    DoneEvent,
)
from agent.tools import dispatch as _preflight

UID      = os.environ.get("TPCU_UID", "")
API_KEY  = os.environ.get("LLM_API_KEY", "")
BASE_URL = os.environ.get("LLM_BASE_URL", "")
MODEL    = os.environ.get("LLM_MODEL", "gpt-4o-mini")


def _show_image(path: str) -> None:
    abs_path = pathlib.Path(path).resolve()
    uri = abs_path.as_uri()
    print(f"\033]8;;{uri}\a{abs_path.name}\033]8;;\a", flush=True)


def _cli_ask(question: str, options: list[str]) -> str:
    print(f"\n{question}")
    for i, opt in enumerate(options, 1):
        print(f"  [{i}] {opt}")
    while True:
        try:
            raw = input("請選擇: ").strip()
        except (EOFError, KeyboardInterrupt):
            return "取消"
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return options[int(raw) - 1]
        print("  無效輸入，請重試")


async def _drain(agent: ChatAgent, gen):
    """Consume an event stream, handling AskUser by re-entering answer_ask_user."""
    import json
    async for event in gen:
        if isinstance(event, ToolCallEvent):
            print(f"  [{event.name}]", flush=True)
        elif isinstance(event, TextDeltaEvent):
            print(event.text, end="", flush=True)
        elif isinstance(event, AskUserEvent):
            answer = _cli_ask(event.question, event.options)
            await _drain(agent, agent.answer_ask_user(answer))
        elif isinstance(event, DoneEvent):
            # If a render_image tool produced an image path, show it
            last_result = None
            for msg in reversed(agent._memory.history):
                if msg.get("role") == "tool":
                    last_result = msg.get("content", "")
                    break
            if last_result:
                try:
                    data = json.loads(last_result)
                    if isinstance(data, dict) and "path" in data:
                        _show_image(data["path"])
                except (json.JSONDecodeError, KeyError):
                    pass
            print("\n")


async def chat() -> None:
    uid = UID or input("學號：").strip()
    if not uid:
        raise SystemExit("學號不可空白")
    api_key = API_KEY or input("LLM API Key：").strip()
    if not api_key:
        raise SystemExit("API Key 不可空白")

    jsessionid = await get_session(uid)

    # Pre-flight: ck001_02.jsp only confirms the token is alive; the schedule
    # gateway (sys001_00.jsp) needs a fresh session to return semester data.
    # Catch that here so the user isn't interrupted mid-conversation.
    try:
        await _preflight("get_semester_options", {}, jsessionid, ChatMemory())
    except ValueError:
        jsessionid = await refresh(uid)

    llm = OpenAI(api_key=api_key, base_url=BASE_URL or None, timeout=60.0)
    memory = ChatMemory()
    memory.remember("uid", uid)
    agent = ChatAgent(jsessionid=jsessionid, llm=llm, model=MODEL, memory=memory)

    print(f"已連線（{MODEL}）")
    print("輸入 exit 離開\n")

    while True:
        try:
            user_input = input("你：").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再見")
            break

        if user_input.lower() in ("exit", "quit", "bye", "掰掰", "再見"):
            print("再見")
            break
        if not user_input:
            continue

        print("思考中...", end="", flush=True)
        try:
            print("\r\033[KAI：", end="", flush=True)
            await _drain(agent, agent.step(user_input))
        except (APITimeoutError, APIConnectionError):
            print("\r\033[KAI 連線失敗，請重試\n")


if __name__ == "__main__":
    setup_logging()
    asyncio.run(chat())
