# Agora AI — 系統設計

Agora AI 是 TPCU 校務系統的 AI 助理。本文以「分層職責 → 請求生命週期 → 設計決策」三張表速覽整體設計。

對外只有 Caddy 的 `:80`，依 path + method 同源分流，前端走相對路徑、後端免 CORS。

```
瀏覽器 ─► Caddy :80 ─┬─ /api/* /health · POST /login /chat /answer ─► backend:8000
                     └─ 其餘頁面 / 靜態資源                          ─► frontend:3000
                                          server component ─► backend:8000（內網）
```

---

## 分層職責（由外到內）

| 層 | 元件 | 職責 | 關鍵檔 |
|----|------|------|--------|
| 入口 | **Caddy `:80`** | 同源反代，依 path + method 分流 | `Caddyfile` |
| 前端 | **Next.js**（server component） | 首屏資料抓取，走內網 `API_INTERNAL_URL` | `frontend/app/(app)/` |
| 前端 | **Next.js**（client） | 互動 / SSE，走相對路徑 | 同上 |
| API | **FastAPI routes** | 驗證、依賴注入 session/uid、組裝回應 | `src/api/routes.py` |
| Agent | **ChatAgent** | LLM 對話迴圈、工具呼叫、ask_user 確認 | `src/agent/agent.py`、`tools.py` |
| 業務 | **actions/** | 各功能單元（課表 / 缺曠 / 成績 / 假單 / auth） | `src/actions/*/index.py` |
| 外連 | **client.py** | 對 TPCU 校務系統的 HTTP 層 | `src/client.py` |
| 解析 | **parsers/** | 把校務系統 HTML 轉結構化資料 | `src/parsers/*.py` |
| 狀態 | **session cache / SQLite** | session 快取、會話 / 訊息 / 設定持久化 | `src/session.py`、`src/storage/` |

---

## 請求生命週期

| 流程 | 一般 API（如 `/api/schedule`） | AI 對話（`/chat`） |
|------|------|------|
| 1. 入口 | Caddy `GET /api/*` → backend | Caddy `POST /chat`（`flush_interval -1`，SSE 不緩衝）→ backend |
| 2. 認證 | `Depends(_resolve_session)` 取 jsessionid | `Depends(_resolve_uid)` 取使用者 |
| 3. 派工 | route → 對應 `action` | route → `ChatAgent` 對話迴圈 |
| 4. 取資料 | action → `client.py` → TPCU → `parsers` | LLM 決定呼叫哪個 tool → 對應 action（同左路徑） |
| 5. 狀態 | session 快取命中免重登入 | 訊息 / 會話寫入 SQLite，`conv_logger` 記錄 |
| 6. 回應 | JSON | SSE 逐字串流（token / tool 事件 / ask_user） |

---

## 設計決策速查

| 決策 | 為什麼 |
|------|--------|
| **Caddy 同源** | 前端走相對路徑、免烘 URL、後端免 CORS，換網域不用重 build |
| **`/login` `/chat` 以 method 區分** | 同一 path 既是前端頁面也是後端端點 |
| **兩種 API URL**（`NEXT_PUBLIC_*` build-time / `API_INTERNAL_*` runtime） | client 與 server component 取後端的時機與網路位置不同 |
| **`SETTINGS_ENCRYPT_KEY` 長期固定** | 加密使用者自訂 API key，換 key 會無法解密既有設定 |
| **OpenAI 相容 LLM 抽象** | 一套介面切換 Gemini / OpenAI / Ollama，Settings 頁可即時覆寫 |
| **session 快取層** | TPCU session 短命，快取減少重登、加速 action |
