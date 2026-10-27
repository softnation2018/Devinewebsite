#!/bin/sh
# Container start-up: wait for the database, apply migrations, build once,
# then serve. A restarted container reuses its build; a new image builds again.
set -eu

echo "[start] waiting for the database"
i=0
until node -e "const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1))"; do
  i=$((i+1))
  if [ "$i" -ge 60 ]; then echo "[start] database not reachable after 2 minutes" >&2; exit 1; fi
  sleep 2
done

echo "[start] applying database migrations"
npx prisma migrate deploy

# A brand-new database gets categories, settings, policy drafts and the
# owner account once. No demo products, and later starts change nothing.
SEED_ONLY_IF_EMPTY=true SEED_DEMO_PRODUCTS=false npx prisma db seed

if [ ! -f .next/BUILD_ID ]; then
  echo "[start] building the shop (first start of this image, takes a few minutes)"
  npx next build
fi

echo "[start] starting on port 3000"
exec npx next start -p 3000
