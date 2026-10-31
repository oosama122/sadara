FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY sadara sadara
COPY dashbord dashbord

RUN DEBUG=True python backend/manage.py collectstatic --noinput

ENV DEBUG=False
EXPOSE 8000

CMD ["sh", "/app/backend/start.sh"]
