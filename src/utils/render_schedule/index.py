import hashlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── Base layout（1x 基準，實際渲染會乘以 scale）────────────────────────────────
_CELL_W  = 155
_CELL_H  = 95
_TIME_W  = 105
_TITLE_H = 56
_HEAD_H  = 44
_PAD     = 28
_RADIUS  = 10
_GAP     = 3

# ── Palette ───────────────────────────────────────────────────────────────────
_BG        = (245, 247, 250)
_TITLE_BG  = (26,  32,  44)
_TITLE_FG  = (255, 255, 255)
_HEAD_BG   = (45,  55,  72)
_HEAD_FG   = (226, 232, 240)
_TIME_BG   = (237, 242, 247)
_TIME_FG   = (74,  85, 104)
_TIME_SUB  = (160, 174, 192)
_EMPTY_BG  = (255, 255, 255)
_EMPTY_BD  = (226, 232, 240)
_COURSE_FG = (26,  32,  44)
_SUB_FG    = (74,  85, 104)

_DAYS = ["一", "二", "三", "四", "五", "六", "日"]

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


def _text_w(font, text: str) -> int:
    return font.getbbox(text)[2]


def _truncate(font, text: str, max_w: int) -> str:
    if _text_w(font, text) <= max_w:
        return text
    while len(text) > 1 and _text_w(font, text + "…") > max_w:
        text = text[:-1]
    return text + "…"


def _course_color(name: str) -> tuple[int, int, int]:
    d = hashlib.md5(name.encode()).digest()
    return (160 + d[0] % 70, 160 + d[1] % 70, 185 + d[2] % 55)


def _draw_cell(draw, rect, radius, fill, border):
    draw.rounded_rectangle(rect, radius=radius, fill=fill, outline=border, width=1)


# ── Public API ────────────────────────────────────────────────────────────────

def render(
    entries: list[dict],
    title: str = "課表",
    output: str = "output/schedule.png",
    scale: int = 2,
) -> str:
    """將課表資料渲染成 PNG 圖片，回傳輸出路徑。

    scale=2 產生 2× 像素密度（接近 Retina 品質），適合螢幕與列印。
    """
    if not entries:
        raise ValueError("課表資料為空")

    # scale 所有尺寸
    s        = scale
    cell_w   = _CELL_W  * s
    cell_h   = _CELL_H  * s
    time_w   = _TIME_W  * s
    title_h  = _TITLE_H * s
    head_h   = _HEAD_H  * s
    pad      = _PAD     * s
    radius   = _RADIUS  * s
    gap      = _GAP     * s

    # 整理資料
    days = sorted({e["weekday"] for e in entries})
    period_time: dict[str, str] = {e["period"]: e["time_range"] for e in entries}
    periods  = sorted(period_time, key=lambda p: period_time[p])
    cell_map = {(e["weekday"], e["period"]): e for e in entries}

    cols  = len(days)
    rows  = len(periods)
    img_w = pad * 2 + time_w + cols * cell_w
    img_h = pad * 2 + title_h + head_h + rows * cell_h

    img  = Image.new("RGB", (img_w, img_h), _BG)
    draw = ImageDraw.Draw(img)

    f_title  = _font(22 * s)
    f_head   = _font(16 * s)
    f_period = _font(13 * s)
    f_time   = _font(11 * s)
    f_course = _font(14 * s)
    f_sub    = _font(11 * s)

    ox = pad + time_w
    oy = pad + title_h + head_h

    # 標題列
    draw.rectangle([0, 0, img_w, pad + title_h], fill=_TITLE_BG)
    draw.text((img_w // 2, pad + title_h // 2), title,
              font=f_title, fill=_TITLE_FG, anchor="mm")

    # 星期標頭
    draw.rectangle([0, pad + title_h, img_w, pad + title_h + head_h], fill=_HEAD_BG)
    for ci, wd in enumerate(days):
        cx = ox + ci * cell_w + cell_w // 2
        cy = pad + title_h + head_h // 2
        draw.text((cx, cy), f"週{_DAYS[wd - 1]}", font=f_head, fill=_HEAD_FG, anchor="mm")

    # 節次 × 星期
    inner_w = cell_w - gap * 2

    for ri, period in enumerate(periods):
        ry = oy + ri * cell_h

        # 時間欄
        _draw_cell(draw,
                   [pad, ry + gap, pad + time_w - gap, ry + cell_h - gap],
                   radius, _TIME_BG, _EMPTY_BD)
        draw.text((pad + time_w // 2, ry + cell_h // 2 - 9 * s),
                  period, font=f_period, fill=_TIME_FG, anchor="mm")
        draw.text((pad + time_w // 2, ry + cell_h // 2 + 10 * s),
                  period_time[period], font=f_time, fill=_TIME_SUB, anchor="mm")

        # 課程格
        for ci, wd in enumerate(days):
            cx   = ox + ci * cell_w
            rect = [cx + gap, ry + gap, cx + cell_w - gap, ry + cell_h - gap]
            entry = cell_map.get((wd, period))

            if entry:
                bg = _course_color(entry["course"])
                bd = tuple(max(0, v - 30) for v in bg)
                tx = cx + cell_w // 2

                _draw_cell(draw, rect, radius, bg, bd)

                name = _truncate(f_course, entry["course"], inner_w - 12 * s)
                draw.text((tx, ry + 22 * s), name,
                          font=f_course, fill=_COURSE_FG, anchor="mm")

                if entry["teacher"]:
                    t = _truncate(f_sub, entry["teacher"], inner_w - 12 * s)
                    draw.text((tx, ry + 46 * s), t,
                              font=f_sub, fill=_SUB_FG, anchor="mm")

                if entry["classroom"]:
                    r = _truncate(f_sub, entry["classroom"], inner_w - 12 * s)
                    draw.text((tx, ry + 64 * s), r,
                              font=f_sub, fill=_SUB_FG, anchor="mm")
            else:
                _draw_cell(draw, rect, radius, _EMPTY_BG, _EMPTY_BD)

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    img.save(output, dpi=(72 * s, 72 * s))
    return output
