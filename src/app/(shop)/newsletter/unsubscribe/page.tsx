import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FormAlert } from '@/components/forms'
import { AuthCard, FormSkeleton } from '../../account/AuthCard'
import { TokenForm } from '../../contact/PublicForms'

export const metadata: Metadata = { title: 'Unsubscribe from the newsletter', referrer: 'no-referrer', robots: { index: false } }

// The link only opens this page. Nothing changes until the button is pressed,
// so email scanners that open links cannot unsubscribe on someone's behalf.
export default function NewsletterUnsubscribePage({ searchParams }: PageProps<'/newsletter/unsubscribe'>) {
  return (
    <AuthCard title="Unsubscribe from the newsletter">
      <Suspense fallback={<FormSkeleton />}>
        {searchParams.then(({ token }) =>
          typeof token === 'string' && token ? (
            <TokenForm token={token} kind="unsubscribe" />
          ) : (
            <FormAlert error="This link is incomplete. Please open the link from your email again." />
          ),
        )}
      </Suspense>
    </AuthCard>
  )
}
