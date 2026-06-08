# ops — 上線 Log 分析（Loki + Grafana）

後端已輸出結構化 JSON Lines 到 `backend/logs/`（`system.jsonl` = INFO+、`errors.jsonl` = WARN+，每日 rotate 保留 30 天）。這個 stack 把它們收進 Loki，用 Grafana 看趨勢。**不改後端輸出**，純讀檔。

## 啟動 / 關閉

```bash
# 啟動觀測性 stack（平時不需要，不影響正式服務）
docker compose --profile observability up -d

# 開 Grafana（只綁本機，預設 admin / admin，請改 env GRAFANA_USER/PASSWORD）
open http://127.0.0.1:3001       # 儀表板：「Agora 上線總覽」已自動佈建

# 關閉
docker compose --profile observability down
```

> Grafana 只綁 `127.0.0.1:3001`，不對外。要遠端看，請走 Caddy 加 `basic_auth`，別直接把 port 公開。

## 架構

```
backend/logs/*.jsonl ──tail──> promtail ──push──> loki <──query── grafana
```

- **Promtail**（[promtail-config.yml](promtail/promtail-config.yml)）：tail 兩個 jsonl、用 JSON stage 解析、以 log 內 `timestamp` 當事件時間。
- **低基數 label 原則**：只有 `level` / `event` / `logger` / `error_code` 升成 Loki label；`uid`、`request_id` 留在 log 內容，查特定使用者時用 `| json | uid="..."` 過濾。這樣避免高基數把 Loki series 撐爆。
- **Loki**（[loki-config.yml](loki/loki-config.yml)）：filesystem 儲存、retention 720h（30 天，對齊後端檔案保留）。

## 儀表板面板（對應的 LogQL）

| 面板 | 來源 event | 重點 |
|------|-----------|------|
| HTTP 延遲 p50/p95 | `http_request` 的 `duration_ms` | 體感速度、抓慢路由 |
| 警告/錯誤數・慢請求 | `level=~"warning\|error"`、`http_request` 且 `level="warning"`（>2s） | 服務健康度 |
| 工具失敗數（依工具） | `agent_tool_call` 且 `ok="false"` | 哪個工具在壞 |
| 工具成功率 | `agent_tool_call` 的 ok 比例 | 整體可靠度 |
| 活躍使用者 | `auth_login` 且 `ok="true"` 的不重複 `uid` | 使用量 |
| LLM token 用量 | `llm_call` 的 prompt/completion tokens | 成本趨勢 |
| 免費額度命中 | `quota_block` 的 `error_code`（QUOTA_001/002、LLM_001） | 多少人撞到免費上限 → 回饋定價/額度調整 |
| 登入失敗數 | `auth_login` 且 `ok="false"` | 認證問題、異常嘗試 |

### 常用查詢片段

```logql
# 某使用者最近的完整足跡（uid 不是 label，用內容過濾）
{job="agora-backend"} | json | uid="B1234567"

# 某次請求的全鏈路（request_id 串連 middleware → agent → tool）
{job="agora-backend"} | json | request_id="abcd1234..."

# 最近的錯誤
{job="agora-backend", level=~"error|critical"}
```

## 不想跑 Grafana？每日摘要腳本

對單機/低流量，常駐 Loki+Grafana 偏重。[backend/scripts/daily_summary.py](../backend/scripts/daily_summary.py) 是輕量替代：純標準庫，讀 `logs/*.jsonl` + SQLite，彙整當日**活躍人數、對話/LLM 呼叫、token 用量、共用 AI 用量、免費額度命中、錯誤數**，推到 webhook。

```bash
# 先看內容（不推送）
docker compose exec backend python scripts/daily_summary.py --dry-run

# 在 host 直接跑也行（logs/ data/ 都是掛出來的 volume）
cd backend && python3 scripts/daily_summary.py --yesterday
```

webhook 取自 `SUMMARY_WEBHOOK_URL`，沒設則 fallback `ALERT_WEBHOOK_URL`。排程（每天 00:10 推前一天）：

```cron
10 0 * * * cd /path/to/Agora-AI && docker compose exec -T backend python scripts/daily_summary.py --yesterday
```

> 日界用 Asia/Taipei，對齊額度計算；會自動讀 rotate 過的 `*.jsonl.YYYY-MM-DD`。

## 與即時告警的分工

`ALERT_WEBHOOK_URL`（後端 [log.py](../backend/src/log.py) 的 `WebhookAlertHandler`）負責 **WARNING+ 即時推播**到 Discord/Slack；這套 Loki+Grafana 負責 **歷史趨勢與聚合分析**。兩者互補，不重做：出事即時收到通知，事後來這裡查根因與趨勢。
