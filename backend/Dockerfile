# TPCU 後端：FastAPI + uvicorn
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 依賴由 pyproject 安裝（唯一來源）。hatchling 建 wheel 需 src 在場，
# 故先 copy pyproject + src 再裝；所列套件皆有 wheel，slim 不需編譯器。
COPY pyproject.toml .
COPY src ./src
RUN pip install --no-cache-dir .

# 進入點與維運 CLI（非套件內，runtime 由 main.py 以 sys.path 直接載入 src）
COPY main.py .
# 每日摘要等維運 CLI（排程本體在 src/，不靠這個）
COPY scripts ./scripts

# runtime 目錄（compose 會用 volume 覆蓋，先建好確保存在與權限）
RUN mkdir -p data logs .cache uploads

EXPOSE 8000

# main.py 預設綁 0.0.0.0:8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["python", "main.py"]
