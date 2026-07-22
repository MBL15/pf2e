FROM python:3.12-slim

WORKDIR /app

# Только исходники; SQLite монтируется в /app/data
COPY requirements.txt ./
COPY server/ ./server/
COPY css/ ./css/
COPY js/ ./js/
COPY index.html ./
COPY data/bestiary.json ./data/bestiary.json

RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=8765
ENV PYTHONUNBUFFERED=1

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=3)"

CMD ["python", "-m", "server.main"]
