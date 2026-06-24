"""Tool definitions and executor for the TPCU chat agent.

The `REGISTRY` below is the single source of truth: each `ToolSpec` bundles the
JSON schema, the capability metadata (danger level / preconditions), and the
async handler. The OpenAI tool list (`TOOLS`) and `get_meta` are both derived
from it, and `dispatch` is a registry lookup — no if/elif routing.
"""

from __future__ import annotations

import json

import httpx

from actions.apply_leave.index import apply_leave as _apply_leave
from actions.apply_leave.index import get_leave_form
from actions.delete_leave.index import delete_leave as _delete_leave
from actions.fetch_absence.index import get_absence
from actions.fetch_absence.index import get_options as _abs_options
from actions.fetch_grades.index import get_grades
from actions.fetch_leaves.index import get_leaves
from actions.fetch_schedule.index import get_options as _sched_options
from actions.fetch_schedule.index import get_schedule
from actions.workstudy.index import (
    get_master as _ws_master,
)
from actions.workstudy.index import (
    get_month as _ws_month,
)
from actions.workstudy.index import (
    plan_shifts,
)
from actions.workstudy.index import (
    save_month as _ws_save,
)
from log import get_logger
from utils.date import days_ago_roc, today_roc, today_taipei

from .errors import ErrorCode
from .memory import ChatMemory
from .tool_meta import ToolContext, ToolSpec, validate_args

_log = get_logger("agent.tools")


class AskUserError(Exception):
    """Raised when the agent needs a structured answer from the user."""

    def __init__(self, question: str, options: list[str]) -> None:
        super().__init__(question)
        self.question = question
        self.options = options


def _err(msg: str, code: ErrorCode = ErrorCode.UNKNOWN) -> str:
    return json.dumps(
        {"error": msg, "error_code": str(code), "success": False},
        ensure_ascii=False,
    )


def _classify_action_error(msg: str) -> str:
    if "重複" in msg:
        return ErrorCode.LEAVE_CONFLICT
    if "附件" in msg:
        return ErrorCode.MISSING_ATTACHMENT
    if "已核准" in msg:
        return ErrorCode.LEAVE_APPROVED
    return ErrorCode.UNKNOWN


# ---------------------------------------------------------------------------
# Enum constants — domain knowledge made machine-checkable (see validate_args).
# ---------------------------------------------------------------------------

_LEAVE_IDS = ["21", "22", "23", "24", "25", "26", "27", "28", "29", "31"]
_PERIOD_LABELS = [
    "朝會", "早自習",
    "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "K", "A", "B", "C", "D", "E",
]


# ---------------------------------------------------------------------------
# Handlers — one atomic function per tool. Each receives validated args plus a
# ToolContext (jsessionid + memory) and returns a JSON result string.
# ---------------------------------------------------------------------------

async def _h_get_current_date(args: dict, ctx: ToolContext) -> str:
    today = today_taipei()
    roc = today_roc()
    return json.dumps({
        "date_ad": today.isoformat(),
        "date_roc": roc,
        "roc_year": int(roc[:3]),
        "roc_month": int(roc[3:5]),
        "roc_day": int(roc[5:7]),
    }, ensure_ascii=False)


async def _h_get_semester_options(args: dict, ctx: ToolContext) -> str:
    result = await _sched_options(ctx.jsessionid)
    if not result.get("semesters"):
        abs_result = await _abs_options(ctx.jsessionid)
        result = {"semesters": abs_result.get("semesters", [])}
    if not result.get("semesters"):
        # Both gateways returned empty — the cached session likely lacks the
        # state needed by sys001_00.jsp.  Force a fresh login.
        raise ValueError("Session 過期")
    return json.dumps(result, ensure_ascii=False)


async def _h_fetch_schedule(args: dict, ctx: ToolContext) -> str:
    entries = await get_schedule(ctx.jsessionid, args["semester_value"])
    ctx.memory.cache["schedule"] = {"entries": entries, "title": args["semester_value"]}
    ctx.memory.remember("last_semester", args["semester_value"])
    return json.dumps(entries, ensure_ascii=False)


async def _h_fetch_absence(args: dict, ctx: ToolContext) -> str:
    entries = await get_absence(
        ctx.jsessionid, args["semester_value"],
        start=args.get("start", days_ago_roc(30)),
        end=args.get("end", today_roc()),
    )
    ctx.memory.cache["absence"] = {
        "entries": entries,
        "title": f"{args['semester_value']} 缺曠記錄",
    }
    ctx.memory.remember("last_semester", args["semester_value"])
    return json.dumps(entries, ensure_ascii=False)


async def _h_fetch_grades(args: dict, ctx: ToolContext) -> str:
    entries = await get_grades(ctx.jsessionid)
    ctx.memory.cache["grades"] = {"entries": entries, "title": "歷年成績"}
    return json.dumps(entries, ensure_ascii=False)


async def _h_get_leaves(args: dict, ctx: ToolContext) -> str:
    return json.dumps(
        await get_leaves(ctx.jsessionid, args["start"], args["end"]),
        ensure_ascii=False,
    )


async def _h_get_leave_form(args: dict, ctx: ToolContext) -> str:
    return json.dumps(
        await get_leave_form(ctx.jsessionid, args.get("date")),
        ensure_ascii=False,
    )


async def _h_apply_leave(args: dict, ctx: ToolContext) -> str:
    result = await _apply_leave(
        jsessionid=ctx.jsessionid,
        date=args["date"],
        periods=args["periods"],
        leave_id=args["leave_id"],
        reason=args["reason"],
        image_path=args.get("image_path"),
    )
    if result.get("success") is False:
        result["error_code"] = _classify_action_error(result.get("message", ""))
    return json.dumps(result, ensure_ascii=False)


async def _h_delete_leave(args: dict, ctx: ToolContext) -> str:
    result = await _delete_leave(
        jsessionid=ctx.jsessionid,
        stdkey=args["stdkey"],
        barcode=args["barcode"],
        sdate=args["sdate"],
        edate=args["edate"],
    )
    if result.get("success") is False:
        result["error_code"] = _classify_action_error(result.get("message", ""))
    return json.dumps(result, ensure_ascii=False)


async def _h_get_workstudy_master(args: dict, ctx: ToolContext) -> str:
    result = await _ws_master(ctx.jsessionid, args["year"], args["sms"])
    return json.dumps(result, ensure_ascii=False)


async def _h_get_workstudy_month(args: dict, ctx: ToolContext) -> str:
    result = await _ws_month(
        ctx.jsessionid, args["year"], args["sms"], args["part_month"],
        args["unit_id"], args["kind_id"],
    )
    ctx.memory.cache["workstudy"] = {
        "meta": result["meta"],
        "rows": result["rows"],
        "kind_name": args.get("kind_name", ""),
    }
    return json.dumps(result, ensure_ascii=False)


async def _h_plan_workstudy(args: dict, ctx: ToolContext) -> str:
    part_month = args["part_month"]
    pattern = {int(k): [tuple(s) for s in v] for k, v in args["pattern"].items()}

    sched = ctx.memory.cache.get("schedule")
    use_guard = args.get("use_schedule_guard", True)
    schedule_entries = sched["entries"] if (sched and use_guard) else None

    entries = plan_shifts(
        int(part_month[:3]), int(part_month[3:5]), pattern,
        schedule_entries=schedule_entries, skip_dates=args.get("skip_dates"),
        month_cap=args.get("month_cap", 20.0),
    )
    ctx.memory.cache["workstudy_plan"] = entries
    return json.dumps(
        {"part_month": part_month, "count": len(entries),
         "total_hours": sum(float(e["hours"]) for e in entries),
         "entries": entries},
        ensure_ascii=False,
    )


async def _h_save_workstudy(args: dict, ctx: ToolContext) -> str:
    cached = ctx.memory.cache.get("workstudy")
    entries = ctx.memory.cache.get("workstudy_plan")
    if not cached or entries is None:
        return _err("請先 get_workstudy_month 取得當月主檔，再 plan_workstudy 產生班表",
                    ErrorCode.UNKNOWN)
    result = await _ws_save(
        ctx.jsessionid, cached["meta"], entries, cached.get("kind_name", ""),
    )
    return json.dumps(result, ensure_ascii=False)


async def _h_ask_user(args: dict, ctx: ToolContext) -> str:
    raise AskUserError(question=args["question"], options=args["options"])


# ---------------------------------------------------------------------------
# Tool Registry — single source of truth: schema + metadata + handler.
# `TOOLS` (the OpenAI tool list) and `get_meta` are both derived from this.
# ---------------------------------------------------------------------------

REGISTRY: dict[str, ToolSpec] = {
    "get_current_date": ToolSpec(
        name="get_current_date",
        description=(
            "取得今天的實際日期（西元與民國格式）。"
            "當使用者提到「今天」「本月」「本週」「最近」等相對時間，"
            "或需要填寫日期範圍時，必須先呼叫此工具確認正確日期，"
            "不得自行推算民國年份。"
        ),
        parameters={"type": "object", "properties": {}, "required": []},
        handler=_h_get_current_date,
        requires_session=False,
    ),
    "get_semester_options": ToolSpec(
        name="get_semester_options",
        description="取得系統可用的學期清單。查詢課表或缺曠前若不知道學期代碼，先呼叫此工具。",
        parameters={"type": "object", "properties": {}, "required": []},
        handler=_h_get_semester_options,
    ),
    "fetch_schedule": ToolSpec(
        name="fetch_schedule",
        description="查詢指定學期的完整課表，回傳每堂課的星期、節次、時間、課名、教師、教室。",
        parameters={
            "type": "object",
            "properties": {
                "semester_value": {
                    "type": "string",
                    "description": "學期代碼，例如 '114,2'。從 get_semester_options 取得。",
                }
            },
            "required": ["semester_value"],
        },
        handler=_h_fetch_schedule,
    ),
    "fetch_absence": ToolSpec(
        name="fetch_absence",
        description="查詢指定學期和日期範圍的缺曠記錄。若未明確指定日期，或涉及相對時間（本月/本週/今天），必須先呼叫 get_current_date 取得正確日期。",
        parameters={
            "type": "object",
            "properties": {
                "semester_value": {"type": "string", "description": "學期代碼"},
                "start": {"type": "string", "description": "起始日，民國 YYYMMDD，例如 1150421"},
                "end":   {"type": "string", "description": "結束日，民國 YYYMMDD"},
            },
            "required": ["semester_value"],
        },
        handler=_h_fetch_absence,
    ),
    "fetch_grades": ToolSpec(
        name="fetch_grades",
        description="查詢歷年所有成績（含全部學期），回傳每科的成績、學分、是否及格。",
        parameters={"type": "object", "properties": {}, "required": []},
        handler=_h_fetch_grades,
    ),
    "get_leaves": ToolSpec(
        name="get_leaves",
        description="查詢指定日期範圍內的假單列表，包含審核狀態。",
        parameters={
            "type": "object",
            "properties": {
                "start": {"type": "string", "description": "起始日 YYYMMDD"},
                "end":   {"type": "string", "description": "結束日 YYYMMDD"},
            },
            "required": ["start", "end"],
        },
        handler=_h_get_leaves,
    ),
    "get_leave_form": ToolSpec(
        name="get_leave_form",
        description="取得指定日期的請假表單，回傳該日的節次順序與有課節次（藍色格）。申請請假前必須先呼叫此工具確認節次標籤，不可自行猜測。",
        parameters={
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "民國 YYYMMDD，省略表示今天"},
            },
            "required": [],
        },
        handler=_h_get_leave_form,
    ),
    "apply_leave": ToolSpec(
        name="apply_leave",
        description=(
            "送出請假申請。"
            "公假（leave_id=23）reason 只能是：兵役、法院傳訴、國家考試、系科公假。"
            "公假需提供 image_path（JPEG 或 PDF）。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "date":       {"type": "string", "description": "請假日期 YYYMMDD"},
                "periods":    {
                    "type": "array",
                    "items": {"type": "string", "enum": _PERIOD_LABELS},
                    "description": "節次列表，例如 ['1','2']。可用標籤：朝會、早自習、1-9、K、A-E",
                },
                "leave_id":   {
                    "type": "string",
                    "enum": _LEAVE_IDS,
                    "description": "假別代碼：21=事假 22=病假 23=公假 24=喪假 25=婚假 26=孕產假 27=哺育假 28=防疫假 29=生理假 31=原住民假",
                },
                "reason":     {"type": "string", "description": "請假原因"},
                "image_path": {"type": "string", "description": "附件路徑（公假必填）"},
            },
            "required": ["date", "periods", "leave_id", "reason"],
        },
        handler=_h_apply_leave,
        danger_level=1,
        preconditions=[],
        side_effects=["modifies_leave_records"],
    ),
    "delete_leave": ToolSpec(
        name="delete_leave",
        description="刪除待審假單。需先呼叫 get_leaves 取得 stdkey 與 barcode，且 can_delete 為 true 才可執行。刪除前必須向使用者確認。",
        parameters={
            "type": "object",
            "properties": {
                "stdkey":  {"type": "string", "description": "假單 stdkey，從 get_leaves 取得"},
                "barcode": {"type": "string", "description": "假單編號，從 get_leaves 取得"},
                "sdate":   {"type": "string", "description": "假單起始日 YYYMMDD"},
                "edate":   {"type": "string", "description": "假單結束日 YYYMMDD"},
            },
            "required": ["stdkey", "barcode", "sdate", "edate"],
        },
        handler=_h_delete_leave,
        danger_level=2,
        preconditions=["get_leaves"],
        side_effects=["modifies_leave_records"],
    ),
    "get_workstudy_master": ToolSpec(
        name="get_workstudy_master",
        description=(
            "查詢工讀（個人學習型之服務）某學年期的月份主檔列表："
            "哪幾個月有建檔、各月時數、核銷狀態（未送件才可登錄），"
            "以及各筆的 unit_id / kind_id（登錄時要用）。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "year": {"type": "string", "description": "學年度，例如 114"},
                "sms":  {"type": "string", "description": "學期，1 或 2"},
            },
            "required": ["year", "sms"],
        },
        handler=_h_get_workstudy_master,
    ),
    "get_workstudy_month": ToolSpec(
        name="get_workstudy_month",
        description=(
            "取得某月工讀考勤的編輯資料：既有出勤列與送出所需 meta（含 pay_seqid）。"
            "登錄前必須先呼叫，unit_id/kind_id 由 get_workstudy_master 取得。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "year":       {"type": "string", "description": "學年度，例如 114"},
                "sms":        {"type": "string", "description": "學期，1 或 2"},
                "part_month": {"type": "string", "description": "民國 YYYMM，例如 11506"},
                "unit_id":    {"type": "string", "description": "單位代碼，例如 A009"},
                "kind_id":    {"type": "string", "description": "職別代碼，例如 AA"},
                "kind_name":  {"type": "string", "description": "職別名稱，例如 清寒學習服務生(A)，存檔時帶回"},
            },
            "required": ["year", "sms", "part_month", "unit_id", "kind_id"],
        },
        handler=_h_get_workstudy_month,
    ),
    "plan_workstudy": ToolSpec(
        name="plan_workstudy",
        description=(
            "依『固定班表』把當月出勤攤開成清單，供使用者確認後送出。"
            "pattern 是使用者實際固定值班的時段（每人不同、自訂、可多段），不是用來自動湊滿時數。"
            "若記憶體已有課表，預設用空堂防呆（與上課時間重疊會自動略過）。"
            "上限預設每月 20、每週 8、每日 7.5 小時；時數由起訖自動計算。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "part_month": {"type": "string", "description": "民國 YYYMM，例如 11506"},
                "pattern": {
                    "type": "object",
                    "description": "固定班表 {星期: [[起,訖], ...]}，星期 1=一…7=日，起訖為 HHMM。例如 {\"2\":[[\"1200\",\"1300\"]],\"4\":[[\"0800\",\"0900\"]]}",
                },
                "skip_dates": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "該月沒去的日子（民國 YYYMMDD），不納入",
                },
                "month_cap": {"type": "number", "description": "每月時數上限，預設 20"},
                "use_schedule_guard": {"type": "boolean", "description": "是否用課表空堂防呆，預設 true"},
            },
            "required": ["part_month", "pattern"],
        },
        handler=_h_plan_workstudy,
    ),
    "save_workstudy": ToolSpec(
        name="save_workstudy",
        description=(
            "送出（整月覆蓋）工讀考勤。必須先 get_workstudy_month + plan_workstudy。"
            "此為整月覆蓋：送出的班表會取代該月原有紀錄。送出前務必向使用者確認清單與總時數。"
        ),
        parameters={"type": "object", "properties": {}, "required": []},
        handler=_h_save_workstudy,
        danger_level=1,
        preconditions=["get_workstudy_month", "plan_workstudy"],
        side_effects=["modifies_workstudy_records"],
    ),
    "ask_user": ToolSpec(
        name="ask_user",
        description="向使用者呈現問題與選項，取得結構化回覆。用於需要明確確認或多選一的情境，例如確認請假申請、選擇假別。",
        parameters={
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "問題內容"},
                "options": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "選項列表，最多 4 項",
                },
            },
            "required": ["question", "options"],
        },
        handler=_h_ask_user,
        requires_session=False,
    ),
}


# Derived OpenAI tool list — never hand-written twice.
TOOLS: list[dict] = [spec.openai_schema() for spec in REGISTRY.values()]

# Tools that return a list of data entries; reflection.py uses this to inject a "查無資料" note.
FETCH_TOOL_NAMES: frozenset[str] = frozenset({"fetch_schedule", "fetch_absence", "fetch_grades", "get_leaves"})


def get_meta(name: str) -> ToolSpec:
    """Return the spec for a tool, or an inert default for unknown names."""
    return REGISTRY.get(name) or ToolSpec(name=name)


async def dispatch(name: str, args: dict, jsessionid: str, memory: ChatMemory) -> str:
    """Execute a tool call and return its JSON result string.

    Looks the tool up in REGISTRY, validates args against its schema, then runs
    its handler. Raises AskUserError when a tool needs a structured reply from
    the user, and ValueError("Session 過期") when the session has expired.
    """
    spec = REGISTRY.get(name)
    if spec is None or spec.handler is None:
        return _err(f"未知工具：{name}", ErrorCode.TOOL_UNKNOWN)

    schema_err = validate_args(spec, args)
    if schema_err:
        return _err(schema_err, ErrorCode.TOOL_SCHEMA)

    ctx = ToolContext(jsessionid=jsessionid, memory=memory)
    try:
        return await spec.handler(args, ctx)
    except ValueError as e:
        if "Session 過期" in str(e):
            raise
        return _err(str(e))
    except (KeyError, TypeError) as e:
        return _err(str(e), ErrorCode.TOOL_ARGS)
    except FileNotFoundError as e:
        return _err(str(e), ErrorCode.MISSING_ATTACHMENT)
    except httpx.TimeoutException:
        return _err("學校系統連線逾時（30 秒），請稍後再試", ErrorCode.NETWORK_TIMEOUT)
    except httpx.NetworkError:
        return _err("學校系統連線失敗，請稍後再試", ErrorCode.NETWORK_ERROR)
