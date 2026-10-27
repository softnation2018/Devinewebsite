#!/bin/sh
# Daily database backup into /backups at BACKUP_HOUR_UTC (default 21:00 UTC,
# 02:30 IST), keeping the last BACKUP_KEEP_DAYS days. Backups hold customer
# details, so only the owner can read them. They sit on the same server as
# the shop: copy them somewhere else too (docs/backups.md), or a lost server
# loses the backups with it.
set -eu
umask 077
KEEP="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR_UTC:-21}"
while true; do
  now=$(( $(date -u +%H) * 3600 + $(date -u +%M) * 60 + $(date -u +%S) ))
  wait=$(( (HOUR * 3600 - now + 86400) % 86400 ))
  [ "$wait" -eq 0 ] && wait=86400
  sleep "$wait"
  f="/backups/divine-mantra-$(date -u +%Y%m%d-%H%M%S).dump"
  if pg_dump --format=custom --no-owner --file="$f.part" "$DATABASE_URL"; then
    mv "$f.part" "$f"
    echo "[backup] wrote $f"
  else
    rm -f "$f.part"
    echo "[backup] FAILED at $(date -u)" >&2
  fi
  find /backups -name 'divine-mantra-*.dump' -mtime +"$KEEP" -delete
done
