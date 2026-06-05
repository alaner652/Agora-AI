# Agora AI（TPCU 學生 AI 助理）

TPCU 學生資訊系統的 AI 助理：課表、缺曠、成績查詢、假單管理，以及會操作這些功能的 AI 對話。

- **後端**：FastAPI · Python 3.11+
- **前端**：Next.js 16 · React 19
- **部署**：Docker Compose · Caddy 反向代理（同源）

---

## 架構總覽

對外只有 Caddy 的 `:80`，依路徑把流量分流到前端或後端（同源）。前端因此走相對路徑、
不需把後端 URL 烘進 bundle；後端也不需要 CORS。

```
                       ┌──────────────────────── Caddy :80 ────────────────────────┐
  瀏覽器  ───────────► │  /api/*  /login  /health  /chat  /answer  ─►  backend:8000 │
                       │  其餘（頁面 / 靜態資源）                   ─►  frontend:3000 │
                       └────────────────────────────────────────────────────────────┘
                                         frontend（server component）─► backend:8000（內網）
```

兩種 API URL 各司其職：

| 變數 | 誰用 | 時機 | 同源部署值 |
|------|------|------|-----------|
| `NEXT_PUBLIC_API_URL` | 瀏覽器（client） | **build-time** 烘入 | 留空（走相對路徑） |
| `API_INTERNAL_URL` | server component | **runtime** | `http://backend:8000` |

---

## 快速開始

### 方法一：Docker（推薦）

```bash
# 1) 設定後端機密
cp backend/.env.example backend/.env
#    至少填入 LLM_API_KEY 與 SETTINGS_ENCRYPT_KEY
#    產生金鑰：python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# 2) 建置並啟動（Caddy 統一入口 :80）
docker compose up --build -d
```

瀏覽器開 **http://localhost**（注意是 `:80`，不是 `:3000`）。

### 方法二：本機開發（不經 Docker）

需要兩個環境檔：

`backend/.env`
```env
LLM_API_KEY=你的API金鑰
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_MODEL=gemini-3.1-flash-lite
SETTINGS_ENCRYPT_KEY=          # 必填、長期固定（見下方環境變數）
```

`frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:8000   # 本機直連後端
```

啟動後端（**需在 `backend/` 目錄下執行**）：
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py                # → http://localhost:8000
```

啟動前端（另開終端機）：
```bash
cd frontend
npm install
npm run dev                    # → http://localhost:3000
```

| 工具 | 版本 |
|------|------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |

---

## 環境變數

### 後端 `backend/.env`（runtime 注入，不烘進 image）

| 變數 | 必填 | 說明 |
|------|:--:|------|
| `LLM_API_KEY` | ✓ | 預設 LLM 金鑰 |
| `LLM_BASE_URL` | ✓ | OpenAI 相容 endpoint |
| `LLM_MODEL` | ✓ | 預設模型 |
| `SETTINGS_ENCRYPT_KEY` | ✓ | 加密使用者設定（含其自訂 API key）的金鑰。**必須設定且長期固定**——更換會使既有加密設定無法解開 |
| `CORS_ALLOW_ORIGINS` | | 同源（Caddy）部署**不需要**；僅前端直連跨來源時才設，逗號分隔 |
| `SCHOOL_BASE_URL` | | 可選，預設 `https://siw.tpcu.edu.tw` |
| `API_HOST` / `API_PORT` | | 可選，預設 `0.0.0.0` / `8000` |

### 前端

| 變數 | 時機 | 說明 |
|------|------|------|
| `NEXT_PUBLIC_API_URL` | build-time | 瀏覽器端後端 URL。同源部署留空；本機開發設 `http://localhost:8000` |
| `API_INTERNAL_URL` | runtime | server component 用的內網 URL；compose 設 `http://backend:8000` |

---

## LLM 設定

使用 **OpenAI 相容 API**，支援 Gemini、OpenAI、本地 Ollama 等。

| 情境 | `LLM_BASE_URL` | `LLM_MODEL` |
|------|---------------|-------------|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.1-flash-lite` |
| OpenAI | （不填，預設） | `gpt-4o-mini` |
| Ollama（本地） | `http://localhost:11434/v1/` | `llama3` |

也可在登入後於前端 **Settings** 頁面即時切換 LLM，優先於 `.env`，無需重啟後端。

---

## 部署

### Docker Compose（同源）

```bash
docker compose up --build -d     # 建置 + 背景啟動
docker compose ps                # 確認服務 healthy
docker compose logs -f           # 看 log
docker compose down              # 停止（資料留在 backend/ volume）
```

- **路由**（[Caddyfile](Caddyfile)）：`/api/*`、`/login`、`/health`、`/chat`、`/answer` → `backend:8000`（`/chat`、`/answer` 設 `flush_interval -1`，SSE 即時不緩衝）；其餘 → `frontend:3000`。
- **持久化**：`backend/` 下的 `data/`、`logs/`、`.cache/`、`uploads/` 以 volume 掛載，重啟資料不遺失。
- **換 host / 網域免重 build**：前端同源、無烘入 URL，image 完全通用。

### 不帶原始碼部署（registry）

「build 一次、部署機只要 image + 設定檔」：

```bash
# 1) build 機（有原始碼）：建置並推到 registry
export REGISTRY=ghcr.io/<你的帳號> TAG=latest
docker compose build
docker compose push

# 2) 部署機（只要 docker-compose.deploy.yml + Caddyfile + backend/.env）
export REGISTRY=ghcr.io/<你的帳號> TAG=latest
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d
```

部署機**不需原始碼**：機密走 `backend/.env`（runtime 注入、不在 image 內），前端 image 因同源而通用。

### 上 HTTPS / 換網域

只改 [Caddyfile](Caddyfile)：把 `:80` 改成你的網域、移除 `auto_https off`，並在 compose 開 `443:443`，
Caddy 會自動申請並續期 Let's Encrypt 憑證——程式碼一行都不用動。

---

## 測試

```bash
# 前置：Docker Desktop 要開著；先停掉本機 dev 的 :8000 / :3000，
#       避免兩個後端同時寫 backend/data 的同一個 SQLite
docker version                   # 看得到 Server 版本才行
docker compose up --build -d
```

驗證清單（入口是 **http://localhost**）：

| 測什麼 | 怎麼測 | 預期 |
|------|------|------|
| 後端經 Caddy | `curl http://localhost/health` | `{"status":"ok",...}` |
| 前端載入 | 瀏覽器開 `http://localhost` | 登入頁 |
| client 相對路徑 | 登入（學號 / 密碼） | 進入課表 |
| server component 內網 | 開課表 / 成績頁 | 資料載入 |
| **SSE 不被緩衝** | Chat 送一句話 | 回覆**逐字串流**冒出，非一次跳完 |
| /chat 路由 | `curl -i -X POST http://localhost/chat` | 401（有打到後端＝路由對） |

持久化：`docker compose down` 再 `up -d`，重新登入後歷史對話 / 設定還在 = volume OK。

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
├── docker-compose.yml          # 單機部署（本機 build）
├── docker-compose.deploy.yml   # 不帶原始碼部署（拉 registry image）
├── Caddyfile                   # 反向代理路由
├── backend/                    # 後端（FastAPI）
│   ├── Dockerfile
│   ├── .env.example            # 環境變數樣板
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
│   ├── data/ logs/ .cache/ uploads/   # runtime 產物（volume，不進 git）
└── frontend/                   # 前端（Next.js）
    ├── Dockerfile
    ├── .env.example
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

Rate limit：`/login` 10 次/分、`/chat` `/answer` 20 次/分（per IP）。

---

## 常見問題

**Q：登入後馬上顯示 session 過期？**
A：TPCU 系統的 session 有效期較短，重新整理頁面再登入即可。

**Q：前端顯示 CORS 錯誤？**
A：同源（Caddy）部署不會有 CORS。若你是「前端直連後端」的跨來源模式，確認 `backend/.env` 的 `CORS_ALLOW_ORIGINS` 含前端網址（dev 預設已允許 `http://localhost:3000`）。

**Q：想換 LLM 不想改 `.env`？**
A：登入後至前端 Settings 頁面即時設定，優先於 `.env`。

**Q：`docker compose up --build` 報錯？**
A：先確認 Docker daemon 有開（`docker version` 看得到 Server）；build 階段的錯通常出在前端 `npm run build`，把錯誤訊息貼出來即可定位。
