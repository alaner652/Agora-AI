# Agora AI（TPCU 學生 AI 助理）

TPCU 學生資訊系統的 AI 助理，支援課表、缺曠、成績查詢、假單管理及 AI 對話。

- **後端**：FastAPI + Python 3.11+
- **前端**：Next.js 16 + React 19

---

## 快速啟動

### 方法一：Docker（推薦部署）

```bash
# 1. 設定後端機密
cp backend/.env.example backend/.env
#    編輯 backend/.env，至少填入 LLM_API_KEY 與 SETTINGS_ENCRYPT_KEY

# 2. 建置並啟動（backend:8000 + frontend:3000）
docker compose up --build -d
```

瀏覽器開啟 http://localhost:3000 即可使用。詳見下方 [Docker 部署](#docker-部署)。

### 方法二：手動啟動（本機開發）

#### 環境設定（第一次）

**`backend/.env`**（可 `cp backend/.env.example backend/.env` 後編輯）：

```env
LLM_API_KEY=你的API金鑰
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/   # Gemini 範例
LLM_MODEL=gemini-2.0-flash-lite                                          # 任意 OpenAI-compatible model
SETTINGS_ENCRYPT_KEY=                  # 加密使用者設定的金鑰，必須設定且長期固定
```

> 產生金鑰：`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`

**`frontend/.env.local`**：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 啟動後端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py        # → http://localhost:8000（需在 backend/ 目錄下執行）
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
├── docker-compose.yml          # 單機部署：backend + frontend
├── backend/                    # 後端（FastAPI）
│   ├── Dockerfile
│   ├── .env.example            # 環境變數樣板（複製成 .env）
│   ├── main.py                 # 入口（uvicorn 啟動）
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── src/
│   │   ├── client.py           # HTTP 層
│   │   ├── session.py          # Session 快取
│   │   ├── log.py              # 結構化 JSON logging
│   │   ├── agent/              # ChatAgent / memory / tools / conv_logger
│   │   ├── api/                # app.py / routes.py / state.py
│   │   ├── actions/            # 各功能 action（課表 / 缺曠 / 成績 / 假單）
│   │   └── parsers/            # HTML 解析
│   ├── data/history.db         # SQLite（runtime，volume，不進 git）
│   ├── logs/                   # 結構化記錄（runtime，volume）
│   ├── .cache/                 # session 暫存（含 JSESSIONID，runtime）
│   └── uploads/                # 使用者上傳（runtime，volume）
└── frontend/                   # 前端（Next.js）
    ├── Dockerfile
    ├── .env.example
    ├── .env.local              # 本機環境變數（自行建立，不進 git）
    └── app/(app)/{chat,schedule,grades,absence,leaves,settings}/
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

## Docker 部署

單機用 `docker compose` 同時起後端（8000）與前端（3000）。

```bash
cp backend/.env.example backend/.env     # 填入 LLM_API_KEY、SETTINGS_ENCRYPT_KEY
docker compose up --build -d             # 建置 + 背景啟動
docker compose ps                        # 確認兩服務 healthy
docker compose logs -f                   # 看 log
docker compose down                      # 停止
```

**前後端如何連線**
- 瀏覽器（client）→ `NEXT_PUBLIC_API_URL`（build-time 烘進前端 bundle）。
- server component（`serverFetch`）→ `API_INTERNAL_URL`（runtime，compose 設為容器內網 `http://backend:8000`）。

**持久化**：`backend/` 下的 `data/`、`logs/`、`.cache/`、`uploads/` 以 volume 掛載，重啟容器資料不遺失。

**部署到實機要改的兩個地方**（前端 URL 烘在 bundle，變更需重新 build）：
1. `docker-compose.yml` → `frontend.build.args.NEXT_PUBLIC_API_URL` 改成 `http://<你的IP>:8000`
2. `docker-compose.yml` → `backend.environment.CORS_ALLOW_ORIGINS` 改成 `http://<你的IP>:3000`

> HTTPS / 網域：之後可加一個 Caddy 反向代理服務反代 80/443、自動申請憑證，屆時前端改走同源相對路徑、後端可移除 CORS 設定。

---

## 常見問題

**Q：登入後馬上顯示 session 過期？**  
A：學校 TPCU 系統的 session 有效期較短，重新整理頁面再登入即可。

**Q：後端啟動後前端顯示 CORS 錯誤？**  
A：確認 `backend/.env`（或 compose 的 `CORS_ALLOW_ORIGINS`）包含前端網址（dev 預設已允許 `http://localhost:3000`）。

**Q：想換 LLM 不想改 .env？**  
A：登入後至前端 Settings 頁面即時設定，優先於 `.env`。
