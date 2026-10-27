#!/bin/sh
# Runs the shop's scheduled jobs (on Vercel, vercel.json does this instead):
# releases stock held by unpaid online orders every 10 minutes and refreshes
# courier tracking every hour.
set -u
APP="${APP_URL:-http://app:3000}"
n=0
while true; do
  sleep 600
  curl -fsS -m 120 -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/release-unpaid" >/dev/null || echo "[cron] release-unpaid failed"
  n=$((n+1))
  if [ $((n % 6)) -eq 0 ]; then
    curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/track-shipments" >/dev/null || echo "[cron] track-shipments failed"
  fi
done
