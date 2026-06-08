import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from ._utils import get_text

# col index → weekday (1=Mon … 7=Sun)
_WEEKDAY = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 6, 9: 7}
# course col → which time-label col to read from
_TIME_COL = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 7: 6, 9: 8}

_TIME_RE  = re.compile(r"\d{4}-\d{4}")
_NOISE_RE = re.compile(r"【[^】]*】")


@dataclass
class ScheduleEntry:
    weekday:    int   # 1=週一 … 7=週日
    period:     str   # 第一節
    time_range: str   # 0820-0910
    course:     str
    teacher:    str
    classroom:  str


def _parse_period(td) -> tuple[str, str]:
    lines = [ln for ln in get_text(td, separator="\n").splitlines() if ln.strip()]
    if len(lines) < 2:
        return "", ""
    period = lines[0].strip()
    time = next((ln for ln in lines[1:] if _TIME_RE.search(ln)), "-")
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
            lines = [ln for ln in get_text(cols[course_col], separator="\n").splitlines() if ln.strip()]
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
