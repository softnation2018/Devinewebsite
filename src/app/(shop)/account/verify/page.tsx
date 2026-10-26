import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FormAlert } from '@/components/forms'
import { AuthCard, FormSkeleton } from '../AuthCard'
import { ConfirmEmailForm } from '../AuthForms'

export const metadata: Metadata = { title: 'Confirm your email', referrer: 'no-referrer' }

export default function VerifyPage({ searchParams }: PageProps<'/account/verify'>) {
  return (
    <AuthCard title="Confirm your email">
      <Suspense fallback={<FormSkeleton />}>
        {searchParams.then(({ token }) =>
          typeof token === 'string' && token ? (
            <ConfirmEmailForm token={token} />
          ) : (
            <FormAlert error="This confirmation link is incomplete. Please open the link from your email again." />
          ),
        )}
      </Suspense>
    </AuthCard>
  )
}
