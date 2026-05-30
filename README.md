# tpcu-llm

（TPCU）學生資訊系統的 Python 爬蟲與 AI 助理工具集。
支援課表、缺曠、成績查詢、請假管理，並提供 CLI 與 REST API 兩種使用方式。

## 環境設定

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .          # editable install（讓 src/ 進 Python path）
```

`.env` 放在專案根目錄：
```
TPCU_UID=你的學號
TPCU_PWD=你的密碼
LLM_API_KEY=...          # chatbot / API server 用
LLM_BASE_URL=...         # 選填，預設 Google Gemini OpenAI-compatible endpoint
LLM_MODEL=...            # 選填，預設 gpt-4o-mini
LOG_LEVEL=DEBUG          # 選填，預設 WARNING；設 DEBUG 可看 action 細節
API_HOST=0.0.0.0         # 選填，預設 0.0.0.0
API_PORT=8000            # 選填，預設 8000
```

## 執行

```bash
python3 main.py                     # 主選單，整合所有功能

# 個別腳本
python3 scripts/fetch_schedule.py   # 登入 → 選學期 → 查課表 → 輸出圖片
python3 scripts/fetch_absence.py    # 登入 → 選學期 → 選日期範圍 → 查缺曠 → 輸出圖片
python3 scripts/fetch_grades.py     # 登入 → 查歷年成績 → 選學期 → 輸出圖片
python3 scripts/apply_leave.py      # 登入 → 互動式請假申請
python3 scripts/manage_leaves.py    # 登入 → 查假單 → 選擇性刪除
python3 scripts/chatbot.py          # AI 聊天機器人（CLI）
python3 scripts/serve.py            # 啟動 REST API 伺服器（port 8000）
```

圖片輸出至 `output/` 目錄（2× 像素密度）。

## REST API

啟動後可用以下 endpoint：

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/health` | 服務狀態 |
| `POST` | `/login` | 登入，回傳不可預測 token（`secrets.token_urlsafe`） |
| `POST` | `/chat` | 送出訊息，SSE 串流回傳 AgentEvent |
| `POST` | `/answer` | 回答 ask_user 提示，繼續串流 |

**Rate limit**：`/login` 10次/分、`/chat` `/answer` 5次/分（per IP）

**SSE 事件格式（JSON line）：**
```
data: {"type": "text_delta", "text": "..."}
data: {"type": "tool_call", "name": "...", "args": {...}}
data: {"type": "tool_result", "name": "...", "ok": true, "data": "..."}
data: {"type": "ask_user", "question": "...", "options": [...], "tool_call_id": "..."}
data: {"type": "done"}
```

Session 過期時，`tool_result` 的 `data` 會包含 `"error_code": "NET_002"`，client 應重新呼叫 `/login`。

## 專案結構

```
tpcu-llm/
├── main.py                         # 主選單（CLI 整合入口）
├── scripts/
│   ├── fetch_schedule.py           # 課表查詢流程
│   ├── fetch_absence.py            # 缺曠查詢流程
│   ├── fetch_grades.py             # 成績查詢流程
│   ├── apply_leave.py              # 請假申請流程
│   ├── manage_leaves.py            # 假單管理（查詢 + 刪除）
│   ├── chatbot.py                  # AI 聊天機器人（CLI）
│   └── serve.py                    # REST API 伺服器入口（uvicorn）
├── src/
│   ├── client.py                   # 通用 HTTP 層（login / activate_feature / post_data / get_page / post_multipart）
│   ├── session.py                  # Session 快取（CLI: .cache/session.json，API: .cache/sessions/{uid}.json）
│   ├── log.py                      # Logging 設定（get_logger / setup_logging）
│   ├── agent/
│   │   ├── agent.py                # ChatAgent + AgentEvent 型別（I/O-free，事件驅動）
│   │   ├── memory.py               # ChatMemory（history + cache + prefs）
│   │   ├── tools.py                # TOOLS 定義 + dispatch() + AskUserError
│   │   ├── tool_meta.py            # ToolMeta（danger_level / preconditions）
│   │   ├── errors.py               # ErrorCode StrEnum（NET/BIZ/TOOL 分類）
│   │   ├── reflection.py           # reflect()（工具結果後處理）
│   │   └── conv_logger.py          # 對話記錄（JSON，含 confidence score，自動 rotation）
│   ├── api/
│   │   ├── app.py                  # FastAPI routes（/login /chat /answer /health）
│   │   ├── state.py                # AgentRegistry（per-user agent + lock，2h 閒置驅逐）
│   │   └── models.py               # Pydantic request/response models
│   ├── actions/
│   │   ├── auth/index.py           # action：登入
│   │   ├── fetch_schedule/index.py # action：取得學期清單 + 查詢課表
│   │   ├── fetch_absence/index.py  # action：取得選項 + 查詢缺曠
│   │   ├── fetch_grades/index.py   # action：查詢歷年成績
│   │   ├── fetch_leaves/index.py   # action：查詢假單列表
│   │   ├── apply_leave/index.py    # action：取得請假表單 + 送出申請
│   │   └── delete_leave/index.py   # action：刪除假單
│   ├── parsers/                    # HTML 解析套件（各功能獨立子模組）
│   └── utils/                      # 渲染工具（Pillow，課表 / 缺曠 / 成績）
├── docs/
│   ├── AI_GUIDE.md                 # AI chatbot 操作指引（嵌入 SYSTEM_PROMPT）
│   ├── rag_design.md               # RAG 架構設計草稿（未實作）
│   └── CONTRIBUTING.md             # 開發規範（架構、命名、Code Style）
├── output/                         # 產出檔案（gitignore）
├── logs/                           # 對話記錄（gitignore）
│   ├── conversations/              # CLI chatbot 記錄
│   └── api/                        # API 記錄（per user）
├── pyproject.toml
└── requirements.txt
```

## 架構模式

模組依賴方向（單向，不得逆向）：`scripts/api → agent/actions → parsers / client`

- `client.py`：只管 HTTP，零業務邏輯
- `parsers/`：只管 HTML 解析，不 import actions 或 client
- `agent/`：無 I/O，所有輸出以 `AgentEvent` 型別串流給呼叫端
- `api/`：薄殼，只做 HTTP ↔ AgentEvent 的轉換

**安全機制：**
- Token：`secrets.token_urlsafe(32)`，不可預測，與 uid 完全分離
- 危險工具（`danger_level >= 1`）必須先 `ask_user` 確認，否則拒絕執行
- Session 過期時 API 回傳 `NET_002`，不在伺服器端儲存密碼

## 已完成

- [x] 登入取得 JSESSIONID（session 快取 + 自動驗證）
- [x] 課表查詢 + 渲染成 PNG
- [x] 缺曠查詢 + 渲染成 PNG
- [x] 成績查詢 + 渲染成 PNG
- [x] 請假申請（互動式 + 公假附件上傳）
- [x] 假單查詢 + 刪除
- [x] AI chatbot（CLI，支援 OpenAI-compatible API）
- [x] ChatAgent 重構（I/O-free，AsyncIterator 事件架構）
- [x] 工具安全層（danger_level、ErrorCode、ask_user 強制確認）
- [x] 對話記錄（JSON，confidence score，log rotation）
- [x] REST API（FastAPI，SSE 串流，rate limiting，多用戶隔離）
- [x] 主選單整合（main.py）

## 待辦 / 下一步

- [ ] scripts/* 功能遷移為 API endpoints（/schedule、/absence、/grades 等）
- [ ] HTTPS / 反向代理設定（Nginx / Caddy）
- [ ] RAG 整合（見 docs/rag_design.md）
