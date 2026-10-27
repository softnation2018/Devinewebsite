# Divine Mantra shop, for running on your own server with docker compose.
#
# The shop's pages are pre-built from the database, so the final build step
# runs when the container starts (after the database is reachable), not
# while the image is built. See docker/start.sh and docs/self-hosting.md.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# DATABASE_URL is only needed so `prisma generate` can load its config; nothing connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci

FROM base AS app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
  && chmod +x docker/start.sh \
  && useradd --create-home --uid 1001 shop \
  && mkdir -p /data/media \
  && chown -R shop:shop /app /data
USER shop
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["docker/start.sh"]
