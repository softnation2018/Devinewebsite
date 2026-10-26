import { Motif } from './Motif'

export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8 text-center">
      <h2 className="font-serif text-3xl text-maroon-900 sm:text-4xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-2 max-w-xl text-sm text-stone">{subtitle}</p>}
      <Motif className="mt-4" />
    </div>
  )
}
