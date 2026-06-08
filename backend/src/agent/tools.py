"""Tool definitions and executor for the TPCU chat agent."""

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
from log import get_logger
from utils.date import days_ago_roc, today_roc, today_taipei

from .errors import ErrorCode
from .memory import ChatMemory

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


TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_current_date",
            "description": (
                "取得今天的實際日期（西元與民國格式）。"
                "當使用者提到「今天」「本月」「本週」「最近」等相對時間，"
                "或需要填寫日期範圍時，必須先呼叫此工具確認正確日期，"
                "不得自行推算民國年份。"
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_semester_options",
            "description": "取得系統可用的學期清單。查詢課表或缺曠前若不知道學期代碼，先呼叫此工具。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_schedule",
            "description": "查詢指定學期的完整課表，回傳每堂課的星期、節次、時間、課名、教師、教室。",
            "parameters": {
                "type": "object",
                "properties": {
                    "semester_value": {
                        "type": "string",
                        "description": "學期代碼，例如 '114,2'。從 get_semester_options 取得。",
                    }
                },
                "required": ["semester_value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_absence",
            "description": "查詢指定學期和日期範圍的缺曠記錄。若未明確指定日期，或涉及相對時間（本月/本週/今天），必須先呼叫 get_current_date 取得正確日期。",
            "parameters": {
                "type": "object",
                "properties": {
                    "semester_value": {"type": "string", "description": "學期代碼"},
                    "start": {"type": "string", "description": "起始日，民國 YYYMMDD，例如 1150421"},
                    "end":   {"type": "string", "description": "結束日，民國 YYYMMDD"},
                },
                "required": ["semester_value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_grades",
            "description": "查詢歷年所有成績（含全部學期），回傳每科的成績、學分、是否及格。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_leaves",
            "description": "查詢指定日期範圍內的假單列表，包含審核狀態。",
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {"type": "string", "description": "起始日 YYYMMDD"},
                    "end":   {"type": "string", "description": "結束日 YYYMMDD"},
                },
                "required": ["start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "apply_leave",
            "description": (
                "送出請假申請。"
                "公假（leave_id=23）reason 只能是：兵役、法院傳訴、國家考試、系科公假。"
                "公假需提供 image_path（JPEG 或 PDF）。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date":       {"type": "string", "description": "請假日期 YYYMMDD"},
                    "periods":    {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "節次列表，例如 ['1','2']。可用標籤：朝會、早自習、1-9、K、A-E",
                    },
                    "leave_id":   {"type": "string", "description": "假別代碼：21=事假 22=病假 23=公假 24=喪假 25=婚假"},
                    "leave_name": {"type": "string", "description": "假別名稱"},
                    "reason":     {"type": "string", "description": "請假原因"},
                    "image_path": {"type": "string", "description": "附件路徑（公假必填）"},
                },
                "required": ["date", "periods", "leave_id", "leave_name", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_leave",
            "description": "刪除待審假單。需先呼叫 get_leaves 取得 stdkey 與 barcode，且 can_delete 為 true 才可執行。刪除前必須向使用者確認。",
            "parameters": {
                "type": "object",
                "properties": {
                    "stdkey":  {"type": "string", "description": "假單 stdkey，從 get_leaves 取得"},
                    "barcode": {"type": "string", "description": "假單編號，從 get_leaves 取得"},
                    "sdate":   {"type": "string", "description": "假單起始日 YYYMMDD"},
                    "edate":   {"type": "string", "description": "假單結束日 YYYMMDD"},
                },
                "required": ["stdkey", "barcode", "sdate", "edate"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_leave_form",
            "description": "取得指定日期的請假表單，回傳該日的節次順序與有課節次（藍色格）。申請請假前必須先呼叫此工具確認節次標籤，不可自行猜測。",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "民國 YYYMMDD，省略表示今天"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_user",
            "description": "向使用者呈現問題與選項，取得結構化回覆。用於需要明確確認或多選一的情境，例如確認請假申請、選擇假別。",
            "parameters": {
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
        },
    },
]


async def dispatch(name: str, args: dict, jsessionid: str, memory: ChatMemory) -> str:
    """Execute a tool call and return its JSON result string.

    Raises AskUserError when the tool needs a structured reply from the user.
    Raises ValueError with "Session 過期" when the session has expired.
    """
    try:
        if name == "get_current_date":
            today = today_taipei()
            roc = today_roc()
            return json.dumps({
                "date_ad": today.isoformat(),
                "date_roc": roc,
                "roc_year": int(roc[:3]),
                "roc_month": int(roc[3:5]),
                "roc_day": int(roc[5:7]),
            }, ensure_ascii=False)

        elif name == "get_semester_options":
            result = await _sched_options(jsessionid)
            if not result.get("semesters"):
                abs_result = await _abs_options(jsessionid)
                result = {"semesters": abs_result.get("semesters", [])}
            if not result.get("semesters"):
                # Both gateways returned empty — the cached session likely lacks
                # the state needed by sys001_00.jsp.  Force a fresh login.
                raise ValueError("Session 過期")
            return json.dumps(result, ensure_ascii=False)

        elif name == "fetch_schedule":
            entries = await get_schedule(jsessionid, args["semester_value"])
            memory.cache["schedule"] = {"entries": entries, "title": args["semester_value"]}
            memory.remember("last_semester", args["semester_value"])
            return json.dumps(entries, ensure_ascii=False)

        elif name == "fetch_absence":
            entries = await get_absence(
                jsessionid, args["semester_value"],
                start=args.get("start", days_ago_roc(30)),
                end=args.get("end", today_roc()),
            )
            memory.cache["absence"] = {
                "entries": entries,
                "title": f"{args['semester_value']} 缺曠記錄",
            }
            memory.remember("last_semester", args["semester_value"])
            return json.dumps(entries, ensure_ascii=False)

        elif name == "fetch_grades":
            entries = await get_grades(jsessionid)
            memory.cache["grades"] = {"entries": entries, "title": "歷年成績"}
            return json.dumps(entries, ensure_ascii=False)

        elif name == "get_leaves":
            return json.dumps(
                await get_leaves(jsessionid, args["start"], args["end"]),
                ensure_ascii=False,
            )

        elif name == "get_leave_form":
            return json.dumps(
                await get_leave_form(jsessionid, args.get("date")),
                ensure_ascii=False,
            )

        elif name == "apply_leave":
            result = await _apply_leave(
                jsessionid=jsessionid,
                date=args["date"],
                periods=args["periods"],
                leave_id=args["leave_id"],
                reason=args["reason"],
                image_path=args.get("image_path"),
            )
            if result.get("success") is False:
                result["error_code"] = _classify_action_error(result.get("message", ""))
            return json.dumps(result, ensure_ascii=False)

        elif name == "delete_leave":
            result = await _delete_leave(
                jsessionid=jsessionid,
                stdkey=args["stdkey"],
                barcode=args["barcode"],
                sdate=args["sdate"],
                edate=args["edate"],
            )
            if result.get("success") is False:
                result["error_code"] = _classify_action_error(result.get("message", ""))
            return json.dumps(result, ensure_ascii=False)

        elif name == "ask_user":
            raise AskUserError(question=args["question"], options=args["options"])

        else:
            return _err(f"未知工具：{name}", ErrorCode.TOOL_UNKNOWN)

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
