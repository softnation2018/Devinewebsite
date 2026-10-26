import 'server-only'
import { notFound } from 'next/navigation'
import { requireStaff } from '../auth/session'
import { type Capability, can } from './access'

/**
 * For every admin page and every admin server action (actions are public
 * endpoints, so each one checks again). Anyone without the capability gets
 * a 404, so the admin area is not advertised.
 */
export async function requireCapability(capability: Capability) {
  const user = await requireStaff()
  if (!can(user.role, capability)) notFound()
  return user
}
