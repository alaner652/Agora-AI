from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── Base layout（1x，實際渲染乘以 scale）──────────────────────────────────────
_DATE_W   = 150
_PERIOD_W = 55
_ROW_H    = 44
_TITLE_H  = 52
_SUB_H    = 28
_HEAD_H   = 40
_LEGEND_H = 32
_PAD      = 24
_RADIUS   = 6
_GAP      = 2

# ── Palette ───────────────────────────────────────────────────────────────────
_BG        = (245, 247, 250)
_TITLE_BG  = (26,  32,  44)
_TITLE_FG  = (255, 255, 255)
_SUB_BG    = (45,  55,  72)
_SUB_FG    = (190, 205, 220)
_HEAD_BG   = (74,  85, 104)
_HEAD_FG   = (226, 232, 240)
_DATE_BG   = (237, 242, 247)
_DATE_FG   = (45,  55,  72)
_EMPTY_BG  = (255, 255, 255)
_EMPTY_BD  = (226, 232, 240)

_TYPE_COLORS = {
    "缺曠": (255, 179, 179),
    "遲到": (255, 218, 160),
    "事假": (179, 210, 255),
    "病假": (179, 240, 205),
    "公假": (220, 179, 255),
    "喪假": (200, 200, 200),
}
_DEFAULT_COLOR = (210, 215, 220)

_FONT_PATHS = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/Library/Fonts/Arial Unicode MS.ttf",
]

_ALL_PERIODS = ["朝會", "自", "1", "2", "3", "4", "5", "6",
                "7", "8", "9", "K", "A", "B", "C", "D", "E"]


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
    title: str = "缺曠記錄",
    date_range: str = "",
    output: str = "output/absence.png",
    scale: int = 2,
) -> str:
    """將缺曠資料渲染成 PNG 圖片，回傳輸出路徑。"""
    if not entries:
        raise ValueError("缺曠資料為空")

    s = scale

    # ── 整理資料 ──────────────────────────────────────────────────────────────
    periods_used = [p for p in _ALL_PERIODS
                    if any(e["period"] == p for e in entries)]

    day_map: dict[tuple, dict[str, str]] = defaultdict(dict)
    for e in entries:
        day_map[(e["date"], e["weekday"])][e["period"]] = e["type"]
    days = sorted(day_map.keys())

    legend_types = list(dict.fromkeys(e["type"] for e in entries))

    # ── 計算尺寸 ──────────────────────────────────────────────────────────────
    date_w   = _DATE_W   * s
    period_w = _PERIOD_W * s
    row_h    = _ROW_H    * s
    title_h  = _TITLE_H  * s
    sub_h    = _SUB_H    * s if date_range else 0
    head_h   = _HEAD_H   * s
    legend_h = _LEGEND_H * s if legend_types else 0
    pad      = _PAD      * s
    radius   = _RADIUS   * s
    gap      = _GAP      * s

    cols  = len(periods_used)
    rows  = len(days)
    img_w = pad * 2 + date_w + cols * period_w
    img_h = title_h + sub_h + head_h + rows * row_h + pad + legend_h

    img  = Image.new("RGB", (img_w, img_h), _BG)
    draw = ImageDraw.Draw(img)

    f_title = _font(20 * s)
    f_sub   = _font(10 * s)
    f_head  = _font(13 * s)
    f_date  = _font(12 * s)
    f_type  = _font(11 * s)

    oy = 0

    # ── 標題列（從頂端滿版）────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + title_h], fill=_TITLE_BG)
    draw.text((img_w // 2, oy + title_h // 2), title,
              font=f_title, fill=_TITLE_FG, anchor="mm")
    oy += title_h

    # ── 日期範圍副標 ──────────────────────────────────────────────────────────
    if date_range:
        draw.rectangle([0, oy, img_w, oy + sub_h], fill=_SUB_BG)
        draw.text((img_w // 2, oy + sub_h // 2), date_range,
                  font=f_sub, fill=_SUB_FG, anchor="mm")
        oy += sub_h

    # ── 節次標頭 ──────────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + head_h], fill=_HEAD_BG)
    ox = pad + date_w
    for ci, period in enumerate(periods_used):
        cx = ox + ci * period_w + period_w // 2
        draw.text((cx, oy + head_h // 2), period,
                  font=f_head, fill=_HEAD_FG, anchor="mm")
    oy += head_h

    # ── 資料列 ────────────────────────────────────────────────────────────────
    for (dt, wd), period_data in zip(days, [day_map[d] for d in days]):
        date_rect = [pad, oy + gap, pad + date_w - gap, oy + row_h - gap]
        _draw_cell(draw, date_rect, radius, _DATE_BG, _EMPTY_BD)
        draw.text((pad + date_w // 2, oy + row_h // 2 - 7 * s),
                  dt, font=f_date, fill=_DATE_FG, anchor="mm")
        draw.text((pad + date_w // 2, oy + row_h // 2 + 9 * s),
                  f"週{wd}", font=f_type, fill=_HEAD_BG, anchor="mm")

        for ci, period in enumerate(periods_used):
            cx   = pad + date_w + ci * period_w
            rect = [cx + gap, oy + gap, cx + period_w - gap, oy + row_h - gap]
            absence_type = period_data.get(period)
            if absence_type:
                bg = _TYPE_COLORS.get(absence_type, _DEFAULT_COLOR)
                bd = tuple(max(0, v - 25) for v in bg)
                _draw_cell(draw, rect, radius, bg, bd)
                draw.text((cx + period_w // 2, oy + row_h // 2),
                          absence_type, font=f_type, fill=(40, 40, 40), anchor="mm")
            else:
                _draw_cell(draw, rect, radius, _EMPTY_BG, _EMPTY_BD)
        oy += row_h

    # ── 圖例 ──────────────────────────────────────────────────────────────────
    if legend_types:
        box  = 14 * s
        lg_y = oy + (pad - box) // 2
        x    = pad
        for t in legend_types:
            color = _TYPE_COLORS.get(t, _DEFAULT_COLOR)
            draw.rounded_rectangle([x, lg_y, x + box, lg_y + box],
                                   radius=3 * s, fill=color)
            draw.text((x + box + 5 * s, lg_y + box // 2),
                      t, font=f_type, fill=_HEAD_BG, anchor="lm")
            x += box + 5 * s + _font(11 * s).getbbox(t)[2] + 16 * s

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    img.save(output, dpi=(72 * s, 72 * s))
    return output
