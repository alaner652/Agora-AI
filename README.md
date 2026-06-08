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
| `FREE_DAILY_PER_USER` / `FREE_DAILY_GLOBAL` | | 免費伺服器 LLM 的每人/全站每日上限（預設 `20`/`500`）；超過引導 BYOK。設 `FREE_DAILY_PER_USER=0` 或不填 `LLM_API_KEY` 即純 BYOK |
| `CORS_ALLOW_ORIGINS` | | 同源部署不需要；僅跨來源直連時才設 |
| `NEXT_PUBLIC_API_URL` | | 前端 build-time，瀏覽器端後端 URL；同源留空，本機開發設 `http://localhost:8000` |
| `API_INTERNAL_URL` | | 前端 runtime，server component 內網 URL；compose 設 `http://backend:8000` |
| `LOG_LEVEL` | | `tpcu.*` logger 層級，預設 `INFO` |
| `ALERT_WEBHOOK_URL` | | 設了才啟用：WARNING+ 即時推到 Discord / Slack webhook（內容已遮蔽機密）|
| `ALERT_COOLDOWN` | | 同一告警的冷卻秒數，預設 `60`，避免洗版 |
| `GRAFANA_USER` / `GRAFANA_PASSWORD` | | 觀測性 stack 的 Grafana 登入帳密，預設 `admin`/`admin`（見下方「觀測性」）|
| `SUMMARY_WEBHOOK_URL` | | 每日摘要推送目標；未設則 fallback `ALERT_WEBHOOK_URL`（見下方「觀測性」）|
| `DAILY_SUMMARY_AT` | | 後端內建每日摘要排程時間（Asia/Taipei `HH:MM`，預設 `00:10`，留空關閉）|

**LLM** 走 OpenAI 相容 API，支援 Gemini / OpenAI / Ollama。登入後也可在前端 **Settings** 即時切換，優先於 `.env`、免重啟。

| 情境 | `LLM_BASE_URL` | `LLM_MODEL` |
|------|---------------|-------------|
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.1-flash-lite` |
| OpenAI | （留空） | `gpt-4o-mini` |
| Ollama | `http://localhost:11434/v1/` | `llama3` |

**免費額度與自備金鑰（BYOK）**：沒在設定填自己金鑰的使用者，走伺服器共用 LLM，受 `FREE_DAILY_PER_USER` / `FREE_DAILY_GLOBAL` 每日上限約束；額度用完或未提供共用金鑰時，`/chat` 回 **402** 並引導使用者去設定填自己的金鑰（友善提示，非 raw 401）。填了自己金鑰即不受額度限制。設 `FREE_DAILY_PER_USER=0` 或不填 `LLM_API_KEY` 即**純 BYOK 模式**。

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

## 觀測性（選用）

結構化 log 已落在 `backend/logs/`（`system.jsonl` / `errors.jsonl`，JSON Lines、每日 rotate 保留 30 天）。需要儀表板時，多帶 `observability` profile 起一套 Loki + Grafana（**平時不啟動**，不影響正式服務）：

```bash
docker compose --profile observability up -d
```

開 **http://127.0.0.1:3001**（Grafana，僅綁本機；帳密 `admin`/`admin` 或 `GRAFANA_USER` / `GRAFANA_PASSWORD`），Dashboards → **「Agora 上線總覽」**：HTTP 延遲 p50/p95、錯誤 / 慢請求、工具成敗、LLM token、活躍人數、免費額度命中、登入失敗。

Promtail tail log 檔推進 Loki，**不需改後端**；與既有的 `ALERT_WEBHOOK_URL` 即時告警互補（一個看歷史趨勢、一個即時通知）。詳見 [ops/README.md](ops/README.md)。

**輕量替代**：單機/低流量不想常駐 Grafana，後端**內建每日摘要排程**（[src/summary.py](backend/src/summary.py) + lifespan）——到 `DAILY_SUMMARY_AT` 自己讀 log + SQLite 產摘要（活躍人數、token 用量、額度命中、錯誤數）推 webhook，**免 cron**；手動補跑用 [scripts/daily_summary.py](backend/scripts/daily_summary.py)。

---

## 功能一覽

| 功能 | 說明 |
|------|------|
| AI 對話 | SSE 串流、工具呼叫、ask_user 確認、訊息編輯、歷史會話 |
| 課表 / 成績 | 依學期查詢，可產生圖表 |
| 缺曠 | 依學期 + 日期範圍 |
| 假單 | 查詢 / 申請（支援圖片）/ 刪除 |
| 自訂 LLM（BYOK） | 設定自己的 base_url / api_key / model，填了即不受免費額度限制 |

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
├── ops/                        # 觀測性 stack：Loki / Promtail / Grafana 設定與儀表板
├── backend/                    # FastAPI（src/: agent / api / actions / parsers）
└── frontend/                   # Next.js（app/(app)/: chat / schedule / grades / absence / leaves / settings）
```
