"""Abstract base class and chunk types for LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field


@dataclass
class TextChunk:
    text: str


@dataclass
class ThinkingChunk:
    text: str


@dataclass
class ToolCallDelta:
    index: int
    id: str | None
    name: str | None
    args_fragment: str
    # Gemini thinking mode: must be replayed verbatim in conversation history
    thought_signature: str | None = None


@dataclass
class UsageData:
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0
    thinking_tokens: int = 0


ProviderChunk = TextChunk | ThinkingChunk | ToolCallDelta | UsageData


class LLMProvider(ABC):
    @abstractmethod
    def stream(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        disable_thinking: bool = False,
    ) -> AsyncIterator[ProviderChunk]:
        """Stream chunks from the LLM. Yields text, thinking, tool call deltas, and usage.

        disable_thinking: when True, send thinkingBudget=0 so Gemini skips reasoning.
        Required for continuation calls after a thinking+tool_call round, because
        Gemini rejects replayed tool_calls that lack a thought_signature.
        """
        ...

    @property
    @abstractmethod
    def model(self) -> str: ...
