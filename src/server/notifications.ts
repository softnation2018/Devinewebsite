import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { formatPaise } from '@/lib/money'
import { siteUrl } from '@/lib/site'
import { db } from './db'
import { sendEmail } from './email'

// Emails to customers about their order. They are queued as Job rows inside
// the same transaction as the change they describe, so an email goes out
// only for a change that was really saved, and a failed send is retried.
// The text is built when the email is sent, from what the database says then.

export type CustomerEmail =
  | { kind: 'order_shipped'; orderId: string }
  | { kind: 'order_delivered'; orderId: string }
  | { kind: 'order_cancelled'; orderId: string }
  | { kind: 'refund_completed'; orderId: string; refundId: string }
  | { kind: 'return_update'; orderId: string; returnId: string }

const MAX_ATTEMPTS = 5

export async function queueCustomerEmail(tx: Prisma.TransactionClient, email: CustomerEmail) {
  await tx.job.create({ data: { kind: `email.${email.kind}`, payload: email as unknown as Prisma.InputJsonValue, maxAttempts: MAX_ATTEMPTS } })
}

type Rendered = { to: string; subject: string; text: string } | null

/** Builds the email, or null when there is nothing to say any more (or nobody to tell). */
export async function renderCustomerEmail(email: CustomerEmail): Promise<Rendered> {
  const order = await db.order.findUnique({
    where: { id: email.orderId },
    select: {
      orderNumber: true,
      status: true,
      userId: true,
      guestEmail: true,
      user: { select: { email: true, name: true } },
      shipments: {
        where: { status: { notIn: ['DRAFT', 'REQUESTED', 'FAILED', 'CANCELLED'] }, awbNumber: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { courierName: true, awbNumber: true, trackingUrl: true },
      },
    },
  })
  const to = order?.user?.email ?? order?.guestEmail
  if (!order || !to) return null

  const link = `${siteUrl()}/order/${order.orderNumber}`
  const view = order.userId
    ? `See your order:\n${link}`
    : `See your order with the link in your order confirmation email, or here on the device you ordered from:\n${link}`
  const hello = `Namaste${order.user?.name ? ` ${order.user.name.split(/\s+/)[0]}` : ''},`
  const sign = 'Divine Mantra'
  const n = order.orderNumber

  switch (email.kind) {
    case 'order_shipped': {
      const s = order.shipments[0]
      const tracking = s ? `\n\n${s.courierName ? `Courier: ${s.courierName}\n` : ''}Tracking number: ${s.awbNumber}${s.trackingUrl ? `\nTrack it: ${s.trackingUrl}` : ''}` : ''
      return { to, subject: `Order ${n} is on its way`, text: `${hello}\n\nYour order ${n} has been handed to the courier.${tracking}\n\n${view}\n\n${sign}` }
    }
    case 'order_delivered':
      if (order.status !== 'DELIVERED') return null
      return { to, subject: `Order ${n} delivered`, text: `${hello}\n\nThe courier reports that order ${n} has been delivered. If anything is wrong with it, please reply to this email or contact us.\n\n${view}\n\n${sign}` }
    case 'order_cancelled':
      return {
        to,
        subject: `Order ${n} cancelled`,
        text: `${hello}\n\nYour order ${n} has been cancelled. If you paid online, the refund will be shown on your order page once it has been issued. If you have any questions, please reply to this email.\n\n${view}\n\n${sign}`,
      }
    case 'refund_completed': {
      const r = await db.refund.findUnique({ where: { id: email.refundId }, select: { amountPaise: true, status: true, method: true } })
      if (!r || r.status !== 'COMPLETED') return null
      const how = r.method === 'razorpay' ? 'to your original payment method' : r.method === 'upi' ? 'by UPI' : 'by bank transfer'
      return {
        to,
        subject: `Refund for order ${n}`,
        text: `${hello}\n\nWe have refunded ${formatPaise(r.amountPaise)} ${how} for order ${n}. Banks can take several working days to show it in your account.\n\n${view}\n\n${sign}`,
      }
    }
    case 'return_update': {
      const r = await db.return.findUnique({ where: { id: email.returnId }, select: { status: true, adminNote: true, awbNumber: true } })
      if (!r) return null
      if (r.status === 'APPROVED')
        return { to, subject: `Return approved for order ${n}`, text: `${hello}\n\nYour return request for order ${n} has been approved. We will tell you how the item will be collected.\n\n${view}\n\n${sign}` }
      if (r.status === 'PICKUP_SCHEDULED')
        return { to, subject: `Return pickup for order ${n}`, text: `${hello}\n\nA pickup has been arranged for your return from order ${n}.${r.awbNumber ? ` Its tracking number is ${r.awbNumber}.` : ''} Please keep the item packed and ready.\n\n${view}\n\n${sign}` }
      if (r.status === 'REJECTED')
        return { to, subject: `Return request for order ${n}`, text: `${hello}\n\nWe are sorry, we cannot accept the return request for order ${n}.${r.adminNote ? `\n\n${r.adminNote}` : ''}\n\nIf you have questions, please reply to this email.\n\n${view}\n\n${sign}` }
      if (r.status === 'RECEIVED')
        return { to, subject: `Return received for order ${n}`, text: `${hello}\n\nWe have received your returned item from order ${n}. Any refund due will be shown on your order page once it has been issued.\n\n${view}\n\n${sign}` }
      return null
    }
  }
}

/**
 * Sends queued emails. Rows are claimed with SKIP LOCKED, so two runners
 * never send the same email; a runner that died mid-send frees its rows
 * after ten minutes. Failures are retried with a growing delay.
 */
export async function runEmailJobs(limit = 20): Promise<{ sent: number; failed: number }> {
  const rows = await db.$queryRaw<{ id: string; payload: CustomerEmail; attempts: number; maxAttempts: number; createdAt: Date }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE kind LIKE 'email.%'
        AND ((status = 'QUEUED' AND "runAfter" <= now()) OR (status = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes'))
      ORDER BY "runAfter", "createdAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload, attempts, "maxAttempts", "createdAt"`
  // RETURNING has no order; send in the order things happened, so
  // "on its way" never arrives after "delivered".
  const claimed = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))

  let sent = 0
  let failed = 0
  for (const job of claimed) {
    try {
      const email = await renderCustomerEmail(job.payload)
      if (email) {
        const r = await sendEmail(email)
        if (!r.sent) throw new Error('email provider did not accept the message')
        sent++
      }
      await db.job.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', lockedAt: null, lastError: null } })
    } catch (e) {
      failed++
      const dead = job.attempts >= job.maxAttempts
      await db.job.update({
        where: { id: job.id },
        data: {
          status: dead ? 'DEAD' : 'QUEUED',
          lockedAt: null,
          lastError: String(e).slice(0, 500),
          runAfter: new Date(Date.now() + 2 ** job.attempts * 60_000),
        },
      })
    }
  }
  return { sent, failed }
}
