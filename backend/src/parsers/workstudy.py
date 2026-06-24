"""個人學習型之服務考勤（工讀考勤）頁面解析。

bk014_00：月份統計主檔列表（選年月/單位、各月時數與核銷狀態）。
bk014_01：單月考勤編輯頁（隱藏欄位 meta + 既有出勤列）。

僅依賴 bs4 / _utils，不 import client 或 actions（維持依賴單向）。
"""

import dataclasses
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from ._utils import get_text

# 登錄按鈕 onclick="next('A009','AA')" → 取 unit_id, kind_id
_NEXT_RE = re.compile(r"next\('([^']*)'\s*,\s*'([^']*)'\)")


@dataclass
class WorkstudyRecord:
    """bk014_00 主檔列表的一列。"""
    year: str
    month: str
    unit: str
    kind: str
    hours: str
    status: str           # 核銷狀態，例如「未送件」「已送件」
    unit_id: str          # 登錄用，例如 A009
    kind_id: str          # 登錄用，例如 AA
    editable: bool        # 「已送件」只能查詢，不可改


@dataclass
class WorkstudyRow:
    """bk014_01 編輯頁的一列出勤。"""
    date: str             # 民國 compact YYYMMDD
    t_in: str             # HHMM
    t_out: str            # HHMM
    hours: str            # e.g. "1.0"
    seq: str              # etxt_dateseq，伺服器配的列序


def _selected_value(select_tag) -> str:
    if select_tag is None:
        return ""
    for opt in select_tag.find_all("option"):
        if opt.has_attr("selected"):
            return opt.get("value", "")
    first = select_tag.find("option")
    return first.get("value", "") if first else ""


def parse_workstudy_master(html: str) -> dict:
    """解析 bk014_00 月份主檔列表頁。

    Returns:
        {
          "year": "114", "sms": "2",
          "months":  [{"value": "6", "label": "6", "selected": True}, ...],
          "units":   [{"value": "A009§AA", "label": "...", "selected": False}, ...],
          "records": [WorkstudyRecord, ...] as dict,
        }
    """
    soup = BeautifulSoup(html, "html.parser")

    def _hidden(name: str) -> str:
        tag = soup.find("input", {"name": name})
        return tag.get("value", "") if tag else ""

    def _options(select_id: str) -> list[dict]:
        sel = soup.find("select", {"id": select_id})
        if sel is None:
            return []
        out = []
        for opt in sel.find_all("option"):
            val = opt.get("value", "")
            if not val:
                continue
            out.append({"value": val, "label": opt.get_text(strip=True),
                        "selected": opt.has_attr("selected")})
        return out

    records: list[dict] = []
    for btn in soup.find_all("input", {"value": "登錄"}):
        m = _NEXT_RE.search(btn.get("onclick", ""))
        if not m:
            continue
        unit_id, kind_id = m.group(1), m.group(2)
        cells = [get_text(td) for td in btn.find_parent("tr").find_all("td")]
        # 欄位：序 年度 月份 單位 姓名 學號 職別 時數 時薪 底薪 應領 核銷狀態 備註 功能
        if len(cells) < 12:
            continue
        status = cells[11]
        records.append(dataclasses.asdict(WorkstudyRecord(
            year=cells[1], month=cells[2], unit=cells[3], kind=cells[6],
            hours=cells[7], status=status, unit_id=unit_id, kind_id=kind_id,
            editable="已送件" not in status,
        )))

    return {
        "year": _hidden("year"),
        "sms": _hidden("sms"),
        "months": _options("select_moon"),
        "units": _options("chiose_unit"),
        "records": records,
    }


def parse_workstudy_edit(html: str) -> dict:
    """解析 bk014_01 單月考勤編輯頁。

    Returns:
        {"meta": {<所有 hidden input name→value>}, "rows": [WorkstudyRow as dict]}

    meta 至少含 unit_id / ecdt_sdate / pay_seqid / stdname / part_month /
    ls_kind_id / year / sms（送出 bk014_ins.jsp 時要原樣帶回）。
    """
    soup = BeautifulSoup(html, "html.parser")

    meta: dict[str, str] = {}
    for inp in soup.find_all("input", {"type": "hidden"}):
        name = inp.get("name") or inp.get("id")
        if name and not re.match(r"etxt_(date|dateseq)\d+$", name):
            meta.setdefault(name, inp.get("value", ""))

    rows: list[dict] = []
    for date_inp in soup.find_all("input", {"name": re.compile(r"^etxt_date\d+$")}):
        n = re.search(r"\d+$", date_inp["name"]).group()
        seq_inp = soup.find("input", {"name": f"etxt_dateseq{n}"})
        num_inp = soup.find("input", {"name": f"etxt_num{n}"})
        rows.append(dataclasses.asdict(WorkstudyRow(
            date=date_inp.get("value", ""),
            t_in=_selected_value(soup.find("select", {"name": f"etxt_in{n}"})),
            t_out=_selected_value(soup.find("select", {"name": f"etxt_out{n}"})),
            hours=num_inp.get("value", "") if num_inp else "",
            seq=seq_inp.get("value", "") if seq_inp else "",
        )))

    return {"meta": meta, "rows": rows}
