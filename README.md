# Agora AI（TPCU 學生 AI 助理）

TPCU 學生資訊系統的 AI 助理，支援課表、缺曠、成績查詢、假單管理及 AI 對話。

- **後端**：FastAPI + Python 3.11+
- **前端**：Next.js 16 + React 19

---

## 快速啟動

### 方法一：一鍵腳本（推薦）

```bash
./start.sh
```

腳本會自動建立 venv、安裝套件、啟動後端與前端。  
瀏覽器開啟 http://localhost:3000 即可使用。

### 方法二：手動啟動

#### 環境設定（第一次）

**後端 `.env`**（放在專案根目錄）：

```env
LLM_API_KEY=你的API金鑰
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/   # Gemini 範例
LLM_MODEL=gemini-2.0-flash-lite                                          # 任意 OpenAI-compatible model
LOG_LEVEL=WARNING     # 選填，預設 WARNING
API_HOST=0.0.0.0      # 選填，預設 0.0.0.0
API_PORT=8000         # 選填，預設 8000
```

**前端 `frontend/.env.local`**：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 啟動後端

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
python3 main.py        # → http://localhost:8000
```

#### 啟動前端（另開終端機）

```bash
cd frontend
npm install
npm run dev            # → http://localhost:3000
```

---

## 環境需求

| 工具 | 版本 |
|------|------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |

---

## LLM 設定

本專案使用 **OpenAI 相容 API**，支援 Gemini、OpenAI、本地 Ollama 等。

| 情境 | LLM_BASE_URL | LLM_MODEL |
|------|-------------|-----------|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.0-flash-lite` |
| OpenAI | （不填，預設） | `gpt-4o-mini` |
| Ollama（本地） | `http://localhost:11434/v1/` | `llama3` |

也可在登入後於前端 **Settings** 頁面即時切換 LLM，無需重啟後端。

---

## 功能一覽

| 功能 | 說明 |
|------|------|
| AI 對話 | SSE 串流、工具呼叫、ask_user 確認、訊息編輯 |
| 課表查詢 | 依學期查詢，可產生圖表 |
| 缺曠查詢 | 依學期 + 日期範圍 |
| 成績查詢 | 歷年所有學期，可產生圖表 |
| 假單管理 | 查詢 / 申請（支援圖片附件）/ 刪除 |
| 會話管理 | 歷史對話列表、切換、接續、新建、刪除 |
| 自訂 LLM | 設定自己的 base_url / api_key / model |

---

## 專案結構

```
Agora-AI/
├── main.py                     # 後端入口（uvicorn 啟動）
├── requirements.txt
├── pyproject.toml
├── start.sh                    # 一鍵啟動腳本
├── .env                        # 後端環境變數（自行建立，不進 git）
├── src/
│   ├── client.py               # HTTP 層
│   ├── session.py              # Session 快取
│   ├── log.py                  # 結構化 JSON logging
│   ├── agent/
│   │   ├── agent.py            # ChatAgent（AsyncIterator 事件架構）
│   │   ├── memory.py           # ChatMemory
│   │   ├── tools.py            # 工具定義 + dispatch()
│   │   └── conv_logger.py      # 對話記錄（JSON，confidence score）
│   ├── api/
│   │   ├── app.py              # FastAPI app
│   │   ├── routes.py           # 資料 / 會話 / 設定 endpoints
│   │   └── state.py            # AgentRegistry（per-user，2h 閒置驅逐）
│   ├── actions/                # 各功能 action（課表 / 缺曠 / 成績 / 假單）
│   └── parsers/                # HTML 解析
├── frontend/                   # Next.js 前端
│   ├── .env.local              # 前端環境變數（自行建立，不進 git）
│   └── app/
│       ├── (app)/chat/         # AI 對話頁
│       ├── (app)/schedule/     # 課表頁
│       ├── (app)/grades/       # 成績頁
│       ├── (app)/absence/      # 缺曠頁
│       ├── (app)/leaves/       # 假單頁
│       └── (app)/settings/     # LLM 設定頁
├── data/
│   └── history.db              # SQLite（對話 / 會話 / 設定）
└── logs/api/{uid}/             # 結構化對話記錄（JSON）
```

---

## REST API 快覽

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/login` | 登入，回傳 token |
| `POST` | `/chat` | AI 對話（SSE 串流） |
| `GET` | `/api/schedule` | 課表 |
| `GET` | `/api/absence` | 缺曠記錄 |
| `GET` | `/api/grades` | 成績 |
| `GET` | `/api/leaves` | 假單列表 |
| `POST` | `/api/apply-leave` | 申請假單 |
| `GET/PUT/DELETE` | `/api/settings/llm` | 自訂 LLM 設定 |
| `GET` | `/api/sessions` | 歷史會話列表 |

Rate limit：`/login` 10次/分、`/chat` `/answer` 20次/分（per IP）

---

## 常見問題

**Q：登入後馬上顯示 session 過期？**  
A：學校 TPCU 系統的 session 有效期較短，重新整理頁面再登入即可。

**Q：後端啟動後前端顯示 CORS 錯誤？**  
A：確認 `.env` 中 `CORS_ALLOW_ORIGINS` 包含前端網址（dev 預設已允許 `http://localhost:3000`）。

**Q：想換 LLM 不想改 .env？**  
A：登入後至前端 Settings 頁面即時設定，優先於 `.env`。
