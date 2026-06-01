重構與改善整個系統，遵守以下規範：

【會話紀錄系統】

建立完整 Conversation Log 機制。

必須儲存：

- 原始 user / assistant 訊息
- tool call（工具名稱、輸入參數、輸出結果）
- tool 使用次數
- timestamp
- 附件資訊

設計要求：

- 保留原始資料方便 replay / debug
- 支援後續分析 LLM 行為
- 支援未來擴充 tool tracing
- 支援未來訊息摘要與 context 壓縮
- 支援未來會話搜尋
- 支援工具執行歷史檢視

訊息資料模型應支援：

Message:
{
  id: string
  role: "user" | "assistant" | "tool"
  type: "text" | "tool_call" | "tool_result"
  content?: string
  tool?: {
      name: string
      input: unknown
      output?: unknown
  }
  attachments?: Attachment[]
  createdAt: number
}

Attachment:
{
  id: string
  filename: string
  mimeType: string
  url: string
}

禁止：

- 不可在前端暴露伺服器實體路徑
- 不可顯示本機絕對路徑
- 不可顯示 docker path
- 不可顯示 storage path
- 不可顯示內部 key
- 不可顯示 debug 路徑資訊

錯誤：

附件路徑：/Users/small_r/small-R/side-projects/uploads/IMG_9922.jpeg

正確：

附件

IMG_9922.jpeg

[圖片預覽]

附件顯示要求：

- 自動縮圖
- 點擊可放大
- hover 顯示檔案資訊
- 支援圖片預覽
- 支援多附件橫向排列
- 支援未來影片與 PDF
- UI 保持簡潔

【安全要求（高優先級）】

防止 IDOR（Insecure Direct Object Reference）。

所有資源：

- 對話紀錄
- 附件
- 工具紀錄
- 課表
- 使用者資料
- 未來新增資料

都必須驗證擁有者。

禁止：

GET /uploads/51231125/IMG_9922.jpeg

禁止：

SELECT *
FROM conversations
WHERE id = conversationId

正確：

SELECT *
FROM conversations
WHERE id = conversationId
AND owner_id = currentUser.id

要求：

- 不可信任前端傳入 userId
- userId 必須來自 session/JWT/server context
- 所有 API 必須驗證登入狀態
- 所有資源查詢必須驗證 owner
- UUID 不等於安全
- 即使使用 UUID 仍必須驗證 owner
- 不允許僅透過 resource id 存取資料

附件：

不要：

/uploads/51231125/IMG_9922.jpeg

改成：

/api/files/{randomUUID}

檔案存取流程：

1. 驗證登入狀態
2. 驗證 owner
3. 驗證檔案存在
4. 回傳檔案

如果使用 S3：

- 使用 signed URL
- URL 必須過期
- 禁止永久公開 URL

【工具系統】

新增即時時間工具：

get_current_date

工具區顯示：

已使用 1 個工具

get_current_date

要求：

- 顯示工具名稱
- 顯示工具使用數量
- 顯示工具執行紀錄
- 支援未來工具擴充
- 支援 tool tracing
- 支援 loading 狀態
- 支援錯誤狀態

【設定頁重構】

建立獨立設定架構：

LLM 設定：

- model
- temperature
- max tokens
- system prompt
- context 長度
- provider

個人化設定：

- 主題
- 品牌色
- UI 偏好
- 個人資料
- 通知設定

保留後續擴充能力。

建議：

設定頁使用 sidebar：

General
LLM
Personalization
Appearance
Advanced

【UI / Design System】

主題：

- 預設深色模式
- 品牌主色改橘色
- 建立統一 design token

例如：

Primary:
Orange

Background:
Dark

Border:
統一透明度

Text:
統一階層

要求：

- 建立可重用元件
- 保持一致間距
- 保持一致圓角
- 保持一致 hover
- 保持一致動畫

互動卡片：

- 對話卡片
- 工具卡片
- 課表卡片

可以增加彩度與層次感。

課表：

重做成 Google Calendar 類型：

要求：

- 時間軸
- 彩色課程區塊
- 日視圖
- 週視圖
- 現在時間線
- 更現代視覺
- 更好的空間利用
- 可擴充事件系統

【元件一致性】

以下元件：

- button
- select
- input
- card
- table
- modal
- dropdown
- 空白區域

必須使用統一規則：

方案 A：

全部透明背景

或

方案 B：

全部品牌色背景

禁止：

- 混用不同背景風格
- 部分毛玻璃部分實色
- 不一致 hover
- 不一致陰影
- 不一致邊框

優先考慮：

一致性 > 炫技效果

【重構要求】

- 優先重構架構，再調整 UI
- 避免重複程式碼
- 元件模組化
- 型別完整
- 保持可維護性
- 保持可擴充性
- 避免過度耦合
- 不要留下臨時 hack
- 不要為了快速完成犧牲結構品質

實作前先分析：

1. 資料流
2. 元件架構
3. API 設計
4. 安全風險
5. edge cases

再開始實作。

缺礦統計 改成真的 紅字的缺礦 的統計