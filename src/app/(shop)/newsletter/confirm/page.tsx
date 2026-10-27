import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FormAlert } from '@/components/forms'
import { AuthCard, FormSkeleton } from '../../account/AuthCard'
import { TokenForm } from '../../contact/PublicForms'

export const metadata: Metadata = { title: 'Confirm your newsletter sign-up', referrer: 'no-referrer', robots: { index: false } }

// The link only opens this page. Nothing changes until the button is pressed,
// so email scanners that open links cannot confirm on someone's behalf.
export default function NewsletterConfirmPage({ searchParams }: PageProps<'/newsletter/confirm'>) {
  return (
    <AuthCard title="Confirm your newsletter sign-up">
      <Suspense fallback={<FormSkeleton />}>
        {searchParams.then(({ token }) =>
          typeof token === 'string' && token ? (
            <TokenForm token={token} kind="confirm" />
          ) : (
            <FormAlert error="This link is incomplete. Please open the link from your email again." />
          ),
        )}
      </Suspense>
    </AuthCard>
  )
}
