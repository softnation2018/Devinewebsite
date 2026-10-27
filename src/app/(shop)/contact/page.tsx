import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { FormSkeleton } from '../account/AuthCard'
import { getCurrentUser } from '@/server/auth/session'
import { getSupportSettings, whatsappLink } from '@/server/settings'
import { ContactForm } from './PublicForms'

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Questions about a product or an order? Send Divine Mantra a message.',
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact us">Questions about a product or an order? Write to us and we will reply by email.</PageHeader>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_18rem]">
        <section aria-label="Send a message" className="rounded-sm border border-gold-500/30 bg-white p-6 shadow-sm sm:p-8">
          <Suspense fallback={<FormSkeleton />}>
            <SignedInContactForm />
          </Suspense>
        </section>
        <SupportDetails />
      </div>
    </>
  )
}

async function SignedInContactForm() {
  const user = await getCurrentUser()
  return <ContactForm defaultName={user?.name ?? undefined} defaultEmail={user?.email} />
}

// Only details the owner has entered in Admin → Settings are shown.
async function SupportDetails() {
  const s = await getSupportSettings()
  const wa = s.whatsapp ? whatsappLink(s.whatsapp) : null
  if (!s.email && !s.phone && !wa && !s.hours) return null
  return (
    <aside className="space-y-4 text-sm">
      <h2 className="font-serif text-2xl text-maroon-900">Other ways to reach us</h2>
      <dl className="space-y-3">
        {s.email && (
          <div>
            <dt className="text-stone">Email</dt>
            <dd>
              <a href={`mailto:${s.email}`} className="text-maroon-800 underline underline-offset-2">
                {s.email}
              </a>
            </dd>
          </div>
        )}
        {s.phone && (
          <div>
            <dt className="text-stone">Phone</dt>
            <dd>
              <a href={`tel:${s.phone.replace(/[\s-]/g, '')}`} className="text-maroon-800 underline underline-offset-2">
                {s.phone}
              </a>
            </dd>
          </div>
        )}
        {wa && (
          <div>
            <dt className="text-stone">WhatsApp</dt>
            <dd>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="text-maroon-800 underline underline-offset-2">
                {s.whatsapp}
              </a>
            </dd>
          </div>
        )}
        {s.hours && (
          <div>
            <dt className="text-stone">Hours</dt>
            <dd>{s.hours}</dd>
          </div>
        )}
      </dl>
    </aside>
  )
}
