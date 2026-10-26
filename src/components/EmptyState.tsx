import Link from 'next/link'

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-serif text-2xl text-maroon-900">{title}</p>
      <p className="mt-2 text-sm text-stone">{body}</p>
      <Link
        href="/shop"
        className="mt-6 inline-block rounded-sm bg-maroon-900 px-6 py-2.5 text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800"
      >
        Browse all products
      </Link>
    </div>
  )
}
