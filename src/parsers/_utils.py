def get_text(tag, separator: str = "") -> str:
    """從 BeautifulSoup tag 取純文字，清除 non-breaking space 並 strip。"""
    return tag.get_text(separator=separator).replace("\xa0", "").strip()
