'use server'

import { redirect } from 'next/navigation'
import { clientIp, startSession } from '@/server/auth/session'
import { createFirstOwner } from '@/server/auth/owner-setup'
import { consumeRateLimit } from '@/server/rate-limit'

export type SetupState = { error?: string; email?: string; name?: string }

export async function setupOwner(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v : ''
  }
  const email = str('email')
  const name = str('name')
  if (!(await consumeRateLimit(`owner-setup:${await clientIp()}`, 10, 15 * 60)).allowed) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.', email, name }
  }
  if (str('password') !== str('confirm')) return { error: 'The two passwords do not match.', email, name }
  const r = await createFirstOwner(str('token'), { email, password: str('password'), name })
  if (!r.ok) return { error: r.error, email, name }
  await startSession(r.userId)
  redirect('/admin')
}
