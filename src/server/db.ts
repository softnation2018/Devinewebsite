import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { databaseUrl } from '@/lib/database-url'

// One client per server process. In development Next.js reloads modules on
// every change, so the client is kept on globalThis to avoid opening a new
// connection pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  const connectionString = databaseUrl()
  // While building, Next.js prerenders pages in several workers at once.
  // Small pools keep the total under a hosted database's connection limit.
  const building = process.env.NEXT_PHASE === 'phase-production-build'
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...(building && { max: 2 }) }) })
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
