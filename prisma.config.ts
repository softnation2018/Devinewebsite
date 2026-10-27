import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct connection; Neon's Vercel integration provides
    // one as DATABASE_URL_UNPOOLED beside the pooled DATABASE_URL.
    url: process.env.DATABASE_URL_UNPOOLED || env('DATABASE_URL'),
  },
})
