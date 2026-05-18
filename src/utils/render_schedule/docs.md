# render_schedule

將課表資料（`list[dict]`）渲染成 PNG 圖片。

## 使用方式

```python
from utils.render_schedule.index import render

path = render(entries, title="114學年度第2學期課表", output="schedule.png")
```

## 參數

| 參數 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| `entries` | `list[dict]` | — | `get_schedule()` 的回傳值 |
| `title` | `str` | `"課表"` | 顯示在標題列的文字 |
| `output` | `str` | `"schedule.png"` | 輸出路徑 |

## 版面結構

```
┌──────────────────── 標題列（深色背景 + 白字）─────────────────────┐
├──────┬──────────┬──────────┬──────────┬──────────┬──────────────┤
│      │  週一    │  週二    │  週三    │  週四    │  週五        │
├──────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 第一節│  課名    │          │  課名    │          │  課名        │
│ 0820 │  老師    │          │  老師    │          │  老師        │
│ 0910 │  教室    │          │  教室    │          │  教室        │
├──────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 第二節│          │  課名    │          │  課名    │              │
│  ... │          │  ...     │          │  ...     │              │
```

## 字型

優先順序：
1. `/System/Library/Fonts/PingFang.ttc`（macOS 系統字型）
2. `/System/Library/Fonts/STHeiti Light.ttc`
3. `/Library/Fonts/Arial Unicode MS.ttf`
4. Pillow 內建 fallback（不支援中文）

## 顏色

每門課程以課名 MD5 hash 自動分配柔和的背景色，相同課名跨星期保持同色。
