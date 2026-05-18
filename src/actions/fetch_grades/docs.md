# fetch_grades

查詢學生歷年成績（AG102）。

## 端點

```
POST /tsint/ag_pro/ag102.jsp
```

## 請求參數

| 欄位 | 值 | 說明 |
|------|----|------|
| `arg01–arg06` | `""` | 留空，伺服器從 Session 識別學生 |
| `fncid` | `AG102` | 功能代碼 |

## 回傳

`list[dict]`，每筆為一門課程：

```python
{
    "semester": "114學年度第2學期",
    "course":   "大學英文",
    "type":     "必修",
    "credits":  "2",
    "score":    "88",
    "passed":   True,   # False 表示不及格（HTML 以紅色字顯示）
}
```

## 使用方式

```python
from actions.fetch_grades.index import get_grades

entries = await get_grades(jsessionid)
semesters = list(dict.fromkeys(e["semester"] for e in entries))
```

## 備註

- 單次 POST 即回傳所有歷年成績，不需要先呼叫學期選單
- 學期列表需自行從回傳資料中解析
