import type { UserRole } from '@/generated/prisma/client'

// What each staff role may do. Customers can do none of it.
export const CAPABILITIES = {
  'dashboard.view': 'STAFF',
  'orders.view': 'STAFF',
  'orders.update': 'STAFF',
  'orders.cancel': 'ADMIN',
  'settings.edit': 'OWNER',
  'audit.view': 'ADMIN',
} as const satisfies Record<string, UserRole>

export type Capability = keyof typeof CAPABILITIES

const RANK: Record<UserRole, number> = { CUSTOMER: 0, STAFF: 1, ADMIN: 2, OWNER: 3 }

export function can(role: UserRole | null | undefined, capability: Capability): boolean {
  return role !== null && role !== undefined && RANK[role] >= RANK[CAPABILITIES[capability]]
}
