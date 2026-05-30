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
    DATA_NOT_FOUND     = "BIZ_004"   # cache miss（render_image）
    CONFIRMATION_REQUIRED = "BIZ_005"  # 危險操作未先 ask_user
    # 工具層
    TOOL_ARGS          = "TOOL_001"  # 缺必要參數（KeyError / TypeError）
    TOOL_UNKNOWN       = "TOOL_002"  # 未知工具名稱
    UNKNOWN            = "UNKNOWN"
