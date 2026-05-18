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
```

圖片輸出至 `output/schedule.png`（2× 像素密度）。

## 專案結構

```
tpcu-llm/
├── scripts/
│   └── fetch_schedule.py       # 完整課表查詢流程
├── src/
│   ├── client.py               # 通用 HTTP 層（login / activate_feature / post_data / get_page）
│   ├── parser.py               # HTML 解析（課表、select 選項）
│   ├── actions/
│   │   ├── auth/
│   │   │   ├── index.py        # action：登入
│   │   │   └── docs.md
│   │   └── fetch_schedule/
│   │       ├── index.py        # action：取得學期清單 + 查詢課表
│   │       └── docs.md         # 端點規格（AG222 兩階段流程）
│   └── utils/
│       └── render_schedule/
│           ├── index.py        # Pillow 課表圖片渲染（支援 scale 參數）
│           └── docs.md
├── output/                     # 產出圖片（gitignore，保留 .gitkeep）
├── pyproject.toml
└── requirements.txt
```

## 架構模式

`client.py` 只管 HTTP，業務邏輯全部在 `actions/<feature>/`：

```
scripts/fetch_schedule.py
    └── actions/fetch_schedule/index.py
            ├── client.activate_feature()   # Step 1：激活功能閘門
            └── client.post_data()          # Step 2：送出查詢
```

新增功能（如成績、缺曠）只需新增 `actions/<feature>/` 目錄，`client.py` 不動。

## 已完成

- [x] 登入取得 JSESSIONID
- [x] 課表查詢（兩階段：激活 → 查詢）
- [x] 學期選單互動（列出選項供使用者選擇）
- [x] 課表渲染成 PNG（Pillow，2× 品質，柔和配色）

## 待辦 / 下一步

- [ ] 缺曠查詢（`actions/fetch_absence/`）
- [ ] 成績查詢
- [ ] LLM 整合（自然語言查詢課表）
