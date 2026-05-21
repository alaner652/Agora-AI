import re
from dataclasses import dataclass

from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# 通用：解析表單 <select> 選項
# ---------------------------------------------------------------------------

def parse_select(html: str, select_id: str) -> list[dict]:
    """從 HTML 表單中提取指定 <select> 的所有選項。

    Returns:
        [{"value": "114,2", "label": "114學年度第2學期", "selected": True}, ...]
    """
    soup = BeautifulSoup(html, "html.parser")
    sel = soup.find("select", {"id": select_id})
    if sel is None:
        return []
    return [
        {
            "value": opt.get("value", ""),
            "label": opt.get_text(strip=True),
            "selected": opt.has_attr("selected"),
        }
        for opt in sel.find_all("option")
    ]

# col index → weekday (1=Mon … 7=Sun)
_WEEKDAY = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 6, 9: 7}
# course col → which time-label col to read from
_TIME_COL = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 7: 6, 9: 8}

_TIME_RE = re.compile(r"\d{4}-\d{4}")
_NOISE_RE = re.compile(r"【[^】]*】")


@dataclass
class ScheduleEntry:
    weekday: int      # 1=週一 … 7=週日
    period: str       # 第一節
    time_range: str   # 0820-0910
    course: str       # 課程名稱
    teacher: str
    classroom: str


def _text(td) -> str:
    return td.get_text(separator="\n").replace("\xa0", "").strip()


def _parse_period(td) -> tuple[str, str]:
    lines = [l for l in _text(td).splitlines() if l.strip()]
    if len(lines) < 2:
        return "", ""
    period = lines[0].strip()
    time = next((l for l in lines[1:] if _TIME_RE.search(l)), "-")
    return period, time.strip()


def parse_schedule(html: str) -> list[ScheduleEntry]:
    soup = BeautifulSoup(html, "html.parser")

    table = next(
        (t for t in soup.find_all("table")
         if all(d in t.get_text() for d in ("一", "二", "三", "四", "五", "六", "日"))),
        None,
    )
    if table is None:
        return []

    entries = []
    for row in table.find_all("tr")[1:]:
        cols = row.find_all("td")
        if len(cols) != 10:
            continue

        periods = {c: _parse_period(cols[c]) for c in (0, 6, 8)}

        for course_col, time_col in _TIME_COL.items():
            lines = [l for l in _text(cols[course_col]).splitlines() if l.strip()]
            if not lines:
                continue

            period, time = periods[time_col]
            if not period:
                continue

            # 班級名稱格式如「五專資訊三真.」，以「.」結尾，不是教師
            teacher   = lines[1] if len(lines) > 1 and not lines[1].endswith(".") else ""
            classroom = lines[2] if len(lines) > 2 and not lines[2].endswith(".") else ""
            entries.append(ScheduleEntry(
                weekday=_WEEKDAY[course_col],
                period=period,
                time_range=time,
                course=_NOISE_RE.sub("", lines[0]).strip(),
                teacher=teacher,
                classroom=classroom,
            ))

    return entries


# ---------------------------------------------------------------------------
# 缺曠解析
# ---------------------------------------------------------------------------

_ABSENCE_PERIODS = ["朝會", "自", "1", "2", "3", "4", "5", "6", "7", "8", "9", "K", "A", "B", "C", "D", "E"]
_DATE_RE = re.compile(r"(\d+/\d+/\d+)[（(]([一二三四五六日])[）)]")


@dataclass
class AbsenceEntry:
    date: str       # "115/05/18"（民國）
    weekday: str    # "一"
    period: str     # "2"
    type: str       # "缺曠" / "事假" / ...


def parse_absence(html: str) -> list[AbsenceEntry]:
    soup = BeautifulSoup(html, "html.parser")

    table = next(
        (t for t in soup.find_all("table") if "朝會" in t.get_text()),
        None,
    )
    if table is None:
        return []

    entries = []
    for row in table.find_all("tr")[1:]:
        cols = row.find_all("td")
        if len(cols) < 2 + len(_ABSENCE_PERIODS):
            continue

        m = _DATE_RE.search(cols[1].get_text())
        if not m:
            continue
        date, weekday = m.group(1), m.group(2)

        for pi, period in enumerate(_ABSENCE_PERIODS):
            text = cols[2 + pi].get_text(strip=True).replace("\xa0", "")
            if text:
                entries.append(AbsenceEntry(date=date, weekday=weekday, period=period, type=text))

    return entries


# ---------------------------------------------------------------------------
# 請假表單解析
# ---------------------------------------------------------------------------

_LEAVE_SKIP_HEADERS = {"快速登錄", "快速登錄(aa)", "日期", "星期"}
_BLUE_COLORS = {"99ccff", "6699ff", "0000ff", "ccccff", "9999ff", "3399ff", "0066ff"}
_DATE_DOT_RE = re.compile(r"(\d{3})\.(\d{2})\.(\d{2})")


def _is_blue_cell(td) -> bool:
    bg = td.get("bgcolor", "").lower().lstrip("#")
    cls = " ".join(td.get("class", [])).lower()
    style = td.get("style", "").lower()
    return bg in _BLUE_COLORS or "blue" in cls or "background" in style and "blue" in style


def parse_leave_form(html: str) -> dict:
    """解析 ck001_02.jsp，回傳節次順序、當日有課節次、日期。

    Returns:
        {
          "period_order": ["朝會", "早自習", "1", ..., "E"],
          "scheduled":    ["1", "2", "3"],   ← 藍色格子（有課節次）
          "date":         "115/05/21"
        }
    """
    soup = BeautifulSoup(html, "html.parser")

    table = next(
        (t for t in soup.find_all("table") if "朝會" in t.get_text()),
        None,
    )
    if table is None:
        return {"period_order": [], "scheduled": [], "date": ""}

    rows = table.find_all("tr")

    # 找含「朝會」的表頭列，提取節次 labels
    header_row = next((r for r in rows if "朝會" in r.get_text()), None)
    if header_row is None:
        return {"period_order": [], "scheduled": [], "date": ""}

    header_cells = header_row.find_all(["td", "th"])
    period_start_idx = None
    for i, td in enumerate(header_cells):
        if "朝會" in td.get_text(strip=True):
            period_start_idx = i
            break

    if period_start_idx is None:
        return {"period_order": [], "scheduled": [], "date": ""}

    period_order = [
        td.get_text(strip=True).replace("\xa0", "")
        for td in header_cells[period_start_idx:]
        if td.get_text(strip=True).replace("\xa0", "")
    ]

    # 從資料列讀藍色格子與日期
    scheduled: list[str] = []
    date_str = ""

    for row in rows:
        if row is header_row:
            continue
        cols = row.find_all("td")
        if len(cols) < period_start_idx + len(period_order):
            continue
        # 日期欄（民國 YYY.MM.DD 格式）
        for col in cols[:period_start_idx]:
            m = _DATE_DOT_RE.search(col.get_text())
            if m:
                date_str = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"
                break
        if not date_str:
            continue

        for pi, label in enumerate(period_order):
            if _is_blue_cell(cols[period_start_idx + pi]):
                scheduled.append(label)
        break  # 只處理第一個資料列

    return {"period_order": period_order, "scheduled": scheduled, "date": date_str}


# ---------------------------------------------------------------------------
# 假單列表解析
# ---------------------------------------------------------------------------

_PRT_RE = re.compile(r"prt_data\('(\d+)','([^']+)'\)")
_DEL_RE = re.compile(r"go_del\('(\d+)','([^']+)','(\d+)','(\d+)'\)")


def _clean_td(td) -> str:
    return td.get_text(separator="").replace("\xa0", "").strip()


def parse_leaves(html: str) -> list[dict]:
    """解析 ck001_view.jsp，回傳假單列表。

    Returns:
        [{"index", "barcode", "reason", "apply_date", "start_date",
          "end_date", "teacher_status", "teacher_note",
          "officer_status", "officer_note", "stdkey", "can_delete"}, ...]
    """
    soup = BeautifulSoup(html, "html.parser")
    table = next(
        (t for t in soup.find_all("table") if "假單編號" in t.get_text()),
        None,
    )
    if table is None:
        return []

    entries = []
    for row in table.find_all("tr")[1:]:  # skip header
        cols = row.find_all("td")
        if len(cols) < 12:
            continue
        # 從 明細 按鈕 onclick 取 stdkey
        stdkey = ""
        m = _PRT_RE.search(cols[6].decode_contents())
        if m:
            stdkey = m.group(1)

        can_delete = bool(cols[11].find("input"))

        entries.append({
            "index":          _clean_td(cols[0]),
            "barcode":        _clean_td(cols[1]),
            "reason":         _clean_td(cols[2]),
            "apply_date":     _clean_td(cols[3]),
            "start_date":     _clean_td(cols[4]),
            "end_date":       _clean_td(cols[5]),
            "teacher_status": _clean_td(cols[7]),
            "teacher_note":   _clean_td(cols[8]),
            "officer_status": _clean_td(cols[9]),
            "officer_note":   _clean_td(cols[10]),
            "stdkey":         stdkey,
            "can_delete":     can_delete,
        })

    return entries


# ---------------------------------------------------------------------------
# 成績解析
# ---------------------------------------------------------------------------

_GRADE_FOOTER_KW = {"學期總平均", "修習學分數", "實得學分數"}


@dataclass
class GradeEntry:
    semester: str   # "114學年度第2學期"
    course: str     # 科目名稱
    type: str       # "必修" / "選修"
    credits: str    # "2"
    score: str      # "85" or ""
    passed: bool    # False when score cell contains <font color="red">


def _clean(td) -> str:
    return td.get_text(strip=True).replace("\xa0", "")


def parse_grades(html: str) -> list[GradeEntry]:
    soup = BeautifulSoup(html, "html.parser")
    entries = []

    for table in soup.find_all("table"):
        # Skip container/layout tables — only process leaf tables (no nested tables)
        if table.find("table"):
            continue
        text = table.get_text()
        if "科目名稱" not in text or "學年度" not in text:
            continue

        semester = ""
        for row in table.find_all("tr"):
            cols = row.find_all("td")
            if not cols:
                continue
            cell0 = _clean(cols[0])

            if "學年度" in cell0:
                semester = cell0
                continue
            # Skip header and footer rows (footer may have "※ " prefix)
            if not cell0 or "科目名稱" in cell0 or any(kw in cell0 for kw in _GRADE_FOOTER_KW):
                continue

            # Each data row has up to 8 columns: left course (0-3) + right course (4-7)
            for offset in (0, 4):
                if len(cols) < offset + 4:
                    break
                name = _clean(cols[offset])
                if not name or any(kw in name for kw in _GRADE_FOOTER_KW):
                    continue
                type_    = _clean(cols[offset + 1])
                credits  = _clean(cols[offset + 2])
                score_td = cols[offset + 3]
                score    = _clean(score_td)
                has_red  = bool(score_td.find("font", {"color": re.compile(r"red", re.I)}))
                passed   = (not has_red) if score else True
                entries.append(GradeEntry(
                    semester=semester,
                    course=name,
                    type=type_,
                    credits=credits,
                    score=score,
                    passed=passed,
                ))

    return entries
