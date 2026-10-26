import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '../AuthCard'
import { RegisterForm } from '../AuthForms'

export const metadata: Metadata = { title: 'Create an account' }

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      intro="Track your orders and save your addresses. You can also check out as a guest without an account."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/account/login" className="text-maroon-800 underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  )
}
