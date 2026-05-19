from pathlib import Path

from PIL import ImageFont

_FONT_PATHS = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/Library/Fonts/Arial Unicode MS.ttf",
]

# Palette
BG        = (255, 255, 255)
TITLE_BG  = (15,  23,  42)
TITLE_FG  = (255, 255, 255)
HEAD_BG   = (30,  41,  59)
HEAD_FG   = (203, 213, 225)
BODY_FG   = (15,  23,  42)
MUTED_FG  = (100, 116, 139)
SUBTLE_FG = (148, 163, 184)
SUBTLE_BG = (248, 250, 252)
BORDER    = (226, 232, 240)
DIVIDER   = (229, 231, 235)
ALT_BG    = (248, 250, 252)

# Layout
PAD     = 24
TITLE_H = 52
HEAD_H  = 38
RADIUS  = 6
GAP     = 3


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in _FONT_PATHS:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def rounded_cell(draw, rect, radius, fill, border=None):
    draw.rounded_rectangle(rect, radius=radius, fill=fill,
                           outline=border or fill, width=1)


def text_w(fnt, text: str) -> int:
    return fnt.getbbox(text)[2]


def truncate(fnt, text: str, max_w: int) -> str:
    if text_w(fnt, text) <= max_w:
        return text
    while len(text) > 1 and text_w(fnt, text + "…") > max_w:
        text = text[:-1]
    return text + "…"
