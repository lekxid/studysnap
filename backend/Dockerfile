FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["sh", "-c", "python -m app.database_bootstrap && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
