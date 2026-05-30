# AI 操作指南

本文件說明 AI（Claude）如何理解使用者的自然語言需求，對應到正確腳本執行，並解讀輸出結果。

## 基本流程

```
使用者說話 → AI 判斷意圖 → 執行腳本 → 讀取 JSON → 用中文回答
```

腳本都是互動式的（帶 `input()`），若需要 AI 代為執行，必須透過 pipe 或改寫為非互動版。目前最實際的做法是 AI **讀取現有 JSON 快取** 或 **直接呼叫腳本並透過 stdin 輸入選項**。

---

## 工具清單

| 工具 | 用途 |
|------|------|
| `get_semester_options` | 取得可查詢的學期清單 |
| `fetch_schedule` | 查課表（需指定學期代碼）|
| `fetch_absence` | 查缺曠（需指定學期代碼與日期範圍）|
| `fetch_grades` | 查歷年成績 |
| `get_leave_form` | 取得指定日期的請假表單選項 |
| `apply_leave` | 送出請假申請 |
| `get_leaves` | 查看假單 |
| `delete_leave` | 刪除待審假單 |
| `render_image` | 將最近查詢結果渲染為圖片 |

所有資料均透過上述工具即時取得，**不存在可讀取的本地快取檔案**。

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
| 「哪天課最多」「週幾最輕鬆」 | 呼叫 `fetch_schedule` 取得最新資料再分析 |
| 「缺曠最多的節次」 | 呼叫 `fetch_absence` 取得最新資料再統計 |
| 「哪學期最慘」 | 呼叫 `fetch_grades` 取得後跨學期比較 |

---

## 執行注意事項

1. **Session 有效期**：JSESSIONID 約 30 分鐘失效，若工具回傳認證錯誤請告知使用者重新登入。
2. **請假不可逆**：送出後若要撤回需呼叫 `delete_leave`，且只有「待審」狀態才能刪。
3. **本地檔案**：你沒有讀取本地檔案系統的能力，無法執行 cat、ls 等指令；若使用者要求，請直接說明並改以工具重新查詢。
