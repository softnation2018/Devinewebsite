import { db } from './db'

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number }

/**
 * Counts one attempt against `key` and says whether it is within `limit`
 * attempts per `windowSeconds`. A single SQL statement does the read and
 * the write, so concurrent requests cannot both slip under the limit.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now()
        ELSE "RateLimit"."windowStart"
      END
    RETURNING "count", "windowStart"
  `
  const { count, windowStart } = rows[0]
  const resetAt = windowStart.getTime() + windowSeconds * 1000
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt - Date.now()) / 1000)),
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } })
}
