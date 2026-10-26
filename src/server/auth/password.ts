import { randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

// Argon2id with the library defaults (19 MiB memory, 2 passes), which meet
// the OWASP minimum recommendation. The parameters are stored inside each
// hash, so they can be raised later without invalidating old passwords.

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  return null
}

export function hashPassword(password: string): Promise<string> {
  return hash(password)
}

// When the email is unknown we still verify against a real hash of a random
// string, so a failed login takes the same time either way and response
// timing does not reveal which emails have accounts.
let dummyHash: Promise<string> | null = null
function getDummyHash() {
  dummyHash ??= hash(randomBytes(16).toString('hex'))
  return dummyHash
}

export async function verifyPassword(storedHash: string | null | undefined, password: string): Promise<boolean> {
  try {
    return await verify(storedHash ?? (await getDummyHash()), password)
  } catch {
    return false
  }
}
