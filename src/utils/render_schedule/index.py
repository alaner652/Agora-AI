import hashlib
from pathlib import Path

from PIL import Image, ImageDraw

from utils._theme import (
    BG, TITLE_BG, TITLE_FG, HEAD_BG, HEAD_FG,
    BODY_FG, MUTED_FG, SUBTLE_FG, SUBTLE_BG, BORDER,
    PAD, TITLE_H, HEAD_H, RADIUS, GAP,
    font, rounded_cell, truncate,
)

_CELL_W = 150
_CELL_H = 90
_TIME_W = 96

_DAYS = ["一", "二", "三", "四", "五", "六", "日"]


def _course_color(name: str) -> tuple[int, int, int]:
    d = hashlib.md5(name.encode()).digest()
    return (185 + d[0] % 65, 188 + d[1] % 62, 200 + d[2] % 55)


def render(
    entries: list[dict],
    title: str = "課表",
    output: str = "output/schedule.png",
    scale: int = 2,
) -> str:
    """將課表資料渲染成 PNG 圖片，回傳輸出路徑。"""
    if not entries:
        raise ValueError("課表資料為空")

    s = scale
    cell_w  = _CELL_W  * s
    cell_h  = _CELL_H  * s
    time_w  = _TIME_W  * s
    title_h = TITLE_H  * s
    head_h  = HEAD_H   * s
    pad     = PAD      * s
    radius  = RADIUS   * s
    gap     = GAP      * s

    days = sorted({e["weekday"] for e in entries})
    period_time: dict[str, str] = {e["period"]: e["time_range"] for e in entries}
    periods  = sorted(period_time, key=lambda p: period_time[p])
    cell_map = {(e["weekday"], e["period"]): e for e in entries}

    cols  = len(days)
    rows  = len(periods)
    img_w = pad * 2 + time_w + cols * cell_w
    img_h = title_h + head_h + rows * cell_h + pad

    img  = Image.new("RGB", (img_w, img_h), BG)
    draw = ImageDraw.Draw(img)

    f_title  = font(20 * s)
    f_head   = font(13 * s)
    f_period = font(13 * s)
    f_time   = font(10 * s)
    f_course = font(13 * s)
    f_sub    = font(10 * s)

    ox = pad + time_w
    oy = title_h + head_h

    # ── title ─────────────────────────────────────────────────────────────────
    draw.rectangle([0, 0, img_w, title_h], fill=TITLE_BG)
    draw.text((img_w // 2, title_h // 2), title,
              font=f_title, fill=TITLE_FG, anchor="mm")

    # ── weekday header ────────────────────────────────────────────────────────
    draw.rectangle([0, title_h, img_w, title_h + head_h], fill=HEAD_BG)
    for ci, wd in enumerate(days):
        cx = ox + ci * cell_w + cell_w // 2
        draw.text((cx, title_h + head_h // 2), f"週{_DAYS[wd - 1]}",
                  font=f_head, fill=HEAD_FG, anchor="mm")

    # ── grid ──────────────────────────────────────────────────────────────────
    inner_w = cell_w - gap * 2

    for ri, period in enumerate(periods):
        ry = oy + ri * cell_h

        # time column
        rounded_cell(draw,
                     [pad, ry + gap, pad + time_w - gap, ry + cell_h - gap],
                     radius, SUBTLE_BG, BORDER)
        draw.text((pad + time_w // 2, ry + cell_h // 2 - 7 * s),
                  period, font=f_period, fill=MUTED_FG, anchor="mm")
        draw.text((pad + time_w // 2, ry + cell_h // 2 + 9 * s),
                  period_time[period], font=f_time, fill=SUBTLE_FG, anchor="mm")

        for ci, wd in enumerate(days):
            cx    = ox + ci * cell_w
            rect  = [cx + gap, ry + gap, cx + cell_w - gap, ry + cell_h - gap]
            entry = cell_map.get((wd, period))

            if entry:
                bg = _course_color(entry["course"])
                bd = tuple(max(0, v - 20) for v in bg)
                tx = cx + cell_w // 2

                rounded_cell(draw, rect, radius, bg, bd)

                # build text lines then vertically center the block
                lines = [
                    (f_course, truncate(f_course, entry["course"], inner_w - 8 * s), BODY_FG),
                ]
                if entry["teacher"]:
                    lines.append((f_sub, truncate(f_sub, entry["teacher"], inner_w - 8 * s), MUTED_FG))
                if entry["classroom"]:
                    lines.append((f_sub, truncate(f_sub, entry["classroom"], inner_w - 8 * s), MUTED_FG))

                line_gap = 4 * s
                line_hs  = [fnt.getbbox("A")[3] for fnt, _, _ in lines]
                block_h  = sum(line_hs) + line_gap * (len(lines) - 1)
                y = ry + (cell_h - block_h) // 2

                for (fnt, text, fg), lh in zip(lines, line_hs):
                    draw.text((tx, y + lh // 2), text, font=fnt, fill=fg, anchor="mm")
                    y += lh + line_gap
            else:
                rounded_cell(draw, rect, radius, SUBTLE_BG, BORDER)

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    img.save(output, dpi=(72 * s, 72 * s))
    return output
