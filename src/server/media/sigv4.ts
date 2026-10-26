// AWS Signature Version 4, the request signing that Cloudflare R2's
// S3-compatible API uses. Small enough to write out rather than pull in the
// whole AWS SDK. Tested against the worked example in the AWS S3 docs.

import { createHash, createHmac } from 'node:crypto'

export type SignInput = {
  method: string
  url: URL
  headers: Record<string, string>
  payloadHash: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  service: string
  date: Date
}

export const sha256Hex = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest()

/** RFC 3986 encoding, as S3 expects for each path segment. */
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** Returns the headers to send: the given ones plus x-amz-date, x-amz-content-sha256 and Authorization. */
export function signRequest(input: SignInput): Record<string, string> {
  const amzDate = input.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const day = amzDate.slice(0, 8)
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host: input.url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': input.payloadHash,
  }
  const names = Object.keys(headers).sort()
  const canonicalPath = input.url.pathname
    .split('/')
    .map((seg) => encode(decodeURIComponent(seg)))
    .join('/')
  const canonicalQuery = [...input.url.searchParams.entries()]
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .sort()
    .join('&')
  const canonicalRequest = [
    input.method,
    canonicalPath,
    canonicalQuery,
    names.map((n) => `${n}:${headers[n]}\n`).join(''),
    names.join(';'),
    input.payloadHash,
  ].join('\n')
  const scope = `${day}/${input.region}/${input.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), 'aws4_request')
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex')
  // fetch sets Host itself; it was signed above.
  const sent: Record<string, string> = { ...headers }
  delete sent.host
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  }
}
