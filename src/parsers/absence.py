import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

_ABSENCE_PERIODS = ["朝會", "自", "1", "2", "3", "4", "5", "6", "7", "8", "9", "K", "A", "B", "C", "D", "E"]
_DATE_RE = re.compile(r"(\d+/\d+/\d+)[（(]([一二三四五六日])[）)]")


@dataclass
class AbsenceEntry:
    date:    str  # "115/05/18"（民國）
    weekday: str  # "一"
    period:  str  # "2"
    type:    str  # "缺曠" / "事假" / ...


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
