import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'

export function AuthCard({ title, intro, children, footer }: { title: string; intro?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <PageHeader title={title}>{intro}</PageHeader>
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <div className="rounded-sm border border-gold-500/30 bg-white p-6 shadow-sm sm:p-8">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-stone">{footer}</div>}
      </div>
    </>
  )
}

export function FormSkeleton() {
  return <div className="h-64 animate-pulse rounded-sm bg-ivory" aria-hidden="true" />
}
