import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { FormAlert } from '@/components/forms'
import { ownerExists, ownerSetupTokenValid } from '@/server/auth/owner-setup'
import { AuthCard, FormSkeleton } from '../AuthCard'
import { SetupOwnerForm } from './SetupOwnerForm'

export const metadata: Metadata = { title: 'Set up the owner account', referrer: 'no-referrer', robots: { index: false, follow: false } }

/** One-time page that makes the shop's first owner. See src/server/auth/owner-setup.ts. */
export default function SetupOwnerPage({ searchParams }: PageProps<'/account/setup-owner'>) {
  return (
    <AuthCard title="Set up the owner account" intro="Do this once. After that, sign in like any other time.">
      <Suspense fallback={<FormSkeleton />}>
        {searchParams.then(async ({ token }) => {
          if (await ownerExists()) {
            return (
              <p className="text-sm">
                The shop already has an owner.{' '}
                <Link href="/account/login?next=/admin" className="text-maroon-800 underline underline-offset-2">
                  Sign in
                </Link>
                .
              </p>
            )
          }
          return ownerSetupTokenValid(token) ? <SetupOwnerForm token={token as string} /> : <FormAlert error="This setup link is not valid. Please use the full link you were given." />
        })}
      </Suspense>
    </AuthCard>
  )
}
