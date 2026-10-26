import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '../AuthCard'
import { ForgotPasswordForm } from '../AuthForms'

export const metadata: Metadata = { title: 'Forgot password' }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      intro="Enter the email you used for your account and we will send you a link to choose a new password."
      footer={
        <Link href="/account/login" className="text-maroon-800 underline underline-offset-2">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
