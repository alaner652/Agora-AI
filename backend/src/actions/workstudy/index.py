"""個人學習型之服務考勤（工讀考勤）登錄。

流程：bk014_00（主檔列表）→ bk014_01（單月編輯頁）→ bk014_ins（存檔）。

排班原則：固定班表。`plan_shifts` 把使用者「實際固定值班的時段」攤成當月清單，
課表空堂僅作防呆（避免排到上課時間），不拿來自動湊滿時數。存檔為整月覆蓋，
故送出清單須是當月全部出勤。
"""

import calendar
import datetime
import random
from urllib.parse import urlencode

from client import activate_feature, post_data
from log import get_logger
from parsers.workstudy import parse_workstudy_edit, parse_workstudy_master
from utils.alert import classify_alert
from utils.date import TZ

_log = get_logger("actions.workstudy")

FNCID = "BK014"
SPATH = "bk_pro/bk014_00.jsp?"
MASTER_URL = "/tsint/bk_pro/bk014_00.jsp"
EDIT_URL   = "/tsint/bk_pro/bk014_01.jsp"
SUBMIT_URL = "/tsint/bk_pro/bk014_ins.jsp"

# 可選值班時段（各 1 小時）。key 即 plan_shifts 的 pattern 用的 slot 代碼。
SLOTS: dict[str, tuple[str, str]] = {
    "0800": ("0800", "0900"),
    "1200": ("1200", "1300"),
}

ZH_WEEK = "一二三四五六日"   # 1=Mon … 7=Sun
DAILY_CAP = 7.5
WEEK_CAP  = 8.0
MONTH_CAP = 20.0

_SUCCESS_KW = ["存檔成功", "成功", "完成"]
_FAILURE_KW = ["失敗", "錯誤", "重疊", "超過", "不得", "必須", "請選", "請輸入"]


# ---------------------------------------------------------------------------
# 抓取（查詢類，回傳 dict / list[dict]）
# ---------------------------------------------------------------------------

async def get_master(jsessionid: str, year: str, sms: str) -> dict:
    """取得某學年期的工讀月份主檔列表（哪幾個月有檔、時數、核銷狀態）。"""
    await activate_feature(jsessionid, FNCID, SPATH)
    html = await post_data(jsessionid, MASTER_URL, {
        "spath": SPATH, "arg01": year, "arg02": sms, "yms": f"{year},{sms}",
    })
    result = parse_workstudy_master(html)
    _log.info("get_master year=%s sms=%s → %d records", year, sms, len(result["records"]))
    return result


async def get_month(jsessionid: str, year: str, sms: str, part_month: str,
                    unit_id: str, kind_id: str) -> dict:
    """取得單月編輯頁：既有出勤列 + 送出用 meta（含 pay_seqid）。

    part_month: 民國 YYYMM，例如 11506
    """
    qs = urlencode({"part_month": part_month, "part_unit": unit_id,
                    "ls_kind_id": kind_id, "year": year, "sms": sms})
    html = await post_data(jsessionid, f"{EDIT_URL}?{qs}", {
        "select_year": part_month[:3], "chiose_unit": "all§all",
        "ls_chosemoon": "", "ls_chosekind": "%", "year": year, "sms": sms,
    })
    result = parse_workstudy_edit(html)
    _log.info("get_month %s unit=%s → %d existing rows",
              part_month, unit_id, len(result["rows"]))
    return result


# ---------------------------------------------------------------------------
# 排班（純函式，無 IO）
# ---------------------------------------------------------------------------

def _hhmm(t: str) -> int:
    return int(t)


def free_slots_from_schedule(schedule_entries: list[dict]) -> dict[int, list[str]]:
    """由課表算出每個星期（1=一 … 7=日）哪些 SLOT 是空堂（無課重疊）。"""
    busy: dict[int, list[tuple[int, int]]] = {}
    for e in schedule_entries:
        rng = e.get("time_range", "")
        if "-" not in rng:
            continue
        a, b = rng.split("-", 1)
        if not (a.isdigit() and b.isdigit()):
            continue
        busy.setdefault(e["weekday"], []).append((_hhmm(a), _hhmm(b)))

    free: dict[int, list[str]] = {}
    for wd in range(1, 8):
        slots = []
        for start, (s_in, s_out) in SLOTS.items():
            si, so = _hhmm(s_in), _hhmm(s_out)
            if not any(si < be and ae < so for ae, be in busy.get(wd, [])):
                slots.append(start)
        free[wd] = slots
    return free


def plan_shifts(
    roc: int, mon: int, pattern: dict[int, list[str]], *,
    free_by_weekday: dict[int, list[str]] | None = None,
    skip_dates: list[str] | None = None,
    month_cap: float = MONTH_CAP,
) -> list[dict]:
    """把固定班表 pattern 攤成當月出勤清單。

    pattern: {星期(1=一…7=日): [slot 代碼, ...]} —— 你「實際固定會去」的時段。
    free_by_weekday: 提供時作防呆，pattern 排到非空堂的時段會被跳過並記 warning。
    skip_dates: 該月你沒去的日子（民國 YYYMMDD），不納入。
    """
    g = roc + 1911
    skip = set(skip_dates or [])
    entries: list[dict] = []
    total, weekly = 0.0, {}

    for day in range(1, calendar.monthrange(g, mon)[1] + 1):
        wd = calendar.weekday(g, mon, day) + 1   # 1=Mon … 7=Sun
        date = f"{roc:03d}{mon:02d}{day:02d}"
        for start in pattern.get(wd, []):
            if date in skip or start not in SLOTS:
                continue
            if free_by_weekday is not None and start not in free_by_weekday.get(wd, []):
                _log.warning("plan_shifts skip non-free date=%s slot=%s", date, start)
                continue
            wk = (day - 1) // 7
            if weekly.get(wk, 0.0) + 1.0 > WEEK_CAP or total + 1.0 > month_cap:
                continue
            t_in, t_out = SLOTS[start]
            entries.append({"date": date, "t_in": t_in, "t_out": t_out,
                            "hours": "1.0", "seq": ""})
            total += 1.0
            weekly[wk] = weekly.get(wk, 0.0) + 1.0
    return entries


# ---------------------------------------------------------------------------
# 送出（動作類，回傳 {"success", "message"}）
# ---------------------------------------------------------------------------

def _zh_week(roc_date: str) -> str:
    g = int(roc_date[:3]) + 1911
    return ZH_WEEK[calendar.weekday(g, int(roc_date[3:5]), int(roc_date[5:7]))]


def _time_options() -> str:
    opts = [f'<option value="{h:02d}{m:02d}">{h:02d}:{m:02d}</option>'
            for h in range(8, 24) for m in range(0, 60, 10)]
    opts.append('<option value="2400">24:00</option>')
    return "".join(opts)


def _today_stamp() -> str:
    n = datetime.datetime.now(TZ)
    return f"{n.year - 1911:03d}{n.month:02d}{n.day:02d}{n.hour:02d}{n.minute:02d}{n.second:02d}"


def _build_svalue(entries: list[dict]) -> str:
    rows = [f"{e['date']}%{e['t_in']}%{e['t_out']}%{e['hours']}%{e['seq']}"
            for e in entries]
    trailer = int(sum(float(e["hours"]) for e in entries) * 60)  # server 不驗證此值
    return "@".join(rows) + f"@{trailer}@"


def _build_payload(meta: dict, entries: list[dict], kind_name: str) -> dict:
    unit_id = meta.get("unit_id", "")
    ecdt_sdate = meta.get("ecdt_sdate") or (meta.get("part_month", "") + "01")
    payload = {"unit_id": unit_id, "ecdt_sdate": ecdt_sdate}
    for i, e in enumerate(entries, 1):
        payload[f"etxt_date{i}"]    = e["date"]
        payload[f"etxt_in{i}"]      = e["t_in"]
        payload[f"etxt_out{i}"]     = e["t_out"]
        payload[f"etxt_num{i}"]     = e["hours"]
        payload[f"etxt_dateseq{i}"] = e["seq"] or f"{random.randint(0, 999):03d}"
    payload.update({
        "hr_count":        f"{sum(float(e['hours']) for e in entries):.1f}",
        f"unit_{unit_id}": kind_name,
        "ls_payYN":        meta.get("ls_payYN", "N"),
        "cohse_untid":     meta.get("cohse_untid", unit_id),
        "cohse_week":      _zh_week(ecdt_sdate),
        "select_html":     _time_options(),
        "pay_seqid":       meta.get("pay_seqid", ""),
        "part_month":      meta.get("part_month", ""),
        "ls_kind_id":      meta.get("ls_kind_id", ""),
        "stdname":         meta.get("stdname", ""),
        "today":           _today_stamp(),
        "svalue":          _build_svalue(entries),
        "year":            meta.get("year", ""),
        "sms":             meta.get("sms", ""),
    })
    return payload


async def save_month(jsessionid: str, meta: dict, entries: list[dict],
                     kind_name: str = "") -> dict:
    """整月覆蓋存檔。entries 須為當月全部出勤（含原本要保留的列）。

    Returns:
        {"success": True/False/None, "message": str}
    """
    if not meta.get("pay_seqid"):
        return {"success": False, "message": "缺少 pay_seqid，請先 get_month 取得當月主檔"}
    payload = _build_payload(meta, entries, kind_name)
    html = await post_data(jsessionid, SUBMIT_URL, payload)
    result = classify_alert(html, _SUCCESS_KW, _FAILURE_KW)
    _log.info("save_month part_month=%s rows=%d → success=%s",
              meta.get("part_month"), len(entries), result["success"])
    return result
