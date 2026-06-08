# TPCU 後端：FastAPI + uvicorn
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 先裝依賴以利 layer cache（所列套件皆有 wheel，slim 不需編譯器）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 程式碼
COPY src ./src
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
