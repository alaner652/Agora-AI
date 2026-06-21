# Agora AI — TPCU 學生 AI 助理

TPCU 校務系統的 AI 助理：課表、缺曠、成績、假單查詢與管理，並能用對話操作這些功能。
後端 FastAPI（`backend/`）、前端 Next.js 16（`frontend/`），透過 Next.js rewrites 同源反代部署。

## 架構速覽

```
api/  →  agent/  →  actions/  →  parsers/
                              →  client.py
```

對外只有 Next.js `:80`，`/api/**` 透過 rewrites 透傳到 backend:8000；其餘頁面由 Next.js 直接處理。前端走相對路徑、後端免 CORS。完整設計見 @docs/system-design.md。

## 開發鐵則（細節見 @docs/CONTRIBUTING.md）

- **依賴方向嚴格單向**：`parsers/` 不能 import `client`/`actions`；`client.py` 零業務邏輯。
- **action 回傳型別**：查詢類 `list[dict]`、動作類 `{"success": bool|None, "message": str}`；一律加 return type annotation。
- **民國日期**：工具參數用 compact `YYYMMDD`（如 `1150521`），西元 = 民國 + 1911。
- **危險工具先確認**：`apply_leave`、`delete_leave` 必先 `ask_user`，並在 `tool_meta.py` 標 `danger_level`。
- **機密不落地**：JSESSIONID、密碼不得出現在 log / print / commit；log 提及 session 只露後四碼。

## AI 對話行為

`ChatAgent`（`backend/src/agent/`）如何把自然語言對應到工具、解讀結果、用中文回答，見 @docs/AI_GUIDE.md（含工具清單、假別代碼、節次順序等領域參考）。

## 常用指令

```bash
# 全端（:80）—— 開 http://localhost
docker compose up --build -d

# 後端單獨開發（需在 backend/ 下）
cd backend && python3 main.py            # :8000
pytest                                   # asyncio_mode=auto

# 前端
cd frontend && npm run dev               # :3000
```

## 注意

- **前端 Next.js 16 與你訓練資料中的不同** —— 動手改前端前先讀 `frontend/AGENTS.md` 的指示。
- 環境變數見 [README.md](README.md)；`SETTINGS_ENCRYPT_KEY` 必須長期固定，更換會使既有加密設定無法解開。
- 改動完成、要驗證時走 Docker（`http://localhost`），SSE 串流是否逐字冒出是 `/api/chat` 路由正確的指標。
