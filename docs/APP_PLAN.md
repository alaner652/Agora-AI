# TPCU App 企劃

## 定位

給 TPCU 學生用的資訊查詢 App。學校官方網站操作複雜、手機體驗差，
本 App 目標是提供乾淨的原生 UI 與 AI 助理，讓學生快速完成日常查詢與請假。

**目標用戶**：TPCU 在學學生（初期）

---

## 功能分期

### Phase 1 — Web MVP
**目標**：可用、可展示，快速驗證核心流程

| 功能 | 說明 |
|------|------|
| 登入 | 學號 + 密碼，取得 token |
| 課表頁 | 表格顯示當學期課表 |
| 成績頁 | 歷年成績列表，不及格標紅 |
| 缺曠頁 | 選學期 + 日期範圍查詢 |
| 假單頁 | 查詢假單狀態 |
| AI 助理 | chatbot 介面，SSE 串流顯示 |

**不做**：請假申請（表單複雜，Phase 2）、推播（需基礎設施）

### Phase 2 — 行動端 + 請假
- React Native 或 Flutter 包 Web（或重寫）
- 請假申請表單 UI（含公假附件上傳）
- 本地通知（課表提醒）

### Phase 3 — 進階功能
- 推播通知（FCM / APNs）
- 老師端（需研究學校系統是否有對應介面）
- 管理員訊息推播
- RAG（AI 可查詢校規、課綱等文件）

---

## 技術選型

### 前端（Web）
- **React + Vite** — 生態成熟，SSE 處理方便
- **TailwindCSS** — 快速刻 UI
- **React Query** — API 快取 + 重試
- 放在 `web/` 目錄（monorepo）

### 後端（現有）
- FastAPI + uvicorn
- SSE 串流（`/chat` `/answer`）
- 直接資料 endpoint（`/api/schedule` 等）

### 行動端（Phase 2，待定）
- 優先考慮 React Native（與 Web 共用部分邏輯）
- 備選：Flutter

---

## API 對應表

| 前端頁面 | 使用的 API |
|---------|-----------|
| 登入 | `POST /login` |
| 課表 | `GET /api/semester-options` → `GET /api/schedule?semester=...` |
| 成績 | `GET /api/grades` |
| 缺曠 | `GET /api/absence/options` → `GET /api/absence?semester=...&start=...&end=...` |
| 假單 | `GET /api/leaves?start=...&end=...` |
| AI 助理 | `POST /chat`（SSE）→ `POST /answer`（如有 ask_user） |

---

## 尚未解決的問題

| 問題 | 影響 | 現況 |
|------|------|------|
| 推播通知基礎設施 | Phase 2/3 | 需要 FCM / APNs 帳號 + 後端 push service |
| 老師端登入 | Phase 3 | 不確定學校系統是否有對應介面可爬 |
| HTTPS | 上線必要 | 目前只有 HTTP，需要 Nginx/Caddy 反向代理 |
| Token 持久化 | 目前 token 在記憶體，重啟即失效 | 未來可考慮 Redis |
| 請假附件上傳 | Phase 2 | 後端 `/api/leaves` POST 尚未實作 |

---

## 目錄規劃

```
tpcu-llm/
├── web/                # React 前端（Phase 1）
│   ├── src/
│   │   ├── pages/      # 各功能頁面
│   │   ├── components/ # 共用元件
│   │   └── api/        # API client（fetch wrapper）
│   ├── package.json
│   └── vite.config.ts
├── src/                # Python 後端（現有）
└── scripts/
    └── serve.py        # 後端入口
```
