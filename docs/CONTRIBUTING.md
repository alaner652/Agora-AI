# 開發規範

這份文件記錄 tpcu-llm 的架構原則、命名規範、Code Style，確保隨著功能增加仍維持一致性。

---

## 架構原則

### 模組依賴方向（嚴格單向）

```
scripts/  →  actions/  →  parsers/
                       →  client.py
```

- `client.py`：只管 HTTP，零業務邏輯，不 import actions 或 parsers
- `parsers/`：只管 HTML 解析，不 import actions 或 client
- `actions/`：呼叫 client + parsers，包含流程控制與資料轉換
- `scripts/`：組合多個 actions，處理使用者互動（input/print）

**違反依賴方向的 import 不允許**，例如 `parsers/` 不能 import `client`。

### 新增 Action 的步驟

1. 建立 `src/actions/<feature>/` 目錄
2. `index.py` — 函式必須有 return type annotation
3. `docs.md` — 記錄端點 URL、request/response 格式（參考 `fetch_schedule/docs.md`）
4. 若有新 HTML 格式需要解析，在 `src/parsers/` 加對應子模組（或加進 `leaves.py` 等合適的現有檔案）
5. 若 chatbot 需要使用，在 `scripts/chatbot.py` 的 `TOOLS` 加工具定義，並在 `_dispatch` 加對應 branch

### 新增 Parser 的步驟

1. 若屬於現有功能域（請假 / 缺曠 / 成績 / 課表），加進對應的 `parsers/<name>.py`
2. 若是全新功能，建立 `src/parsers/<name>.py`，並在 `parsers/__init__.py` re-export
3. 通用輔助函式放 `parsers/_utils.py`，不在各子模組重複定義

---

## 回傳型別規範

| 操作類型 | 回傳型別 | 說明 |
|---------|---------|------|
| 查詢類（fetch_*、get_*） | `list[dict]` | 資料列表 |
| 動作類（apply_*、delete_*） | `{"success": bool \| None, "message": str}` | `None` = 系統無明確回應，需使用者自行確認 |
| 選項類（get_options） | `{"<key>": list[dict]}` | 例如 `{"semesters": [...]}` |

所有 action 函式必須加 return type annotation：

```python
async def get_schedule(jsessionid: str, yms: str) -> list[dict]: ...
async def apply_leave(...) -> dict: ...
```

---

## Code Style

### 非同步

- 所有 HTTP 操作 `async/await`，使用 `httpx.AsyncClient`
- Scripts 入口點用 `asyncio.run(main())`
- `asyncio.run()` 前必須呼叫 `setup_logging()`

### 日期格式

| 用途 | 格式 | 範例 |
|------|------|------|
| Action 參數 / API | 民國 compact YYYMMDD | `1150521` |
| 顯示給使用者 | 民國 formatted YYY/MM/DD | `115/05/21` |
| 西元換算 | 民國年 + 1911 | 115 + 1911 = 2026 |

### 字串輸出

- `json.dumps` 一律加 `ensure_ascii=False`
- 輸出路徑一律用絕對路徑計算：

```python
_OUTPUT_DIR = pathlib.Path(__file__).parent.parent / "output"
path = str(_OUTPUT_DIR / "schedule.png")
```

### 安全規則

- JSESSIONID、密碼不得出現在 `print()`、log、commit
- Log 中若需提及 session，只顯示後四碼：`...{jsessionid[-4:]}`
- `session.py` 的 `.cache/session.json` 寫入後設 `chmod 600`

---

## Logging 規範

### 設定

每個 action module 頂部宣告 logger：

```python
from log import get_logger
_log = get_logger("actions.fetch_schedule")
```

Scripts 入口點啟用：

```python
from log import setup_logging
setup_logging()  # asyncio.run() 之前
```

`LOG_LEVEL` 環境變數控制（預設 `WARNING`，開發時設 `DEBUG`）。

### Log Level 分級

| Level | 用途 | 範例 |
|-------|------|------|
| `DEBUG` | HTTP 請求細節、中間狀態 | `DEBUG fetch_schedule: POST ag222.jsp yms=114,2` |
| `INFO` | Action 完成摘要 | `INFO fetch_schedule: get_schedule → 28 entries` |
| `WARNING` | 非致命異常（空結果、parse 失敗但有 fallback） | `WARNING parsers.schedule: table not found` |
| `ERROR` | 預期外的例外（但不影響程式繼續執行） | `ERROR apply_leave: classify got unknown message` |

---

## Chatbot 工具新增規範

在 `scripts/chatbot.py` 的 `TOOLS` list 新增工具時：

1. `description` 必須說明**何時應該呼叫**（前置條件）
2. 若工具有危險操作（apply_leave、delete_leave），description 必須說明需先向使用者確認
3. 參數說明中標注格式（例如「民國 YYYMMDD」）
4. 在 `_dispatch` 加對應 `elif name == "<tool_name>":` branch
5. 所有 error 回傳用 `_err(msg)` 輔助函式，不直接呼叫 `json.dumps`
