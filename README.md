# Agora AI（TPCU 學生 AI 助理）

TPCU 學生資訊系統的 AI 助理：課表、缺曠、成績、假單查詢與管理，並能用對話操作這些功能。

- **後端**：FastAPI · Python 3.11+
- **前端**：Next.js 16 · React 19
- **部署**：Docker Compose · Caddy 同源反向代理

---

## 架構

對外只有 Caddy 的 `:80`，依路徑分流（同源），所以前端走相對路徑、後端不需 CORS。

```
瀏覽器 ─► Caddy :80 ─┬─ /api/* /health · POST /login /chat /answer ─► backend:8000
                     └─ 其餘頁面 / 靜態資源                          ─► frontend:3000
```

`/login`、`/chat` 同時是前端頁面與後端端點，故 Caddy 以 **HTTP method** 區分。

| 層 | 元件 | 職責 |
|----|------|------|
| 入口 | Caddy `:80` | 同源反代，依 path + method 分流 |
| 前端 | Next.js | server component 走內網、client 走相對路徑（SSE） |
| API | FastAPI routes | 認證、依賴注入 session/uid、組裝回應 |
| Agent | ChatAgent | LLM 對話迴圈、工具呼叫、ask_user 確認 |
| 業務 | actions / client / parsers | 連 TPCU 校務系統、HTML 轉結構化資料 |
| 狀態 | session cache / SQLite | session 快取、會話 / 訊息 / 設定持久化 |

> 完整的分層職責、請求生命週期與設計決策速查見 [public/system-design.md](public/system-design.md)。

---

## 快速開始（Docker）

```bash
cp backend/.env.example backend/.env
# 填入 LLM_API_KEY 與 SETTINGS_ENCRYPT_KEY
# 產生金鑰：python3 -c "import secrets; print(secrets.token_urlsafe(32))"

docker compose up --build -d
```

開 **http://localhost**（是 `:80`，不是 `:3000`）。

<details>
<summary>本機開發（不經 Docker）</summary>

`backend/.env`：填 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`SETTINGS_ENCRYPT_KEY`
`frontend/.env.local`：`NEXT_PUBLIC_API_URL=http://localhost:8000`

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python3 main.py   # :8000

cd frontend && npm install && npm run dev             # :3000
```
</details>

---

## 環境變數

| 變數 | 必填 | 說明 |
|------|:--:|------|
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | ✓ | 預設 LLM（OpenAI 相容） |
| `SETTINGS_ENCRYPT_KEY` | ✓ | 加密使用者設定的金鑰，**長期固定**，更換會使既有設定無法解開 |
| `CORS_ALLOW_ORIGINS` | | 同源部署不需要；僅跨來源直連時才設 |
| `NEXT_PUBLIC_API_URL` | | 前端 build-time，瀏覽器端後端 URL；同源留空，本機開發設 `http://localhost:8000` |
| `API_INTERNAL_URL` | | 前端 runtime，server component 內網 URL；compose 設 `http://backend:8000` |
| `LOG_LEVEL` | | `tpcu.*` logger 層級，預設 `INFO` |
| `ALERT_WEBHOOK_URL` | | 設了才啟用：WARNING+ 即時推到 Discord / Slack webhook（內容已遮蔽機密）|
| `ALERT_COOLDOWN` | | 同一告警的冷卻秒數，預設 `60`，避免洗版 |

**LLM** 走 OpenAI 相容 API，支援 Gemini / OpenAI / Ollama。登入後也可在前端 **Settings** 即時切換，優先於 `.env`、免重啟。

| 情境 | `LLM_BASE_URL` | `LLM_MODEL` |
|------|---------------|-------------|
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.1-flash-lite` |
| OpenAI | （留空） | `gpt-4o-mini` |
| Ollama | `http://localhost:11434/v1/` | `llama3` |

---

## 部署

```bash
docker compose up --build -d   # 建置 + 背景啟動
docker compose ps              # 確認 healthy
docker compose down            # 停止（資料留在 backend/ volume）
```

- **資料持久化**：`backend/` 下的 `data/`、`logs/`、`.cache/`、`uploads/` 以 volume 掛載。
- **換 host / 網域免重 build**：前端同源、無烘入 URL，image 通用。
- **上 HTTPS**：改 [Caddyfile](Caddyfile) 把 `:80` 換成網域、移除 `auto_https off`、compose 開 `443`，Caddy 自動申請憑證。

<details>
<summary>不帶原始碼部署（registry）</summary>

```bash
export REGISTRY=ghcr.io/<帳號> TAG=latest

# build 機（有原始碼）
docker compose build && docker compose push

# 部署機（只要 docker-compose.deploy.yml + Caddyfile + backend/.env）
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d
```
</details>

---

## 功能一覽

| 功能 | 說明 |
|------|------|
| AI 對話 | SSE 串流、工具呼叫、ask_user 確認、訊息編輯、歷史會話 |
| 課表 / 成績 | 依學期查詢，可產生圖表 |
| 缺曠 | 依學期 + 日期範圍 |
| 假單 | 查詢 / 申請（支援圖片）/ 刪除 |
| 自訂 LLM | 設定自己的 base_url / api_key / model |

---

## REST API

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/login` | 登入，回傳 token |
| `POST` | `/chat` | AI 對話（SSE 串流） |
| `GET` | `/api/schedule` `/api/absence` `/api/grades` `/api/leaves` | 課表 / 缺曠 / 成績 / 假單 |
| `POST` | `/api/apply-leave` | 申請假單 |
| `GET/PUT/DELETE` | `/api/settings/llm` | 自訂 LLM |
| `GET` | `/api/sessions` | 歷史會話 |

Rate limit：`/login` 10 次/分，`/chat` `/answer` 20 次/分（per IP）。

---

## 專案結構

```
Agora-AI/
├── docker-compose.yml          # 本機 build 部署
├── docker-compose.deploy.yml   # 拉 registry image 部署
├── Caddyfile                   # 反向代理路由
├── backend/                    # FastAPI（src/: agent / api / actions / parsers）
└── frontend/                   # Next.js（app/(app)/: chat / schedule / grades / absence / leaves / settings）
```
