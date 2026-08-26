#!/bin/sh
set -eu
: "${APP_URL:?APP_URL must be set}"
: "${CRON_PATH:?CRON_PATH must be set}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

# CRON_PATH may include a query string (e.g.
# "/api/cron/auto-publish?shard=0&shardCount=4"). The case statement
# below just prepends the URL scheme; the path + query passes through.
case "$APP_URL" in
  http://*|https://*) URL="${APP_URL}${CRON_PATH}" ;;
  *)                  URL="https://${APP_URL}${CRON_PATH}" ;;
esac

# Default per-cron timeout — overridable from the cron service's env so
# slow paths (auto-publish at 600s maxDuration, monthly-reports at 300s)
# can opt up without blanket-extending fast paths. Defaults to 660 to
# match the longest-running route (auto-publish, 600s) plus headroom.
MAX_TIME="${CRON_MAX_TIME:-660}"

# -f is deliberately NOT used any more: it suppresses the response body on any
# HTTP status >= 400, which is exactly the body carrying {"error": "..."} from
# the route's catch block. We capture the body, print it, and translate the
# status into the exit code ourselves.
#
# The authoritative record of what happened is now the cron_runs row the route
# writes (see src/lib/services/run-telemetry.ts) — this output is for a human
# tailing the container during an incident.
BODY_FILE=$(mktemp)
STATUS=$(curl -sS --retry 3 --max-time "$MAX_TIME" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -o "$BODY_FILE" -w '%{http_code}' \
  "$URL") || STATUS="000"

echo "[cron] $(date -u +%Y-%m-%dT%H:%M:%SZ) ${CRON_PATH} -> HTTP ${STATUS}"
head -c 8000 "$BODY_FILE"
echo
rm -f "$BODY_FILE"

case "$STATUS" in
  2??) exit 0 ;;
  *)
    echo "[cron] FAILED: HTTP ${STATUS} for ${CRON_PATH}" >&2
    exit 1
    ;;
esac
