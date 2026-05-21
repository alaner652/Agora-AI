# RAG 架構設計說明

## RAG 是什麼

**RAG（Retrieval Augmented Generation）** = 先從知識庫找到相關段落，再一起塞進 prompt 讓 LLM 回答。

```
使用者問問題
    ↓
從知識庫找最相關的段落（Retrieval）
    ↓
把段落 + 問題一起送給 LLM（Augmented）
    ↓
LLM 根據段落回答（Generation）
```

解決的問題：知識庫太大（幾百頁），放不進 context window。

---

## 什麼時候需要 RAG？

| 情境 | 建議做法 |
|------|---------|
| 文件很小（< 50KB，如 AI_GUIDE.md） | **直接塞進 system prompt**（context stuffing），不需要 RAG |
| 文件幾十頁（學校手冊、請假辦法） | **需要 RAG** |
| 個人 JSON 資料（成績、缺曠） | 直接放 context 就好，JSON 很小 |
| 對話歷史累積很長 | 考慮 RAG 或摘要壓縮 |

> 目前 chatbot.py 使用 context stuffing（AI_GUIDE.md 直接放 system prompt），不需要 RAG。

---

## 本專案的兩層架構（規劃中）

```
┌────────────────────────────────────────┐
│  Global RAG（全局知識庫）              │
│  內容：學校規定、請假辦法、課程手冊   │
│  所有使用者共用                        │
│  更新頻率：學期一次                   │
└────────────────────────────────────────┘
                    +
┌────────────────────────────────────────┐
│  Personal RAG（個人知識庫）            │
│  內容：個人成績、缺曠、假單 JSON       │
│  每個使用者不同                        │
│  更新頻率：每次查詢後同步              │
└────────────────────────────────────────┘
```

---

## 實作步驟（未來）

### Step 1：安裝工具

```bash
pip install chromadb sentence-transformers
```

- **ChromaDB**：本地向量資料庫，不需要 server
- **sentence-transformers**：免費本地 embedding 模型

### Step 2：建立知識庫

```python
import chromadb
from sentence_transformers import SentenceTransformer

client = chromadb.PersistentClient(path=".cache/chroma")
collection = client.get_or_create_collection("global_knowledge")
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")  # 支援中文

# 把文件分塊 + 存入
chunks = split_document("docs/school_handbook.pdf")  # 按章節分塊
embeddings = model.encode(chunks)
collection.add(
    documents=chunks,
    embeddings=embeddings.tolist(),
    ids=[f"chunk_{i}" for i in range(len(chunks))],
)
```

### Step 3：查詢時檢索

```python
def retrieve(query: str, n: int = 3) -> list[str]:
    embedding = model.encode([query])[0].tolist()
    result = collection.query(query_embeddings=[embedding], n_results=n)
    return result["documents"][0]

# 塞進 prompt
relevant = retrieve("公假申請條件")
context = "\n\n".join(relevant)
prompt = f"根據以下資料回答：\n{context}\n\n問題：{query}"
```

---

## 分塊策略建議

| 資料類型 | 分塊方式 |
|---------|---------|
| 學校手冊 PDF | 按章節（### 標題）分塊，每塊 300-500 字 |
| 請假辦法 | 按條文分塊 |
| 個人成績 JSON | 按學期分塊（每學期一個 document）|
| 缺曠 JSON | 按月份分塊 |

---

## 目前狀態

- [x] chatbot.py：context stuffing（AI_GUIDE.md 放 system prompt）
- [ ] Global RAG：學校手冊（等取得文件後再做）
- [ ] Personal RAG：個人資料向量化（等使用量大時再做）

---

## 資料庫升級路徑（JSON → SQLite）

目前 `output/*.json` 是暫存檔，未來若資料量大或需要跨查詢，可升級成 SQLite：

```
output/schedule.json  →  db/tpcu.db 的 schedules 資料表
output/absence.json   →  db/tpcu.db 的 absences 資料表
output/grades.json    →  db/tpcu.db 的 grades 資料表
output/leaves.json    →  db/tpcu.db 的 leaves 資料表
```

JSON 欄位名稱已對齊未來的資料表欄位，遷移時 action layer 不需修改。
