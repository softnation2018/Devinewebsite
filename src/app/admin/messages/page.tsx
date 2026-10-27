import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import type { InquiryStatus } from '@/generated/prisma/client'
import { can } from '@/server/admin/access'
import { requireCapability } from '@/server/admin/guard'
import { INQUIRY_STATUS_LABEL, INQUIRY_STATUSES, listInquiries } from '@/server/admin/inquiries'
import { AdminHeading, Badge, dateTime } from '../ui'
import { InquiryForm } from './InquiryForm'

export const metadata: Metadata = { title: 'Messages' }

const FILTERS = [{ value: 'ACTIVE', label: 'Needs a reply' }, ...INQUIRY_STATUSES.map((s) => ({ value: s, label: INQUIRY_STATUS_LABEL[s] }))]

export default function MessagesPage({ searchParams }: PageProps<'/admin/messages'>) {
  return (
    <>
      <AdminHeading title="Messages" />
      <p className="mb-4 max-w-2xl text-sm text-stone">Messages sent from the Contact page. Reply to the customer by email, then mark the message as answered.</p>
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        {searchParams.then((sp) => {
          const status = FILTERS.some((f) => f.value === sp.status) ? (sp.status as InquiryStatus | 'ACTIVE') : 'ACTIVE'
          return <Messages status={status} />
        })}
      </Suspense>
    </>
  )
}

async function Messages({ status }: { status: InquiryStatus | 'ACTIVE' }) {
  const user = await requireCapability('orders.view')
  const items = await listInquiries(status)
  const canUpdate = can(user.role, 'orders.update')
  const statuses = INQUIRY_STATUSES.map((s) => ({ value: s, label: INQUIRY_STATUS_LABEL[s] }))
  return (
    <>
      <nav aria-label="Filter" className="mb-6 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/messages?status=${f.value}`}
            aria-current={f.value === status ? 'page' : undefined}
            className="rounded-sm border border-gold-500/40 px-3 py-1 aria-[current=page]:bg-maroon-900 aria-[current=page]:text-ivory"
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-sm text-stone">No messages here.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((m) => (
            <li key={m.id} className="rounded-sm border border-gold-500/30 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{m.subject}</p>
                  <p className="text-stone">
                    {m.name} ·{' '}
                    <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="text-maroon-800 underline">
                      {m.email}
                    </a>
                    {m.phone && <> · {m.phone}</>}
                    {m.orderNumber && <> · Order {m.orderNumber}</>}
                  </p>
                </div>
                <div className="text-right text-xs text-stone">
                  <Badge value={m.status} label={INQUIRY_STATUS_LABEL[m.status]} />
                  <p className="mt-1">{dateTime.format(m.createdAt)}</p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap">{m.message}</p>
              {canUpdate ? (
                <InquiryForm id={m.id} status={m.status} note={m.adminNote ?? ''} statuses={statuses} />
              ) : (
                m.adminNote && <p className="mt-3 text-xs text-stone">Note: {m.adminNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
