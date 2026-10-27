import 'dotenv/config'
import { defineConfig } from 'prisma/config'
import { databaseUrl } from './src/lib/database-url'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct connection (Neon: DATABASE_URL_UNPOOLED).
    url: databaseUrl({ direct: true }),
  },
})
