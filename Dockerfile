# Robo OR Sim – máy chủ mô phỏng phòng mổ
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ROBO_ENV=production \
    ROBO_DB=/data/robo_or_sim.db

# Chạy bằng người dùng thường, không dùng root
RUN useradd --create-home --uid 10001 app \
 && mkdir -p /data/backups \
 && chown -R app:app /data

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY backend ./backend
COPY simcore ./simcore
COPY scenarios ./scenarios
COPY media ./media
COPY tools ./tools
# Phòng trường hợp mã nguồn giải nén với quyền 600: cho người dùng app đọc được
RUN chmod -R a+rX /app

USER app
EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# Một tiến trình đủ cho một trường; dùng PostgreSQL (DATABASE_URL) nếu muốn tăng --workers
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header"]
