# tpcu-llm

（TPCU）學生資訊系統的 AI 助理。
支援課表、缺曠、成績查詢、請假管理，以及對話歷史管理。
後端 FastAPI + Python，前端 Next.js。

## 快速啟動

### 後端

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
python3 scripts/serve.py        # http://localhost:8000
```

`.env`（專案根目錄）：
```
LLM_API_KEY=...
LLM_BASE_URL=...      # 選填，預設 OpenAI
LLM_MODEL=...         # 選填，預設 gpt-4o-mini
LOG_LEVEL=WARNING     # 選填
API_HOST=0.0.0.0      # 選填
API_PORT=8000         # 選填
```

### 前端

```bash
cd frontend
npm install
cp .env.local.example .env.local   # 設定 NEXT_PUBLIC_API_URL
npm run dev                         # http://localhost:3000
```

## 功能

| 功能 | 說明 |
|------|------|
| AI 對話 | SSE 串流、工具呼叫、ask_user 確認、訊息編輯 |
| 課表查詢 | 依學期查詢，可產生圖表 |
| 缺曠查詢 | 依學期 + 日期範圍（自動取得正確民國年份） |
| 成績查詢 | 歷年所有學期，可產生圖表 |
| 假單管理 | 查詢 / 申請（支援圖片附件）/ 刪除 |
| 圖表產生 | 課表、缺曠、成績視覺化 PNG |
| 自訂 LLM | 設定自己的 base_url / api_key / model |
| 會話管理 | 歷史對話列表、切換、接續、新建、刪除 |
| 對話記錄 | 結構化 JSON log（含 confidence score，自動 rotation） |

## REST API

啟動後可用以下 endpoint：

### 認證

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/login` | 登入，回傳 token |

### AI 對話

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/chat` | 送出訊息（SSE 串流） |
| `POST` | `/answer` | 回答 ask_user 提示 |

### 資料查詢

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/semester-options` | 可用學期清單 |
| `GET` | `/api/schedule` | 課表 |
| `GET` | `/api/absence/options` | 缺曠查詢選項 |
| `GET` | `/api/absence` | 缺曠記錄 |
| `GET` | `/api/grades` | 成績 |
| `GET` | `/api/leaves` | 假單列表 |
| `POST` | `/api/apply-leave` | 申請假單（multipart） |
| `POST` | `/api/delete-leave` | 刪除假單 |
| `GET` | `/api/image/{type}` | 產出圖表（schedule/absence/grades） |

### 對話歷史

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/history` | 目前 session 訊息 |
| `POST` | `/api/history` | 儲存目前 session 訊息 |
| `DELETE` | `/api/history` | 清除目前 session 訊息 |

### 會話管理

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/sessions` | 列出所有歷史會話（含 current_session_id） |
| `POST` | `/api/sessions/new` | 開新會話（重置記憶） |
| `POST` | `/api/sessions/{id}/switch` | 切換至歷史會話（還原 ChatMemory） |
| `DELETE` | `/api/sessions/{id}` | 刪除會話 |

### 設定

| Method | Path | 說明 |
|--------|------|------|
| `GET/PUT/DELETE` | `/api/settings/llm` | 自訂 LLM 設定 |
| `POST` | `/api/settings/llm/test` | 測試 LLM 連線 |
| `POST` | `/api/settings/llm/models` | 列出可用模型 |
| `POST` | `/api/upload` | 上傳附件（10MB 上限） |

**Rate limit**：`/login` 10次/分、`/chat` `/answer` 5次/分（per IP）

**SSE 事件格式：**
```
data: {"type": "text_delta", "text": "..."}
data: {"type": "tool_call", "name": "...", "args": {...}}
data: {"type": "tool_result", "name": "...", "ok": true, "data": "..."}
data: {"type": "ask_user", "question": "...", "options": [...], "tool_call_id": "..."}
data: {"type": "done"}
```

Session 過期時 `tool_result.data` 包含 `"error_code": "NET_002"`，client 應重新呼叫 `/login`。

## 專案結構

```
tpcu-llm/
├── scripts/
│   ├── serve.py                    # 啟動 API 伺服器（uvicorn）
│   ├── chatbot.py                  # CLI chatbot
│   ├── fetch_schedule.py           # CLI：課表
│   ├── fetch_absence.py            # CLI：缺曠
│   ├── fetch_grades.py             # CLI：成績
│   ├── apply_leave.py              # CLI：請假
│   └── manage_leaves.py            # CLI：假單管理
├── src/
│   ├── client.py                   # HTTP 層（login / post_data / get_page）
│   ├── session.py                  # Session 快取
│   ├── log.py                      # Logging 設定
│   ├── agent/
│   │   ├── agent.py                # ChatAgent（I/O-free，AsyncIterator 事件架構）
│   │   ├── memory.py               # ChatMemory（history / cache / prefs）
│   │   ├── tools.py                # 工具定義 + dispatch()（含 get_current_date）
│   │   ├── conv_logger.py          # 對話記錄（JSON，confidence score，append-only）
│   │   ├── reflection.py           # 工具結果後處理
│   │   ├── tool_meta.py            # ToolMeta（danger_level / preconditions）
│   │   └── errors.py               # ErrorCode
│   ├── api/
│   │   ├── app.py                  # FastAPI app（/login /chat /answer /health）
│   │   ├── routes.py               # 資料 + 會話 + 設定 endpoints
│   │   ├── state.py                # AgentRegistry（per-user agent，2h 閒置驅逐）
│   │   └── models.py               # Pydantic models
│   ├── storage/
│   │   ├── history.py              # chat_history（目前 session 快取）
│   │   ├── sessions.py             # chat_sessions + chat_session_turns（歷史對話）
│   │   └── user_settings.py        # user_llm_config（自訂 LLM）
│   ├── actions/                    # 各功能 action（fetch_schedule / absence / grades / leaves / apply_leave / delete_leave）
│   ├── parsers/                    # HTML 解析
│   └── utils/                      # 渲染工具（Pillow）
├── frontend/                       # Next.js 前端
│   ├── app/(app)/
│   │   ├── chat/                   # AI 對話頁
│   │   ├── schedule/               # 課表頁
│   │   ├── grades/                 # 成績頁
│   │   ├── absence/                # 缺曠頁
│   │   ├── leaves/                 # 假單頁
│   │   └── settings/               # LLM 設定頁
│   ├── components/
│   │   ├── NavLayout.tsx           # 導覽列
│   │   └── SessionHistoryPanel.tsx # 會話管理 drawer
│   └── lib/
│       ├── data.ts                 # API client 函式
│       └── api-client.ts           # axios 實例
├── data/
│   └── history.db                  # SQLite（chat_history / chat_sessions / chat_session_turns / user_llm_config）
├── logs/api/{uid}/                 # 結構化對話記錄（JSON，per session）
├── output/                         # 產出圖表（gitignore）
├── docs/
│   ├── AI_GUIDE.md                 # 嵌入 SYSTEM_PROMPT 的操作指引
│   └── CONTRIBUTING.md             # 開發規範
└── requirements.txt
```

## 資料庫結構

```sql
-- 目前 session 訊息（前端跨 refresh 保持對話連續性）
chat_history(uid PK, messages_json, updated_at)

-- 歷史會話 metadata
chat_sessions(session_id PK, uid, started_at, ended_at, turn_count, title, updated_at)

-- 歷史會話內容（append-only，每輪一筆）
chat_session_turns(session_id, turn_id, user, assistant)

-- 自訂 LLM 設定
user_llm_config(uid PK, base_url, api_key, model, updated_at)
```

## 架構原則

模組依賴方向（單向）：`api → agent/actions → parsers/client`

- `client.py`：只管 HTTP，零業務邏輯
- `parsers/`：只管 HTML 解析
- `agent/`：無 I/O，所有輸出以 `AgentEvent` 串流
- `api/`：薄殼，HTTP ↔ AgentEvent 轉換

**安全機制：**
- Token：`secrets.token_urlsafe(32)`，與 uid 完全分離
- 危險工具（`danger_level >= 1`）必須先 `ask_user` 確認
- Session 過期回傳 `NET_002`，不在伺服器端儲存密碼
