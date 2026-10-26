import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { FormAlert } from '@/components/forms'
import { AuthCard, FormSkeleton } from '../AuthCard'
import { ResetPasswordForm } from '../AuthForms'

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' }

export default function ResetPasswordPage({ searchParams }: PageProps<'/account/reset-password'>) {
  return (
    <AuthCard
      title="Choose a new password"
      footer={
        <Link href="/account/forgot-password" className="text-maroon-800 underline underline-offset-2">
          Request a new link
        </Link>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        {searchParams.then(({ token }) =>
          typeof token === 'string' && token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <FormAlert error="This reset link is incomplete. Please open the link from your email again, or request a new one." />
          ),
        )}
      </Suspense>
    </AuthCard>
  )
}
