import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { safeReturnPath } from '@/server/auth/accounts'
import { AuthCard, FormSkeleton } from '../AuthCard'
import { LoginForm } from '../AuthForms'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage({ searchParams }: PageProps<'/account/login'>) {
  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to Divine Mantra?{' '}
          <Link href="/account/register" className="text-maroon-800 underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        {searchParams.then(({ next }) => (
          <LoginForm next={typeof next === 'string' ? safeReturnPath(next) : undefined} />
        ))}
      </Suspense>
    </AuthCard>
  )
}
