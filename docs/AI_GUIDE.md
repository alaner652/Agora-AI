# AI 操作指南

本文件說明 AI（Claude）如何理解使用者的自然語言需求，對應到正確腳本執行，並解讀輸出結果。

## 基本流程

```
使用者說話 → AI 判斷意圖 → 執行腳本 → 讀取 JSON → 用中文回答
```

腳本都是互動式的（帶 `input()`），若需要 AI 代為執行，必須透過 pipe 或改寫為非互動版。目前最實際的做法是 AI **讀取現有 JSON 快取** 或 **直接呼叫腳本並透過 stdin 輸入選項**。

---

## 腳本清單

| 腳本 | 用途 | JSON 輸出 |
|------|------|-----------|
| `scripts/fetch_schedule.py` | 查課表（選學期）| `output/schedule.json` |
| `scripts/fetch_absence.py` | 查缺曠（選學期 + 日期範圍）| `output/absence.json` |
| `scripts/fetch_grades.py` | 查歷年成績（選學期）| `output/grades.json` |
| `scripts/apply_leave.py` | 送出請假申請 | `output/leave_result.json` |
| `scripts/manage_leaves.py` | 查看 / 刪除假單 | `output/leaves.json` |

環境變數：`.env` 需有 `TPCU_UID` 和 `TPCU_PWD`。

---

## JSON 輸出格式

### `schedule.json`
```json
{
  "type": "schedule",
  "semester": "114學年度第2學期",
  "entries": [
    {
      "weekday": 1,
      "period": "1",
      "time_range": "0820-0910",
      "course": "微積分",
      "teacher": "王老師",
      "classroom": "A101"
    }
  ],
  "generated_at": "2026-05-21T10:00:00"
}
```
`weekday`：1=週一 … 7=週日

---

### `absence.json`
```json
{
  "type": "absence",
  "semester": "114學年度第2學期",
  "date_range": { "start": "1150421", "end": "1150521" },
  "entries": [
    {
      "date": "115/05/10",
      "weekday": "五",
      "period": "2",
      "type": "事假"
    }
  ],
  "generated_at": "..."
}
```

---

### `grades.json`
```json
{
  "type": "grades",
  "semester": "114學年度第2學期",
  "entries": [
    {
      "semester": "114學年度第2學期",
      "course": "資料結構",
      "type": "必修",
      "credits": "3",
      "score": "78",
      "passed": true
    }
  ],
  "summary": {
    "total_credits": 18,
    "passed_credits": 15,
    "failed_courses": ["線性代數"]
  },
  "generated_at": "..."
}
```

---

### `leaves.json`
```json
{
  "type": "leaves",
  "date_range": { "start": "1150421", "end": "1150521" },
  "entries": [
    {
      "index": "1",
      "barcode": "L20260521001",
      "reason": "系科公假",
      "apply_date": "115/05/21",
      "start_date": "115/05/21",
      "end_date": "115/05/21",
      "teacher_status": "待審",
      "teacher_note": "",
      "officer_status": "",
      "officer_note": "",
      "stdkey": "123456",
      "can_delete": true
    }
  ],
  "generated_at": "..."
}
```

---

### `leave_result.json`
```json
{
  "type": "leave_result",
  "request": {
    "date": "1150521",
    "leave_id": "23",
    "leave_name": "公假",
    "periods": ["2", "3"],
    "reason": "系科公假"
  },
  "result": {
    "success": true,
    "message": "申請完成"
  },
  "generated_at": "..."
}
```

---

## 日期格式規則

| 用途 | 格式 | 範例 |
|------|------|------|
| 腳本參數 | 民國 `YYYMMDD` | `1150521` = 2026/05/21 |
| JSON 顯示 | 民國 `YYY/MM/DD` | `115/05/21` |
| 西元年換算 | 民國年 + 1911 | 115 + 1911 = 2026 |

---

## 節次順序

```
朝會 → 早自習 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → K → A → B → C → D → E
```

`lea_value` 格式（請假用）：
```
{YYYMMDD}%{朝會}%{早自習}%{1}%{2}%...%{E}%
每節填假別id（如23）或0（不請假）
```

---

## 假別代碼

| id | 名稱 | 備注 |
|----|------|------|
| 21 | 事假 | |
| 22 | 病假 | |
| 23 | 公假 | 需附 JPEG/PDF；原因限：兵役／法院傳訴／國家考試／系科公假 |
| 24 | 喪假 | |
| 25 | 婚假 | |
| 26 | 孕(產)假 | |
| 27 | 哺育假 | |
| 28 | 防疫假 | |
| 29 | 生理假 | |
| 31 | 原住民假 | |

---

## 常見意圖對應

| 使用者說 | 對應動作 |
|---------|---------|
| 「查課表」「這學期有什麼課」 | 執行 `fetch_schedule.py` |
| 「有幾次缺曠」「近30天出席狀況」 | 執行 `fetch_absence.py` |
| 「成績怎樣」「有沒有不及格」 | 執行 `fetch_grades.py` |
| 「幫我請假」「請 X 節 XX 假」 | 執行 `apply_leave.py` |
| 「看一下假單」「有沒有在審核」 | 執行 `manage_leaves.py` |
| 「哪天課最多」「週幾最輕鬆」 | 讀 `schedule.json` 分析 |
| 「缺曠最多的節次」 | 讀 `absence.json` 統計 |
| 「哪學期最慘」 | 讀 `grades.json` 跨學期比較（需先抓全部） |

---

## 執行注意事項

1. **腳本是互動式的**：直接執行需要 stdin 輸入。AI 代執行時用 echo pipe 或 expect。
2. **快取可能過時**：`output/*.json` 是上次執行的結果，若要最新資料需重新跑腳本。
3. **Session 有效期**：JSESSIONID 約 30 分鐘失效，腳本每次都會重新登入。
4. **請假不可逆**：送出後若要撤回需在 `manage_leaves.py` 刪除，且只有「待審」狀態才能刪。
