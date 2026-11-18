import { API_BASE } from '@/lib/env'
import type { SealedEnvelope } from '@/crypto/seal'
import type { Envelope, Transport } from './types'

const SEALED_TYPE = 'application/vnd.cex.sealed+json'

/** Talks to the real backend. Only this file calls `fetch`. */
export const httpTransport: Transport = async ({ method, path, body, sealedBody, requestId, token, signal }) => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-ID': requestId ?? crypto.randomUUID(),
    'X-Locale': document.documentElement.lang || 'fa',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (sealedBody) headers['Content-Type'] = SEALED_TYPE
  else if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (sealedBody) headers.Accept = `${SEALED_TYPE}, application/json`
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: sealedBody ? JSON.stringify(sealedBody) : body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal,
  })
  const sealedAnswer = (res.headers.get('Content-Type') ?? '').startsWith(SEALED_TYPE)
  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    parsed = { status: res.status, message: res.statusText }
  }
  if (sealedAnswer) return { status: res.status, body: { status: res.status, message: '' }, sealed: parsed as SealedEnvelope }
  return { status: res.status, body: parsed as Envelope }
}
