from pathlib import Path

from PIL import Image, ImageDraw

from utils._theme import (
    BG, TITLE_BG, TITLE_FG, HEAD_BG, HEAD_FG,
    BODY_FG, MUTED_FG, SUBTLE_BG, DIVIDER,
    PAD, TITLE_H, HEAD_H,
    font,
)

_NAME_W  = 210
_TYPE_W  = 72
_CRED_W  = 56
_SCORE_W = 68
_ROW_H   = 40
_FAIL_BG = (255, 241, 242)
_FAIL_FG = (190,  18,  60)
_FAIL_BAR = (220,  38,  38)

_SUMMARY_BG = (241, 245, 249)

_COLS = [
    ("科目名稱", _NAME_W),
    ("必選修",   _TYPE_W),
    ("學分",     _CRED_W),
    ("分數",     _SCORE_W),
]
_KEYS = ["course", "type", "credits", "score"]


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
    row_h    = _ROW_H   * s
    title_h  = TITLE_H  * s
    head_h   = HEAD_H   * s
    pad      = PAD      * s
    summary_h = head_h

    img_w = pad * 2 + total_w
    img_h = title_h + head_h + len(entries) * row_h + summary_h + pad // 2

    img  = Image.new("RGB", (img_w, img_h), BG)
    draw = ImageDraw.Draw(img)

    f_title   = font(20 * s)
    f_head    = font(12 * s)
    f_cell    = font(12 * s)
    f_muted   = font(11 * s)
    f_summary = font(12 * s)

    oy = 0

    # ── title ─────────────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + title_h], fill=TITLE_BG)
    draw.text((img_w // 2, oy + title_h // 2), title,
              font=f_title, fill=TITLE_FG, anchor="mm")
    oy += title_h

    # ── column header ─────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + head_h], fill=HEAD_BG)
    ox = pad
    for (label, _), cw in zip(_COLS, col_widths):
        draw.text((ox + cw // 2, oy + head_h // 2), label,
                  font=f_head, fill=HEAD_FG, anchor="mm")
        ox += cw
    oy += head_h

    # ── data rows ─────────────────────────────────────────────────────────────
    for i, entry in enumerate(entries):
        failed = not entry.get("passed", True)
        bg = _FAIL_BG if failed else (SUBTLE_BG if i % 2 else BG)
        draw.rectangle([0, oy, img_w, oy + row_h], fill=bg)

        # left accent bar on failed rows
        if failed:
            draw.rectangle([0, oy, 3 * s, oy + row_h], fill=_FAIL_BAR)

        ox = pad
        for ki, (key, cw) in enumerate(zip(_KEYS, col_widths)):
            text = str(entry.get(key, ""))
            if ki == 3 and failed:
                fg, fnt = _FAIL_FG, f_cell
            elif ki >= 1:
                fg, fnt = MUTED_FG, f_muted
            else:
                fg, fnt = BODY_FG, f_cell
            draw.text((ox + cw // 2, oy + row_h // 2), text,
                      font=fnt, fill=fg, anchor="mm")
            ox += cw

        draw.line([0, oy + row_h, img_w, oy + row_h], fill=DIVIDER, width=1)
        oy += row_h

    # ── summary row ───────────────────────────────────────────────────────────
    draw.rectangle([0, oy, img_w, oy + summary_h], fill=_SUMMARY_BG)
    draw.line([0, oy, img_w, oy], fill=DIVIDER, width=1)

    # total credits
    total_credits = sum(
        float(e.get("credits") or 0)
        for e in entries
        if str(e.get("credits", "")).replace(".", "").isdigit()
    )
    cred_str = str(int(total_credits)) if total_credits == int(total_credits) else f"{total_credits:.1f}"

    # weighted average (scored entries only)
    scored = [
        (float(e["score"]), float(e.get("credits") or 0))
        for e in entries
        if str(e.get("score", "")).replace(".", "").isdigit()
        and str(e.get("credits", "")).replace(".", "").isdigit()
    ]
    total_cred_scored = sum(c for _, c in scored)
    avg_str = f"{sum(sc * c for sc, c in scored) / total_cred_scored:.1f}" if total_cred_scored else "—"

    ox = pad
    draw.text((ox + col_widths[0] // 2, oy + summary_h // 2),
              "學期合計", font=f_summary, fill=MUTED_FG, anchor="mm")
    ox += col_widths[0] + col_widths[1]
    draw.text((ox + col_widths[2] // 2, oy + summary_h // 2),
              cred_str, font=f_summary, fill=BODY_FG, anchor="mm")
    ox += col_widths[2]
    draw.text((ox + col_widths[3] // 2, oy + summary_h // 2),
              avg_str, font=f_summary, fill=BODY_FG, anchor="mm")

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    img.save(output, dpi=(72 * s, 72 * s))
    return output
