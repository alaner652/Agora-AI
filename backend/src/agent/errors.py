"""Standardized error codes for tool dispatch results."""

from enum import StrEnum


class ErrorCode(StrEnum):
    # 網路 / 系統
    NETWORK_TIMEOUT    = "NET_001"
    SESSION_EXPIRED    = "NET_002"
    NETWORK_ERROR      = "NET_003"
    # 業務邏輯
    LEAVE_CONFLICT     = "BIZ_001"   # 重複假單
    LEAVE_APPROVED     = "BIZ_002"   # 已核准，不可刪
    MISSING_ATTACHMENT = "BIZ_003"   # 公假缺附件
    PRECONDITION_UNMET = "BIZ_004"   # 前置工具未先呼叫（如 apply_leave 缺 get_leave_form）
    CONFIRMATION_REQUIRED = "BIZ_005"  # 危險操作未先 ask_user
    # 工具層
    TOOL_ARGS          = "TOOL_001"  # 缺必要參數（KeyError / TypeError）
    TOOL_UNKNOWN       = "TOOL_002"  # 未知工具名稱
    TOOL_SCHEMA        = "TOOL_003"  # 參數未通過 schema 驗證（型別 / enum / required）
    # Agent 流程
    MAX_ITERATIONS     = "AGENT_001"  # 達最大迭代次數仍未完成
    UNKNOWN            = "UNKNOWN"
