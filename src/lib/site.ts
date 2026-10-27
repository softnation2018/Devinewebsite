// Public site address and whether search engines may index it.

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * Indexing is off unless ALLOW_INDEXING is exactly "true". A preview or
 * staging copy (with demo products and unreviewed policies) should never
 * appear in Google by accident; the owner turns it on at launch.
 */
export function indexingAllowed(): boolean {
  return process.env.ALLOW_INDEXING === 'true'
}
