# AI 助理指南

`ChatAgent`（[src/agent/agent.py](../backend/src/agent/agent.py)）如何把使用者自然語言對應到工具、解讀結果、用中文回答。工具定義在 [src/agent/tools.py](../backend/src/agent/tools.py)，由 `dispatch()` 派到 `src/actions/`。

```
使用者說話 → ChatAgent 判斷意圖 → 呼叫 tool → action 取資料 → 中文回答（SSE 串流）
```

工具直接即時呼叫學校系統取資料，**無本地快取檔可讀**。

---

## 工具清單

danger：0=唯讀、1=需先 `ask_user` 確認、2=不可逆（見 [tool_meta.py](../backend/src/agent/tool_meta.py)）。

| 工具 | danger | 前置 | 用途 |
|------|:--:|------|------|
| `get_current_date` | 0 | — | 取今天（民國 / 西元），請假前先確認當日 |
| `get_semester_options` | 0 | — | 可查詢的學期清單 |
| `fetch_schedule` | 0 | — | 查課表（需學期代碼） |
| `fetch_absence` | 0 | — | 查缺曠（需學期 + 日期範圍） |
| `fetch_grades` | 0 | — | 查歷年成績 |
| `get_leaves` | 0 | — | 查假單 |
| `get_leave_form` | 0 | — | 取指定日期的請假表單選項 |
| `apply_leave` | 1 | `get_leave_form` | 送出請假（**送出前必 `ask_user` 確認節次與假別**） |
| `delete_leave` | 2 | `get_leaves` | 刪除待審假單（不可逆） |
| `ask_user` | — | — | 向使用者確認 / 補問（不需 session） |

---

## 常見意圖對應

| 使用者說 | 對應動作 |
|---------|---------|
| 「查課表」「這學期有什麼課」 | `fetch_schedule` |
| 「有幾次缺曠」「近 30 天出席」 | `fetch_absence` |
| 「成績怎樣」「有沒有不及格」 | `fetch_grades` |
| 「哪天課最多」「哪學期最慘」 | 先 `fetch_*` 取最新資料再分析 / 跨學期比較 |
| 「幫我請假」「請 X 節 XX 假」 | `get_current_date` + `fetch_schedule` 確認當日課表 → `get_leave_form` → `ask_user` 確認 → `apply_leave` |
| 「看假單」「在審核嗎」 | `get_leaves` |
| 「撤回假單」 | `get_leaves` 找到該筆 → 確認後 `delete_leave`（限「待審」） |

---

## 領域參考

### 日期格式

| 用途 | 格式 | 範例 |
|------|------|------|
| 工具參數 | 民國 compact `YYYMMDD` | `1150521` = 2026/05/21 |
| 顯示給使用者 | 民國 `YYY/MM/DD` | `115/05/21` |
| 西元換算 | 民國年 + 1911 | 115 + 1911 = 2026 |

### 節次順序

```
朝會 → 早自習 → 1 → 2 → … → 9 → K → A → B → C → D → E
```

`lea_value`（請假用）：`{YYYMMDD}%{朝會}%{早自習}%{1}%…%{E}%`，每節填假別 id 或 `0`（不請假）。

### 假別代碼

| id | 名稱 | 備註 |
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

## 注意事項

1. **Session 短命**：JSESSIONID 約 30 分鐘失效，工具回認證錯誤（`AUTH_*`）就請使用者重新登入。
2. **請假不可逆**：送出後要撤回需 `delete_leave`，且只有「待審」能刪。
3. **交叉驗證課表**：`get_leave_form` 的節次來自表單頁，可能因系統延遲為空；若 `scheduled` 為空，**必須 `fetch_schedule` 交叉確認**，不可直接說今天沒課。
4. **危險操作先確認**：danger ≥ 1 的工具一律先 `ask_user`，描述清楚日期 / 節次 / 假別再執行。
