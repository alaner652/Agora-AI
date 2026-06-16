"""Parse student profile from the perchk.jsp response page."""

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from log import get_logger

_log = get_logger("parsers.perchk")

_JS_VARS = [
    # (field_key, list_of_regex_patterns)
    ("name", [
        r'var\s+(?:ls_|gs_|stud_)?stuname\s*=\s*["\']([^"\']+)["\']',
        r'var\s+(?:ls_|gs_)?name\s*=\s*["\']([^"\']+)["\']',
    ]),
    ("student_id", [
        r'var\s+(?:ls_|gs_)?stuid\s*=\s*["\']([^"\']+)["\']',
        r'var\s+(?:ls_|gs_)?uid\s*=\s*["\']([^"\']+)["\']',
    ]),
    ("year", [
        r'var\s+(?:ls_|gs_|s_)?syear\s*=\s*["\'](\d+)["\']',
        r'var\s+(?:ls_|gs_)?year\s*=\s*["\'](\d+)["\']',
    ]),
    ("semester", [
        r'var\s+(?:ls_|gs_)?sem(?:ester)?\s*=\s*["\'](\d+)["\']',
        r'var\s+(?:ls_|gs_)?sms\s*=\s*["\'](\d+)["\']',
    ]),
]

# Hidden input ids that might carry these values
_INPUT_IDS = {
    "name": ["stuname", "ls_stuname", "stud_name"],
    "student_id": ["stuid", "ls_stuid"],
    "year": ["syear", "ls_syear", "s_syear"],
    "semester": ["semester", "ls_semester", "sem"],
}


@dataclass
class StudentProfile:
    name: str = ""
    student_id: str = ""
    year: str = ""       # 民國學年，例如 "114"
    semester: str = ""   # "1" 或 "2"

    @property
    def semester_value(self) -> str:
        """學期選擇器使用的格式，例如 '114,2'。"""
        if self.year and self.semester:
            return f"{self.year},{self.semester}"
        return ""

    def __bool__(self) -> bool:
        return bool(self.name or self.year)


def parse_perchk(html: str) -> StudentProfile:
    """從 perchk.jsp 的回應 HTML 提取學生基本資料。

    使用多種 regex/BeautifulSoup 模式；找不到的欄位留空字串而非拋例外。
    """
    profile = StudentProfile()
    found: dict[str, str] = {}

    # --- Phase 1: JavaScript variable patterns ---
    for field_key, patterns in _JS_VARS:
        for pat in patterns:
            m = re.search(pat, html, re.IGNORECASE)
            if m:
                found[field_key] = m.group(1).strip()
                break

    # --- Phase 2: hidden <input> elements ---
    if len(found) < 4:
        soup = BeautifulSoup(html, "html.parser")
        for field_key, id_candidates in _INPUT_IDS.items():
            if field_key in found:
                continue
            for cand in id_candidates:
                tag = soup.find("input", {"id": cand}) or soup.find("input", {"name": cand})
                if tag and tag.get("value", "").strip():
                    found[field_key] = tag["value"].strip()
                    break

    profile.name = found.get("name", "")
    profile.student_id = found.get("student_id", "")
    profile.year = found.get("year", "")
    profile.semester = found.get("semester", "")

    if not profile:
        _log.debug("perchk_profile_not_found",
                   hint="perchk.jsp 為導覽選單 frame，不含學生資料，由登入後 fallback 補足")

    return profile
