"""OpenAI-compatible streaming provider (covers Gemini and Ollama)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from .base import LLMProvider, ProviderChunk, TextChunk, ThinkingChunk, ToolCallDelta, UsageData


class OpenAICompatProvider(LLMProvider):
    def __init__(self, client: AsyncOpenAI, model: str) -> None:
        self._client = client
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    async def stream(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        disable_thinking: bool = False,
    ) -> AsyncIterator[ProviderChunk]:
        kwargs: dict = dict(
            model=self._model,
            messages=messages,
            stream=True,
            stream_options={"include_usage": True},
        )
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if disable_thinking:
            # Gemini: suppresses reasoning so no thought_signature is attached to
            # function calls, allowing them to be replayed in subsequent turns.
            kwargs["extra_body"] = {"thinkingConfig": {"thinkingBudget": 0}}

        # Accumulate tool call fragments by index; yield complete ones after stream ends
        pending: dict[int, dict] = {}  # index → {id, name, args}

        raw_stream = await self._client.chat.completions.create(**kwargs)
        async for chunk in raw_stream:
            # Usage-only final chunk
            if chunk.usage is not None:
                u = chunk.usage
                cached = (
                    getattr(getattr(u, "prompt_tokens_details", None), "cached_tokens", 0)
                    or 0
                )
                yield UsageData(
                    input_tokens=u.prompt_tokens,
                    output_tokens=u.completion_tokens,
                    cached_tokens=cached,
                )

            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta

            # Thinking tokens — Gemini thinking models expose reasoning_content
            thinking_text = (
                getattr(delta, "reasoning_content", None)
                or (delta.model_extra or {}).get("reasoning_content")
                or (delta.model_extra or {}).get("thought")
            )
            if thinking_text:
                yield ThinkingChunk(text=thinking_text)

            # Regular text
            if delta.content:
                yield TextChunk(text=delta.content)

            # Accumulate tool call fragments (do NOT yield per-fragment)
            for tc in delta.tool_calls or []:
                idx = tc.index
                if idx not in pending:
                    pending[idx] = {"id": "", "name": "", "args": "", "thought_signature": None}
                if tc.id:
                    pending[idx]["id"] = tc.id
                if tc.function and tc.function.name:
                    pending[idx]["name"] = tc.function.name
                if tc.function and tc.function.arguments:
                    pending[idx]["args"] += tc.function.arguments
                # Gemini thinking mode: capture thought_signature from either
                # the function object or the tool-call object itself
                fn_extra = getattr(tc.function, "model_extra", None) or {}
                tc_extra = getattr(tc, "model_extra", None) or {}
                sig = fn_extra.get("thought_signature") or tc_extra.get("thought_signature")
                if sig:
                    pending[idx]["thought_signature"] = sig

        # Yield complete tool calls (args_fragment holds the full JSON string)
        for idx in sorted(pending):
            tc = pending[idx]
            yield ToolCallDelta(
                index=idx,
                id=tc["id"],
                name=tc["name"],
                args_fragment=tc["args"],
                thought_signature=tc.get("thought_signature"),
            )
