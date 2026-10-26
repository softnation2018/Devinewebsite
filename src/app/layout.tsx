import type { Metadata } from 'next'
import { Cormorant_Garamond, Inter } from 'next/font/google'
import './globals.css'

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Divine Mantra | Spiritual, Devotional & Vastu Products',
    template: '%s | Divine Mantra',
  },
  description:
    'Yantras, rudraksha, malas, bracelets and devotional products from Divine Mantra, described honestly and shipped across India.',
  openGraph: { siteName: 'Divine Mantra', locale: 'en_IN', type: 'website' },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IN" className={`${cormorant.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-gold-300 focus:px-3 focus:py-2 focus:text-maroon-950"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
