import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from ._utils import get_text

_GRADE_FOOTER_KW = {"學期總平均", "修習學分數", "實得學分數"}


@dataclass
class GradeEntry:
    semester: str  # "114學年度第2學期"
    course:   str
    type:     str  # "必修" / "選修"
    credits:  str  # "2"
    score:    str  # "85" or ""
    passed:   bool # False when score cell contains <font color="red">


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
            cell0 = get_text(cols[0])

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
                name = get_text(cols[offset])
                if not name or any(kw in name for kw in _GRADE_FOOTER_KW):
                    continue
                type_    = get_text(cols[offset + 1])
                credits  = get_text(cols[offset + 2])
                score_td = cols[offset + 3]
                score    = get_text(score_td)
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
