import type { Prisma } from '@/generated/prisma/client'

export type AuditEntry = {
  actorUserId: string | null // null: a guest customer acting on their own order
  action: string
  entityType: string
  entityId: string
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
  ipAddress?: string | null
}

/** Written in the same transaction as the change it describes. */
export async function recordAudit(tx: Prisma.TransactionClient, entry: AuditEntry) {
  await tx.auditLog.create({ data: { ...entry, ipAddress: entry.ipAddress?.slice(0, 64) ?? null } })
}
