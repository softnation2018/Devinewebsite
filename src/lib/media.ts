// Public address of a stored photo. Used by server components; it reads only
// the public base URL, never a credential.

export function mediaUrl(key: string): string {
  const r2 = process.env.MEDIA_STORAGE === 'r2' ? process.env.R2_PUBLIC_URL?.replace(/\/$/, '') : undefined
  return r2 ? `${r2}/${key}` : `/media/${key}`
}

/** Each photo is stored large plus a small copy for product cards. */
export function thumbKey(key: string): string {
  return key.replace(/(\.[a-z]+)$/, '.thumb$1')
}

/** For structured data and social previews, which need a full address. */
export function absoluteMediaUrl(key: string, siteUrl: string): string {
  const url = mediaUrl(key)
  return url.startsWith('/') ? `${siteUrl}${url}` : url
}
