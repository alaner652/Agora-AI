# Gateway Hardening — 待辦 Backlog

> 願景：把 TPCU 打造成擋在校務系統前的 hardening gateway（對外過濾流量、對內補學校後端的 IDOR 等漏洞，把學校系統藏進內網）。
> 完整分析見 [docs/security-analysis-2026-06.md](docs/security-analysis-2026-06.md)。

## ✅ 已完成（branch: settings-brand-ui-refactor / gateway-hardening）

- [x] CORS 由 `["*"]` 收斂為 `CORS_ALLOW_ORIGINS` 白名單
- [x] 移除 dead code `/api/image`（後端端點 + 前端 fetch）
- [x] `serverFetch` 遇 401 統一 `redirect('/login')`，課表/成績不再顯示誤導性「請重新整理」
- [x] 安全分析報告 `docs/security-analysis-2026-06.md`

## 🔴 P0 — 邊緣硬化（高風險、變更大，建議各自獨立 PR）

- [ ] **token 改 HttpOnly + Secure cookie**
  - 需在 Next.js 加 BFF proxy 層（目前前端全部直連 FastAPI，且 SSE 把 token 放在 request body）
  - 影響面：8+ 處 `getCookie('token')`、axios interceptor、`streamSse` body、login/logout 流程
  - 參考：`frontend/lib/cookie.ts`、`frontend/lib/api-client.ts`、`frontend/app/(auth)/login/page.tsx`
- [ ] **上游 TLS 不再全域 `verify=False`**（`src/client.py:9`）
  - 改 pin 學校憑證或至少驗證 + 記錄；先逆向確認學校憑證行為（自簽？SNI？）
  - 弄錯會全斷，需先用腳本驗證學校端 TLS

## 🟡 P1 — 結構性 / IDOR 補強

- [ ] **集中化「上游 session 管理者」**
  - 單一擁有者負責 validate / refresh / expiry + 統一錯誤碼
  - 取代目前散落各處的 `try/except ValueError("Session 過期")`（`src/agent/agent.py:376`、`src/api/routes.py:71`）
  - 含主動驗證能力（`src/session.py:39` 的 `_validate` 已現成），配短期快取
- [ ] **上游 ID 綁定 uid 後才轉發**
  - `delete-leave` 的 `stdkey`/`barcode`、`apply-leave` 等 client 可控的上游識別碼（`src/api/routes.py`）
  - 目前完全依賴學校端用 JSESSIONID 自擋 → gateway 應驗證 / 重新從 uid 推導，避免原封放行學校的 IDOR
- [ ] **長命 session 機制探查**（無感續期的安全出路）
  - 逆向查學校 portal 有沒有比 JSESSIONID 更長命的機制（記住我 cookie / refresh token / re-auth 端點）
  - ⚠️ 不存學生密碼（與「減少攻擊面」初衷矛盾）

## 🟡 P2 — Defense-in-depth

- [ ] Next.js `middleware.ts` 做 server 端路由保護（目前只有 client 端 `useEffect` 檢查）
- [ ] （可選）清掉殘留的 `frontend/app/(app)/chat/page.tsx` 格式小改動

## 🟢 P3 — 可用性 / 擴展性

- [ ] token registry 從純記憶體（`src/api/state.py`）改為可持久化 / 可水平擴展後端
  - 現況：重啟即清空所有 session、無法 scale

## 備註

- 啟動後端後記得重啟才會套用 CORS / `/api/image` 變更
- 環境變數：新增 `CORS_ALLOW_ORIGINS`（逗號分隔，dev 預設 `http://localhost:3000`）
