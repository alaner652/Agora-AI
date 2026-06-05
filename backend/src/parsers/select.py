from bs4 import BeautifulSoup


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
