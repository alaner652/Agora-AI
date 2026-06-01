"""Tool definitions and executor for the TPCU chat agent."""

from __future__ import annotations

import json
import pathlib

import httpx

from log import get_logger
from actions.fetch_schedule.index import get_options as _sched_options, get_schedule
from actions.fetch_absence.index import get_options as _abs_options, get_absence
from actions.fetch_grades.index import get_grades
from actions.fetch_leaves.index import get_leaves
from actions.apply_leave.index import apply_leave as _apply_leave, get_leave_form
from actions.delete_leave.index import delete_leave as _delete_leave
from utils.date import today_roc, days_ago_roc

from .errors import ErrorCode
from .memory import ChatMemory

_log = get_logger(__name__)

_OUTPUT_DIR = pathlib.Path(__file__).parent.parent.parent / "output"


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
            "description": "查詢指定學期和日期範圍的缺曠記錄。",
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
    {
        "type": "function",
        "function": {
            "name": "render_image",
            "description": "將最近一次查詢的課表、缺曠或成績資料渲染成圖片並顯示。須先呼叫對應的 fetch 工具取得資料。",
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["schedule", "absence", "grades"],
                        "description": "資料類型",
                    },
                    "title": {"type": "string", "description": "圖片標題（選填）"},
                },
                "required": ["type"],
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
        if name == "get_semester_options":
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
                leave_name=args["leave_name"],
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

        elif name == "render_image":
            import importlib
            import os
            import tempfile

            rtype = args.get("type", "")
            _RENDER_TYPES = {"schedule", "absence", "grades"}
            if rtype not in _RENDER_TYPES:
                return _err(f"不支援的圖表類型：{rtype}", ErrorCode.UNKNOWN)
            cached = memory.cache.get(rtype)
            if cached is None:
                return _err(f"尚無 {rtype} 資料，請先執行查詢後再產生圖表", ErrorCode.UNKNOWN)
            mod = importlib.import_module(f"utils.render_{rtype}.index")
            entries = cached["entries"]
            title = args.get("title") or cached.get("title", "")
            output = os.path.join(tempfile.gettempdir(), f"{rtype}.png")
            path = mod.render(entries, title=title, output=output)
            return json.dumps({"path": path}, ensure_ascii=False)

        elif name == "ask_user":
            raise AskUserError(question=args["question"], options=args["options"])

        elif name == "render_image":
            type_ = args["type"]
            cached = memory.cache.get(type_)
            if not cached:
                return _err(f"尚未查詢 {type_}，請先執行對應查詢", ErrorCode.DATA_NOT_FOUND)
            entries = cached["entries"]
            title = args.get("title") or cached.get("title", "")
            if type_ == "schedule":
                from utils.render_schedule.index import render
                path = render(entries, title=title, output=str(_OUTPUT_DIR / "schedule.png"))
            elif type_ == "absence":
                from utils.render_absence.index import render
                path = render(entries, title=title, output=str(_OUTPUT_DIR / "absence.png"))
            elif type_ == "grades":
                from utils.render_grades.index import render
                path = render(entries, title=title, output=str(_OUTPUT_DIR / "grades.png"))
            else:
                return _err(f"未知的渲染類型：{type_}", ErrorCode.TOOL_UNKNOWN)
            return json.dumps({"success": True, "type": type_}, ensure_ascii=False)

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
