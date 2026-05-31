"""Tool capability metadata — danger level, preconditions, side effects."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ToolMeta:
    name: str
    danger_level: int = 0           # 0=唯讀  1=需確認  2=不可逆
    requires_session: bool = True
    preconditions: list[str] = field(default_factory=list)
    side_effects: list[str] = field(default_factory=list)


TOOL_META: dict[str, ToolMeta] = {
    "get_semester_options": ToolMeta("get_semester_options"),
    "fetch_schedule":       ToolMeta("fetch_schedule"),
    "fetch_absence":        ToolMeta("fetch_absence"),
    "fetch_grades":         ToolMeta("fetch_grades"),
    "get_leaves":           ToolMeta("get_leaves"),
    "get_leave_form":       ToolMeta("get_leave_form"),
    "ask_user":             ToolMeta("ask_user",     requires_session=False),
    "apply_leave": ToolMeta(
        "apply_leave",
        danger_level=1,
        preconditions=["get_leave_form"],
        side_effects=["modifies_leave_records"],
    ),
    "delete_leave": ToolMeta(
        "delete_leave",
        danger_level=2,
        preconditions=["get_leaves"],
        side_effects=["modifies_leave_records"],
    ),
}


def get_meta(name: str) -> ToolMeta:
    return TOOL_META.get(name, ToolMeta(name=name))
