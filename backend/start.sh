#!/bin/sh
set -eu

cd "$(dirname "$0")"
python manage.py migrate --noinput
python manage.py seed_site

exec gunicorn sadara_backend.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 2 \
    --threads 2 \
    --timeout 60
