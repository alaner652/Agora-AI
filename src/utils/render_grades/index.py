from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── Base layout（1x，實際渲染乘以 scale）──────────────────────────────────────
_NAME_W  = 200
_TYPE_W  = 70
_CRED_W  = 55
_SCORE_W = 65
_ROW_H   = 40
_TITLE_H = 52
_HEAD_H  = 36
_PAD     = 24
_RADIUS  = 6
_GAP     = 2

# ── Palette ───────────────────────────────────────────────────────────────────
_BG       = (245, 247, 250)
_TITLE_BG = (26,  32,  44)
_TITLE_FG = (255, 255, 255)
_HEAD_BG  = (74,  85, 104)
_HEAD_FG  = (226, 232, 240)
_ROW_BG   = (255, 255, 255)
_ALT_BG   = (248, 250, 252)
_FAIL_BG  = (255, 220, 220)
_CELL_BD  = (226, 232, 240)
_TEXT_FG  = (45,  55,  72)

_COLS = [
    ("科目名稱", _NAME_W),
    ("必選修",   _TYPE_W),
    ("學分",     _CRED_W),
    ("分數",     _SCORE_W),
]
_KEYS = ["course", "type", "credits", "score"]

_FONT_PATHS = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/Library/Fonts/Arial Unicode MS.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in _FONT_PATHS:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _draw_cell(draw, rect, radius, fill, border=None):
    draw.rounded_rectangle(rect, radius=radius, fill=fill,
                            outline=border or fill, width=1)


def render(
    entries: list[dict],
    title: str = "學期成績",
    output: str = "output/grades.png",
    scale: int = 2,
) -> str:
    """將單學期成績渲染成 PNG 圖片，回傳輸出路徑。"""
    if not entries:
        raise ValueError("成績資料為空")

    s = scale
    col_widths = [w * s for _, w in _COLS]
    total_w  = sum(col_widths)
    row_h    = _ROW_H  * s
    title_h  = _TITLE_H * s
    head_h   = _HEAD_H  * s
    pad      = _PAD     * s
    radius   = _RADIUS  * s
    gap      = _GAP     * s

    img_w = pad * 2 + total_w
    img_h = title_h + head_h + len(entries) * row_h + pad

    img  = Image.new("RGB", (img_w, img_h), _BG)
    draw = ImageDraw.Draw(img)

    f_title = _font(20 * s)
    f_head  = _font(13 * s)
    f_cell  = _font(12 * s)

    oy = 0

    # ── 標題列 ────────────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + title_h], fill=_TITLE_BG)
    draw.text((img_w // 2, oy + title_h // 2), title,
              font=f_title, fill=_TITLE_FG, anchor="mm")
    oy += title_h

    # ── 欄位標頭 ──────────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + head_h], fill=_HEAD_BG)
    ox = pad
    for (label, _), cw in zip(_COLS, col_widths):
        draw.text((ox + cw // 2, oy + head_h // 2), label,
                  font=f_head, fill=_HEAD_FG, anchor="mm")
        ox += cw
    oy += head_h

    # ── 資料列 ────────────────────────────────────────────────────────────────
    for i, entry in enumerate(entries):
        bg = _FAIL_BG if not entry.get("passed", True) else (_ALT_BG if i % 2 else _ROW_BG)
        draw.rectangle([pad, oy, pad + total_w, oy + row_h], fill=bg)

        ox = pad
        for key, cw in zip(_KEYS, col_widths):
            text = str(entry.get(key, ""))
            draw.text((ox + cw // 2, oy + row_h // 2), text,
                      font=f_cell, fill=_TEXT_FG, anchor="mm")
            ox += cw

        draw.line([pad, oy + row_h, pad + total_w, oy + row_h],
                  fill=_CELL_BD, width=1)
        oy += row_h

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    img.save(output, dpi=(72 * s, 72 * s))
    return output
