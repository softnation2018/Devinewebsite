import 'dotenv/config'
import { defineConfig } from 'prisma/config'
import { findDatabaseUrl } from './src/lib/database-url'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct connection (Neon: DATABASE_URL_UNPOOLED).
    // Left unset when there is no database yet, so `prisma generate` still
    // works during `npm install`; migrate and seed then fail with a clear error.
    url: findDatabaseUrl({ direct: true }),
  },
})
