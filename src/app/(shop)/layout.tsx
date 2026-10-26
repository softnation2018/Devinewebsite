import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'

export default function ShopLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  )
}
