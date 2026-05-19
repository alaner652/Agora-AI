from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

from utils._theme import (
    BG, TITLE_BG, TITLE_FG, HEAD_BG, HEAD_FG,
    MUTED_FG, SUBTLE_FG, SUBTLE_BG, BORDER, DIVIDER,
    PAD, TITLE_H, HEAD_H, RADIUS, GAP,
    font, rounded_cell, text_w,
)

_DATE_W   = 148
_PERIOD_W = 54
_ROW_H    = 44
_SUB_H    = 26
_LEGEND_H = 40

_TYPE_STYLE = {
    "缺曠": ((254, 226, 226), (153,  27,  27)),
    "遲到": ((254, 243, 199), (146,  64,  14)),
    "事假": ((219, 234, 254), ( 30,  64, 175)),
    "病假": ((209, 250, 229), (  6,  95,  70)),
    "公假": ((237, 233, 254), ( 76,  29, 149)),
    "喪假": ((243, 244, 246), ( 71,  85,  99)),
}
_DEFAULT_STYLE = ((243, 244, 246), (71, 85, 99))

_ALL_PERIODS = ["朝會", "自", "1", "2", "3", "4", "5", "6",
                "7", "8", "9", "K", "A", "B", "C", "D", "E"]

_SUB_BG = (24, 36, 60)


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

    periods_used = [p for p in _ALL_PERIODS
                    if any(e["period"] == p for e in entries)]

    day_map: dict[tuple, dict[str, str]] = defaultdict(dict)
    for e in entries:
        day_map[(e["date"], e["weekday"])][e["period"]] = e["type"]
    days = sorted(day_map.keys())

    legend_types = list(dict.fromkeys(e["type"] for e in entries))

    date_w   = _DATE_W   * s
    period_w = _PERIOD_W * s
    row_h    = _ROW_H    * s
    title_h  = TITLE_H   * s
    sub_h    = _SUB_H    * s if date_range else 0
    head_h   = HEAD_H    * s
    legend_h = _LEGEND_H * s if legend_types else 0
    pad      = PAD       * s
    radius   = RADIUS    * s
    gap      = GAP       * s

    cols  = len(periods_used)
    img_w = pad * 2 + date_w + cols * period_w
    img_h = title_h + sub_h + head_h + len(days) * row_h + legend_h

    img  = Image.new("RGB", (img_w, img_h), BG)
    draw = ImageDraw.Draw(img)

    f_title = font(20 * s)
    f_sub   = font(10 * s)
    f_head  = font(12 * s)
    f_date  = font(12 * s)
    f_type  = font(10 * s)

    oy = 0

    # ── title ─────────────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + title_h], fill=TITLE_BG)
    draw.text((img_w // 2, oy + title_h // 2), title,
              font=f_title, fill=TITLE_FG, anchor="mm")
    oy += title_h

    # ── date range subtitle ───────────────────────────────────────────────────
    if date_range:
        draw.rectangle([0, oy, img_w, oy + sub_h], fill=_SUB_BG)
        draw.text((img_w // 2, oy + sub_h // 2), date_range,
                  font=f_sub, fill=SUBTLE_FG, anchor="mm")
        oy += sub_h

    # ── period header ─────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + head_h], fill=HEAD_BG)
    ox = pad + date_w
    for ci, period in enumerate(periods_used):
        cx = ox + ci * period_w + period_w // 2
        draw.text((cx, oy + head_h // 2), period,
                  font=f_head, fill=HEAD_FG, anchor="mm")
    oy += head_h

    # ── data rows ─────────────────────────────────────────────────────────────
    for ri, ((dt, wd), period_data) in enumerate(zip(days, [day_map[d] for d in days])):
        row_bg = SUBTLE_BG if ri % 2 else BG
        draw.rectangle([0, oy, img_w, oy + row_h], fill=row_bg)

        date_rect = [pad, oy + gap, pad + date_w - gap, oy + row_h - gap]
        rounded_cell(draw, date_rect, radius, SUBTLE_BG, BORDER)
        draw.text((pad + date_w // 2, oy + row_h // 2 - 6 * s),
                  dt, font=f_date, fill=MUTED_FG, anchor="mm")
        draw.text((pad + date_w // 2, oy + row_h // 2 + 7 * s),
                  f"週{wd}", font=f_type, fill=SUBTLE_FG, anchor="mm")

        for ci, period in enumerate(periods_used):
            cx   = pad + date_w + ci * period_w
            rect = [cx + gap, oy + gap, cx + period_w - gap, oy + row_h - gap]
            absence_type = period_data.get(period)
            if absence_type:
                bg, fg = _TYPE_STYLE.get(absence_type, _DEFAULT_STYLE)
                bd = tuple(max(0, v - 15) for v in bg)
                rounded_cell(draw, rect, radius, bg, bd)
                draw.text((cx + period_w // 2, oy + row_h // 2),
                          absence_type, font=f_type, fill=fg, anchor="mm")
            else:
                rounded_cell(draw, rect, radius, SUBTLE_BG, BORDER)

        draw.line([0, oy + row_h, img_w, oy + row_h], fill=DIVIDER, width=1)
        oy += row_h

    # ── legend (centered) ─────────────────────────────────────────────────────
    if legend_types:
        box      = 12 * s
        item_gap = 16 * s
        total_w  = sum(box + 5 * s + text_w(f_type, t) for t in legend_types)
        total_w += item_gap * (len(legend_types) - 1)
        x        = (img_w - total_w) // 2
        lg_y     = oy + (legend_h - box) // 2

        for t in legend_types:
            bg, _ = _TYPE_STYLE.get(t, _DEFAULT_STYLE)
            draw.rounded_rectangle([x, lg_y, x + box, lg_y + box],
                                   radius=3 * s, fill=bg)
            draw.text((x + box + 5 * s, lg_y + box // 2),
                      t, font=f_type, fill=MUTED_FG, anchor="lm")
            x += box + 5 * s + text_w(f_type, t) + item_gap

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    img.save(output, dpi=(72 * s, 72 * s))
    return output
