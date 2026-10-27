import 'server-only'
import type { InquiryStatus } from '@/generated/prisma/client'
import { db } from '../db'
import { recordAudit } from './audit'

export const INQUIRY_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const satisfies readonly InquiryStatus[]

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  OPEN: 'New',
  IN_PROGRESS: 'Replying',
  RESOLVED: 'Answered',
  CLOSED: 'Closed',
}

export async function listInquiries(status: InquiryStatus | 'ACTIVE') {
  return db.supportInquiry.findMany({
    where: status === 'ACTIVE' ? { status: { in: ['OPEN', 'IN_PROGRESS'] } } : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, name: true, email: true, phone: true, orderNumber: true, subject: true, message: true, status: true, adminNote: true, createdAt: true },
  })
}

export async function updateInquiry(id: string, status: InquiryStatus, note: string, actor: { id: string; ip: string | null }) {
  return db.$transaction(async (tx) => {
    const before = await tx.supportInquiry.findUnique({ where: { id }, select: { status: true, adminNote: true } })
    if (!before) return { ok: false as const, error: 'Message not found.' }
    const adminNote = note.trim() || null
    if (before.status === status && before.adminNote === adminNote) return { ok: true as const }
    await tx.supportInquiry.update({ where: { id }, data: { status, adminNote } })
    await recordAudit(tx, {
      actorUserId: actor.id,
      ipAddress: actor.ip,
      action: 'inquiry.update',
      entityType: 'SupportInquiry',
      entityId: id,
      before: { status: before.status, hasNote: before.adminNote !== null },
      after: { status, hasNote: adminNote !== null },
    })
    return { ok: true as const }
  })
}
