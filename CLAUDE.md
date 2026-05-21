# tpcu-llm

（TPCU）學生資訊系統的 Python 爬蟲與工具集。
目標是抓取課表、缺曠等資料，並輸出成可用格式（圖片、結構化資料）。

## 環境設定

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .          # editable install（讓 src/ 進 Python path）
```

`.env` 放在專案根目錄：
```
TPCU_UID=你的學號
TPCU_PWD=你的密碼
LLM_API_KEY=...          # chatbot.py 用
LLM_BASE_URL=...         # 選填，預設 Google Gemini OpenAI-compatible endpoint
LLM_MODEL=...            # 選填，預設 gpt-4o-mini
LOG_LEVEL=DEBUG          # 選填，預設 WARNING；設 DEBUG 可看 action 細節
```

## 執行

```bash
python3 scripts/fetch_schedule.py   # 登入 → 選學期 → 查課表 → 輸出圖片
python3 scripts/fetch_absence.py    # 登入 → 選學期 → 選日期範圍 → 查缺曠 → 輸出圖片
python3 scripts/fetch_grades.py     # 登入 → 查歷年成績 → 選學期 → 輸出圖片
python3 scripts/apply_leave.py      # 登入 → 互動式請假申請
python3 scripts/manage_leaves.py    # 登入 → 查假單 → 選擇性刪除
python3 scripts/chatbot.py          # AI 聊天機器人（需設 LLM_API_KEY）
python3 main.py                     # 主選單，整合以上所有功能
```

圖片輸出至 `output/` 目錄（2× 像素密度）。

## 專案結構

```
tpcu-llm/
├── main.py                         # 主選單（CLI 整合入口）
├── scripts/
│   ├── fetch_schedule.py           # 課表查詢流程
│   ├── fetch_absence.py            # 缺曠查詢流程
│   ├── fetch_grades.py             # 成績查詢流程
│   ├── apply_leave.py              # 請假申請流程
│   ├── manage_leaves.py            # 假單管理（查詢 + 刪除）
│   └── chatbot.py                  # AI 聊天機器人（LLM 整合）
├── src/
│   ├── client.py                   # 通用 HTTP 層（login / activate_feature / post_data / get_page / post_multipart）
│   ├── session.py                  # Session 快取（.cache/session.json，chmod 600）
│   ├── log.py                      # Logging 設定（get_logger / setup_logging）
│   ├── actions/
│   │   ├── auth/index.py           # action：登入
│   │   ├── fetch_schedule/index.py # action：取得學期清單 + 查詢課表
│   │   ├── fetch_absence/index.py  # action：取得選項 + 查詢缺曠
│   │   ├── fetch_grades/index.py   # action：查詢歷年成績
│   │   ├── fetch_leaves/index.py   # action：查詢假單列表
│   │   ├── apply_leave/index.py    # action：取得請假表單 + 送出申請
│   │   └── delete_leave/index.py   # action：刪除假單
│   ├── parsers/                    # HTML 解析套件（各功能獨立子模組）
│   │   ├── __init__.py             # re-export 所有公開 symbol
│   │   ├── _utils.py               # 私有輔助：get_text()
│   │   ├── select.py               # parse_select（通用表單選項）
│   │   ├── schedule.py             # ScheduleEntry + parse_schedule
│   │   ├── absence.py              # AbsenceEntry + parse_absence
│   │   ├── grades.py               # GradeEntry + parse_grades
│   │   └── leaves.py               # parse_leave_form + parse_leaves
│   └── utils/
│       ├── _theme.py               # 渲染設計系統（顏色、字體、佈局常數）
│       ├── json_output.py          # JSON 輸出工具（save_json，自動加時間戳）
│       ├── render_schedule/index.py # Pillow 課表圖片渲染
│       ├── render_absence/index.py  # Pillow 缺曠圖片渲染
│       └── render_grades/index.py   # Pillow 成績圖片渲染
├── docs/
│   ├── AI_GUIDE.md                 # AI chatbot 操作指引（嵌入 SYSTEM_PROMPT）
│   ├── rag_design.md               # RAG 架構設計草稿（未實作）
│   └── CONTRIBUTING.md             # 開發規範（架構、命名、Code Style）
├── output/                         # 產出檔案（gitignore，保留 .gitkeep）
├── pyproject.toml
└── requirements.txt
```

## 架構模式

模組依賴方向（單向，不得逆向）：`scripts → actions → parsers / client`

`client.py` 只管 HTTP，零業務邏輯。`parsers/` 只管 HTML 解析，不 import actions 或 client。新功能只需新增 `actions/<feature>/` 目錄。

**fetch_schedule 流程（兩階段 gateway）：**
```
activate_feature(AG222, spath)   # POST sys001_00.jsp → 激活 + 取得學期選單
post_data(ag222.jsp, {yms, ...}) # POST ag222.jsp → 取得課表 HTML
```

**fetch_absence 流程（直接打 form）：**
```
post_data(ak002_00.jsp, {fncid: AK002})  # POST → 取得完整表單（學期 + 假別）
post_data(ak002_01.jsp, {yms, ...})      # POST → 取得缺曠明細 HTML
```

**fetch_grades 流程（單次 POST，arg 全空）：**
```
post_data(ag102.jsp, {arg01..06: "", fncid: AG102})  # POST → 回傳所有歷年成績 HTML
```

**apply_leave 流程（兩階段）：**
```
get_page(ck001_02.jsp)           # GET → 取得請假表單（節次順序 + 當日有課節次）
post_multipart(ck001_ins.jsp)    # POST multipart → 送出申請（可附 JPEG/PDF）
```

## 已完成

- [x] 登入取得 JSESSIONID（session 快取 + 自動驗證）
- [x] 課表查詢（兩階段：激活 → 查詢）
- [x] 課表渲染成 PNG（Pillow，2× 品質，柔和配色）
- [x] 缺曠查詢（選學期 + 日期範圍快選）
- [x] 缺曠渲染成 PNG（假別色碼 + 圖例）
- [x] 成績查詢（歷年全部一次回傳）
- [x] 成績渲染成 PNG（不及格列紅底標示）
- [x] 請假申請（互動式 + 公假附件上傳）
- [x] 假單查詢 + 刪除
- [x] LLM 整合（AI chatbot，支援 OpenAI-compatible API）
- [x] 主選單整合（main.py）

## 待辦 / 下一步

- [ ] RAG 整合（見 docs/rag_design.md）
