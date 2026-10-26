import type { ReactNode } from 'react'
import { Motif } from './Motif'

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="bg-ivory px-4 py-12 text-center sm:px-6">
      <h1 className="font-serif text-4xl text-maroon-900 sm:text-5xl">{title}</h1>
      {children && <div className="mx-auto mt-3 max-w-2xl text-sm text-stone">{children}</div>}
      <Motif className="mt-5" />
    </div>
  )
}
