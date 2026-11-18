import { API_BASE } from '@/lib/env'
import type { Envelope, Transport } from './types'

/** Talks to the real backend. Only this file calls `fetch`. */
export const httpTransport: Transport = async ({ method, path, body, token, signal }) => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-ID': crypto.randomUUID(),
    'X-Locale': document.documentElement.lang || 'fa',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal,
  })
  let parsed: Envelope
  try {
    parsed = (await res.json()) as Envelope
  } catch {
    parsed = { status: res.status, message: res.statusText }
  }
  return { status: res.status, body: parsed }
}
