import { ProviderRejected, ProviderUnknown } from './types'

/**
 * POST or GET JSON with a timeout. A 4xx answer is a refusal (nothing was
 * created); anything else that goes wrong leaves the outcome unknown.
 */
export async function callJson(url: string, init: { method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>; timeoutMs?: number }): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    })
  } catch (e) {
    throw new ProviderUnknown(`No answer from the courier (${e instanceof Error ? e.name : 'network error'}).`)
  }
  const text = await res.text().catch(() => '')
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Left null; handled below.
  }
  if (res.status >= 400 && res.status < 500) {
    throw new ProviderRejected(`The courier refused the request (HTTP ${res.status})${messageOf(json) ? `: ${messageOf(json)}` : '.'}`)
  }
  if (!res.ok || json === null) throw new ProviderUnknown(`Unexpected answer from the courier (HTTP ${res.status}).`)
  return json
}

export function messageOf(json: unknown): string | null {
  if (json && typeof json === 'object') {
    for (const k of ['message', 'html_message', 'remark', 'error']) {
      const v = (json as Record<string, unknown>)[k]
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300)
    }
  }
  return null
}

export const rupees = (paise: number) => Math.round(paise) / 100
