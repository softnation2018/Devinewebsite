import type { Metadata } from 'next'
import { Suspense } from 'react'
import { paiseToRupeeInput } from '@/lib/money'
import { requireCapability } from '@/server/admin/guard'
import { listSettings, SETTING_KINDS } from '@/server/admin/settings'
import { AdminHeading } from '../ui'
import { SettingForm, type SettingView } from './SettingForm'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
  return (
    <>
      <AdminHeading title="Store settings" />
      <p className="mb-6 max-w-3xl text-sm text-stone">
        These are business decisions. Placeholders were filled in so the shop could be built; nothing here is decided until you save it. Check tax and legal
        details with your CA before saving them.
      </p>
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        <Settings />
      </Suspense>
    </>
  )
}

function toView(row: { key: string; value: unknown; description: string | null; needsOwnerDecision: boolean }): SettingView {
  const kind = SETTING_KINDS[row.key]
  const v = row.value
  return {
    key: row.key,
    description: row.description,
    needsOwnerDecision: row.needsOwnerDecision,
    kind: kind.type,
    current: typeof v === 'number' && (kind.type === 'money' || kind.type === 'moneyOrNone') ? paiseToRupeeInput(v) : v === null || v === undefined ? '' : String(v),
    checked: v === true,
    options: kind.type === 'choice' ? kind.options : undefined,
    hint: kind.type === 'text' ? kind.patternHint : kind.type === 'moneyOrNone' ? 'Leave empty for never.' : undefined,
  }
}

async function Settings() {
  await requireCapability('settings.edit')
  const rows = await listSettings()
  const groups = [
    ['Shipping', 'shipping.'],
    ['Delivery and prepaid discounts', ['delivery.', 'prepaid.']],
    ['Cash on Delivery', 'cod.'],
    ['Returns and cancellation', ['returns.', 'cancellation.']],
    ['Tax', 'tax.'],
    ['Business details', 'business.'],
    ['Customer support', 'support.'],
  ] as const
  return (
    <div className="space-y-8">
      {groups.map(([title, prefix]) => {
        const prefixes: readonly string[] = typeof prefix === 'string' ? [prefix] : prefix
        const items = rows.filter((r) => prefixes.some((p) => r.key.startsWith(p)))
        if (items.length === 0) return null
        return (
          <section key={title} className="rounded-sm border border-gold-500/30 bg-white px-5">
            <h2 className="pt-4 font-serif text-xl text-maroon-900">{title}</h2>
            <div className="divide-y divide-gold-500/20">
              {items.map((r) => (
                <SettingForm key={r.key} s={toView(r)} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
