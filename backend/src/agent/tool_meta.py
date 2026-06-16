"""Tool registry types — schema, capability metadata, handler, and arg validation.

A `ToolSpec` is the single source of truth for one tool: it carries the JSON
schema shown to the LLM, the capability metadata (danger level, preconditions,
side effects), and the async handler that executes it. The concrete `REGISTRY`
that binds names to specs lives in `tools.py` (where the handlers are defined),
so this module stays free of any business / action imports.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .memory import ChatMemory


@dataclass
class ToolContext:
    """Everything a tool handler needs from the agent, bundled into one object."""

    jsessionid: str
    memory: ChatMemory


@dataclass
class ToolSpec:
    name: str
    description: str = ""
    parameters: dict = field(default_factory=dict)        # OpenAI / JSON schema
    handler: Callable[[dict, ToolContext], Awaitable[str]] | None = None
    danger_level: int = 0                                  # 0=唯讀 1=需確認 2=不可逆
    requires_session: bool = True
    preconditions: list[str] = field(default_factory=list)
    side_effects: list[str] = field(default_factory=list)

    def openai_schema(self) -> dict:
        """Derive the OpenAI tool-definition dict from this spec."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


# ---------------------------------------------------------------------------
# Argument validation — Type Checking at the dispatch boundary (原則 5)
# ---------------------------------------------------------------------------

# JSON schema type -> Python type(s). Validated before the handler runs so the
# LLM gets a precise, structured error instead of a generic KeyError/TypeError.
_PY_TYPES: dict[str, type | tuple[type, ...]] = {
    "string": str,
    "array": list,
    "object": dict,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
}


def validate_args(spec: ToolSpec, args: dict) -> str | None:
    """Validate `args` against a tool's parameter schema.

    Returns a human-readable error message (in Chinese, for the LLM to act on)
    when invalid, or None when the arguments pass. Checks: required keys present,
    top-level type per property, and `enum` membership (including array items).
    """
    schema = spec.parameters or {}
    props: dict[str, Any] = schema.get("properties", {})
    required: list[str] = schema.get("required", [])

    for key in required:
        if args.get(key) is None:
            return f"缺少必要參數 {key!r}"

    for key, val in args.items():
        prop = props.get(key)
        if not prop:
            continue  # unknown extra keys are tolerated (additionalProperties=true)

        jtype = prop.get("type")
        pytype = _PY_TYPES.get(jtype) if jtype else None
        if pytype is not None:
            # bool is a subclass of int — reject it for integer/number explicitly.
            bad_bool = jtype in ("integer", "number") and isinstance(val, bool)
            if bad_bool or not isinstance(val, pytype):
                return f"參數 {key!r} 型別應為 {jtype}，收到 {type(val).__name__}"

        if "enum" in prop and val not in prop["enum"]:
            return f"參數 {key!r} 值 {val!r} 不合法，合法值：{prop['enum']}"

        if jtype == "array" and isinstance(val, list):
            ienum = prop.get("items", {}).get("enum")
            if ienum:
                bad = [x for x in val if x not in ienum]
                if bad:
                    return f"參數 {key!r} 含不合法項目 {bad}，合法值：{ienum}"

    return None
