import { createHash, randomBytes } from 'node:crypto'

/** 256 bits of randomness, URL-safe. Used for session and email tokens. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Tokens are stored only as hashes, so a database leak does not leak live sessions or reset links. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
