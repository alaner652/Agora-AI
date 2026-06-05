# fetch_schedule

查詢學生課表。分兩個階段：先激活功能取得學期清單，再送出學期選擇取得課表。

## 流程

```
Step 1  activate_feature(AG222)  →  取得含 <select#yms> 的表單 HTML
Step 2  post_data(ag222.jsp)     →  取得課表 HTML
```

---

## Step 1：激活功能閘門

| 方法 | URL |
|------|-----|
| POST | `/tsint/system/sys001_00.jsp?spath=ag_pro%2Fag222.jsp%3F` |

**Payload**

| 欄位 | 值 |
|------|----|
| `fncid` | `AG222` |

**解析目標**：`<select id="yms">` 的所有 `<option>`

| option value | option 內文 |
|---|---|
| `114,2` | `114學年度第2學期` |
| `114,1` | `114學年度第1學期` |

---

## Step 2：查詢課表

| 方法 | URL |
|------|-----|
| POST | `/tsint/ag_pro/ag222.jsp` |

**Payload**

| 欄位 | 範例值 | 說明 |
|------|--------|------|
| `yms` | `114,2` | 學期，URL 編碼為 `114%2C2` |
| `spath` | `ag_pro/ag222.jsp?` | 固定值 |
| `arg01` | `114` | 由 `yms` 以 `,` 拆分的第一段（民國年） |
| `arg02` | `2` | 由 `yms` 以 `,` 拆分的第二段（學期代碼） |

**備註**：`arg01` / `arg02` 是前端 JS 的拆分結果，伺服器需要分開的值：
```javascript
arryms = yms.split(",");
arg01 = arryms[0];  // 民國年
arg02 = arryms[1];  // 學期代碼
```
