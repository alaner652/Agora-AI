import re

from bs4 import BeautifulSoup

from ._utils import get_text

_LEAVE_SKIP_HEADERS = {"快速登錄", "快速登錄(aa)", "日期", "星期"}
_BLUE_COLORS = {"99ccff", "6699ff", "0000ff", "ccccff", "9999ff", "3399ff", "0066ff"}
_DATE_DOT_RE = re.compile(r"(\d{3})\.(\d{2})\.(\d{2})")

_PRT_RE = re.compile(r"prt_data\('(\d+)','([^']+)'\)")
_DEL_RE = re.compile(r"go_del\('(\d+)','([^']+)','(\d+)','(\d+)'\)")


def _is_blue_cell(td) -> bool:
    bg    = td.get("bgcolor", "").lower().lstrip("#")
    cls   = " ".join(td.get("class", [])).lower()
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
        get_text(td)
        for td in header_cells[period_start_idx:]
        if get_text(td)
    ]

    scheduled: list[str] = []
    date_str = ""

    for row in rows:
        if row is header_row:
            continue
        cols = row.find_all("td")
        if len(cols) < period_start_idx + len(period_order):
            continue
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


def parse_leaves(html: str) -> list[dict]:
    """解析 ck001_view.jsp，回傳假單列表。

    Returns:
        [{"index", "barcode", "reason", "apply_date", "start_date",
          "end_date", "teacher_status", "teacher_note",
          "officer_status", "officer_note", "action_status",
          "stdkey", "can_delete"}, ...]

    action_status 為第 12 欄的異動說明文字（如「作廢」、「無法異動(已核准)」）；
    可刪除（該欄為刪除按鈕）時為空字串。
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
        stdkey = ""
        m = _PRT_RE.search(cols[6].decode_contents())
        if m:
            stdkey = m.group(1)

        can_delete = bool(cols[11].find("input"))

        entries.append({
            "index":          get_text(cols[0]),
            "barcode":        get_text(cols[1]),
            "reason":         get_text(cols[2]),
            "apply_date":     get_text(cols[3]),
            "start_date":     get_text(cols[4]),
            "end_date":       get_text(cols[5]),
            "teacher_status": get_text(cols[7]),
            "teacher_note":   get_text(cols[8]),
            "officer_status": get_text(cols[9]),
            "officer_note":   get_text(cols[10]),
            "action_status":  get_text(cols[11]),
            "stdkey":         stdkey,
            "can_delete":     can_delete,
        })

    return entries
