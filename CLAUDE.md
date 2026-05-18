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
```

## 執行

```bash
python3 scripts/fetch_schedule.py   # 登入 → 選學期 → 查課表 → 輸出圖片
python3 scripts/fetch_absence.py    # 登入 → 選學期 → 選日期範圍 → 查缺曠 → 輸出圖片
python3 scripts/fetch_grades.py     # 登入 → 查歷年成績 → 選學期 → 輸出圖片
```

圖片輸出至 `output/` 目錄（2× 像素密度）。

## 專案結構

```
tpcu-llm/
├── scripts/
│   ├── fetch_schedule.py       # 課表查詢流程
│   └── fetch_absence.py        # 缺曠查詢流程
├── src/
│   ├── client.py               # 通用 HTTP 層（login / activate_feature / post_data / get_page）
│   ├── parser.py               # HTML 解析（課表、缺曠、成績、select 選項）
│   ├── actions/
│   │   ├── auth/
│   │   │   ├── index.py        # action：登入
│   │   │   └── docs.md
│   │   ├── fetch_schedule/
│   │   │   ├── index.py        # action：取得學期清單 + 查詢課表
│   │   │   └── docs.md         # 端點規格（AG222 兩階段流程）
│   │   ├── fetch_absence/
│   │   │   ├── index.py        # action：取得選項 + 查詢缺曠
│   │   │   └── docs.md         # 端點規格（AK002 直接打 form）
│   │   └── fetch_grades/
│   │       ├── index.py        # action：查詢歷年成績（AG102 單次 POST）
│   │       └── docs.md         # 端點規格（arg 全空，Session 識別學生）
│   └── utils/
│       ├── render_schedule/
│       │   ├── index.py        # Pillow 課表圖片渲染
│       │   └── docs.md
│       ├── render_absence/
│       │   ├── index.py        # Pillow 缺曠圖片渲染
│       │   └── docs.md
│       └── render_grades/
│           ├── index.py        # Pillow 成績圖片渲染
│           └── docs.md
├── output/                     # 產出圖片（gitignore，保留 .gitkeep）
│   ├── schedule.png
│   ├── absence.png
│   └── grades.png
├── pyproject.toml
└── requirements.txt
```

## 架構模式

`client.py` 只管 HTTP，業務邏輯全部在 `actions/<feature>/`。

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

新增功能只需新增 `actions/<feature>/` 目錄，`client.py` 不動。

## 已完成

- [x] 登入取得 JSESSIONID
- [x] 課表查詢（兩階段：激活 → 查詢）
- [x] 學期選單互動
- [x] 課表渲染成 PNG（Pillow，2× 品質，柔和配色）
- [x] 缺曠查詢（選學期 + 日期範圍快選：今天 / 近 30 天 / 自訂）
- [x] 缺曠渲染成 PNG（只顯示有資料的節次，假別色碼 + 圖例）
- [x] 成績查詢（歷年全部一次回傳，腳本自行解析學期列表）
- [x] 成績渲染成 PNG（不及格列紅底標示）

## 待辦 / 下一步

- [ ] LLM 整合（自然語言查詢課表 / 缺曠 / 成績）
