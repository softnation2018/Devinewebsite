import Link from 'next/link'
import { Motif } from '@/components/Motif'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-xs tracking-[0.3em] text-stone uppercase">Error 404</p>
      <h1 className="mt-3 font-serif text-4xl text-maroon-900">This page could not be found</h1>
      <Motif className="mt-5" />
      <p className="mt-5 text-sm text-stone">
        The link may be old, or the product may no longer be available.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-sm bg-maroon-900 px-6 py-2.5 text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800">
          Go home
        </Link>
        <Link href="/shop" className="rounded-sm border border-maroon-900 px-6 py-2.5 text-sm tracking-[0.12em] text-maroon-900 uppercase hover:bg-maroon-900 hover:text-ivory">
          Browse products
        </Link>
      </div>
    </div>
  )
}
