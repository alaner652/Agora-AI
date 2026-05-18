# auth

登入學校系統，取得後續所有 API 所需的 Session Token。

## 端點

| 方法 | URL |
|------|-----|
| POST | `/tsint/perchk.jsp` |

## Request Payload

| 欄位 | 值 | 說明 |
|------|----|------|
| `hid_type` | `S` | 固定值（學生） |
| `uid` | `{學號}` | |
| `pwd` | `{密碼}` | |
| `err` | `N` | 固定值 |
| `fncid` | `""` | 固定空字串 |
| `ls_chochk` | `N` | 固定值 |

## 回傳

成功時，伺服器透過 `Set-Cookie` 回傳 `JSESSIONID`，後續所有請求須帶上此 Token。

## 錯誤處理

| 條件 | 例外 |
|------|------|
| 回應內含「無此帳號或密碼」 | `ValueError` |
| 未取得 `JSESSIONID` | `ValueError` |
