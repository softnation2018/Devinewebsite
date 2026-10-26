import type { Metadata } from 'next'

// Account pages are personal; keep them out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AccountLayout({ children }: LayoutProps<'/account'>) {
  return children
}
