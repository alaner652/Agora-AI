# TPCU Gateway 系統安全分析報告

**日期：** 2026-06-02
**範圍：** 後端 `src/`、前端 `frontend/`、認證與儲存層
**評估視角：** 既看現況，也對照長遠目標——一個擋在校務系統前的 hardening gateway（對外過濾流量、對內補學校後端的 IDOR 等漏洞，把學校系統藏進內網）

> **本報告狀態標記**：🟢 = 本輪已實作；🟡🔴 = 待辦（後續評估）。
> 本輪只實作 🟢 三項快錢修復，其餘列於 §6 待辦。

---

## 1. 總結

系統的**資料層（DB / 多租戶隔離）已經是 gateway 等級**——IDOR 防護、密鑰加密、密碼不落地都做對了。但**邊緣 / proxy 層（TLS、CORS、cookie、上游 ID 驗證、流量過濾）是目前最弱的一環**——而這一層恰恰是 gateway 願景的核心價值。

一句話：**後門已鎖好，但前門還開著。**

---

## 2. 架構現況

```
瀏覽器 ──(Bearer token, cookie)──> Next.js 前端 ──> FastAPI gateway ──(JSESSIONID, verify=False)──> 學校系統 siw.tpcu.edu.tw
                                                         │
                                              SQLite (data/history.db)
                                              in-memory token→agent registry
```

- **雙層 session**：對外 Bearer token（記憶體、2h TTL）↔ 對內 JSESSIONID（學校端控制）。兩者生命週期沒對齊。
- **後端分層**：`actions/`（逆向出的學校端點）→ `client.py`（HTTP 層）→ `parsers/`（HTML 解析）→ `api/`（對外 REST）。分層清楚。
- **認證**：`secrets.token_urlsafe(32)` 不透明 token；學校密碼全程不落地（`src/api/app.py:135`）。

---

## 3. 安全發現（依嚴重度）

### 🔴 HIGH — 對學校的 TLS 驗證被關閉
`src/client.py:9` `verify=False`，所有打學校的請求都不驗證憑證。一個「保護校務系統」的 gateway 自己對上游可被 MITM——路徑上的攻擊者可竊取/竄改 JSESSIONID 與登入時的密碼。
> 常見原因是學校憑證有問題。即便如此也應改成 pin 學校憑證或至少記錄，而非全域關閉。

### 🔴 HIGH — 主憑證 token 存在非 HttpOnly cookie
`frontend/lib/cookie.ts:11` 用 `document.cookie` 寫入，只有 `SameSite=Lax`，**沒有 `HttpOnly`、沒有 `Secure`**。這個 token 在後端直接對應到 JSESSIONID，等於 master credential。任何 XSS 都能讀走；缺 `Secure` 還可能在純 HTTP 下外洩。與「過濾流量」的 gateway 定位矛盾。
> 註：要改 HttpOnly 須在 Next.js 加一層 BFF proxy（目前前端全部直連 FastAPI，且 SSE 把 token 放在 request body），牽動所有前端呼叫——非小工程。

### 🟠 MEDIUM — CORS 全開 〔🟢 本輪已修〕
`src/api/app.py:74-80` `allow_origins=["*"]` 同時 `allow_credentials=True`。組合不合規範，且與「gateway 過濾流量」定位衝突。
> **修復**：改為環境變數 `CORS_ALLOW_ORIGINS` 驅動的白名單，dev 預設 `http://localhost:3000`。

### 🟠 MEDIUM — 上游 ID 未綁定 uid 就轉發
`src/api/routes.py:236`（delete-leave）直接收 client 傳的 `stdkey` / `barcode` 轉給學校；apply-leave 同理。目前完全依賴學校端用 JSESSIONID 自擋。**gateway 的使命就是補學校的 IDOR**——這些 client 可控的上游識別碼，正是該驗證 / 綁定到當前 uid 的地方。

### 🟡 LOW-MED — `/api/image/{type}` 跨租戶共享路徑 〔🟢 本輪已處理〕
`src/api/routes.py:265` 服務 `output/{type}.png` 全域單一檔（非 per-uid）。後端遍尋無寫入者（疑似 orphan/dead code，目前必 404）。只要將來有人往那寫使用者資料即為跨租戶洩漏。
> **處理**：確認為 dead code 後移除端點與前端引用（若仍在用則改 per-uid `output/{uid}/{type}.png`）。

### 🟡 LOW — 前端路由保護只在 client 端
無 `frontend/middleware.ts`，保護靠各頁 `useEffect` 檢查 cookie。後端有強制 auth，故**非資料洩漏**，但缺 defense-in-depth。

### 🟡 LOW — token registry 純記憶體
`src/api/state.py` 重啟即清空所有 session、無法水平擴展、eviction 為 lazy。對 production gateway 是可用性/擴展性限制。

---

## 4. 做對的地方（值得保留）

- ✅ **IDOR 防護扎實**：files / sessions / messages 全部 uid-scoped 並驗證 ownership（`src/storage/files.py:49`、`src/storage/sessions.py:128`）。
- ✅ **LLM api_key 加密落地**（Fernet，`src/storage/user_settings.py:66`）。
- ✅ **學校密碼不落地**——符合「減少攻擊面」初衷。
- ✅ **Rate limiting** 已上 /login /chat /answer。
- ✅ **上傳防穿越**（`.name` + 10MB 上限，`src/api/routes.py:484`）。
- ✅ **.gitignore** 已排除 .env / .cache / *.db / uploads。

---

## 5. 架構 / 維護性觀察

- **上游 session 為反應式且不一致** 〔🟢 本輪部分修復〕：散落各處 `try/except ValueError("Session 過期")`，且 `serverFetch` 把 error_code 丟掉（`frontend/lib/api-server.ts`），導致課表/成績顯示誤導性的「請重新整理」。缺一個集中的「上游 session 管理者」。
  > **本輪修復**：`serverFetch` 解析 `AUTH_002`/`NET_002` → 導向 `/login`，課表/成績與其他頁一致。集中化 session 管理者列為 🟡 待辦。
- **`/api/image` 疑似 dead code**，本輪清理。
- **錯誤碼系統不錯**（AUTH_002 / NET_002 / SESSION_EXPIRED…）但前端消費先前不一致。

---

## 6. 優先序與待辦

| 優先 | 項目 | 狀態 |
|------|------|------|
| P0 | token 改 HttpOnly + Secure cookie（搬離 JS 可讀範圍，需 BFF proxy） | 🔴 待辦 |
| P0 | 上游 TLS 改 pin 憑證，不再全域 `verify=False` | 🔴 待辦 |
| P1 | CORS 收斂成白名單 | 🟢 已修 |
| P1 | 上游 ID（stdkey/barcode 等）綁定 uid 後才轉發 | 🟡 待辦 |
| P1 | 集中化「上游 session 管理者」（含主動驗證 + 統一錯誤） | 🟡 待辦 |
| P1 | serverFetch 過期導向 + 課表/成績一致 | 🟢 已修 |
| P2 | 移除或 per-uid 化 `/api/image` | 🟢 已處理 |
| P2 | 加 Next middleware 做 server 端路由保護 | 🟡 待辦 |
| P3 | token registry 換可持久化 / 可擴展後端 | 🟡 待辦 |

---

**結論**：隔離與密鑰處理已有 gateway 底子；要真正成為「保護校務系統的 gateway」，下一步重心應放在**邊緣硬化**（cookie、TLS、CORS、上游 ID 綁定），對應上表 P0/P1。
