#!/bin/sh
set -eu
: "${APP_URL:?APP_URL must be set}"
: "${CRON_PATH:?CRON_PATH must be set}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

case "$APP_URL" in
  http://*|https://*) URL="${APP_URL}${CRON_PATH}" ;;
  *)                  URL="https://${APP_URL}${CRON_PATH}" ;;
esac

exec curl -fsS --retry 3 --max-time 120 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "$URL"
