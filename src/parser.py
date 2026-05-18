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
