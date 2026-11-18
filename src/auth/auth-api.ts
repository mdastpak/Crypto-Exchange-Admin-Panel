import { api } from '@/api/client'
import type { Me, Policy } from '@/api/types'
import { normalizeDigits } from '@/lib/digits'
import { broadcast } from './tab-sync'
import { useSession } from './session-store'

interface SignInInfo {
  access_token: string
  expires_at: number
  idle_expires_at: number
  absolute_expires_at: number
  elevated_until: number
  policy: Policy
  me: Me
}

/** Step 1: password. The answer is the same for known and unknown accounts. */
export const login = (email: string, password: string) =>
  api.post<{ challenge: string }>('/admin/auth/login', { email: email.trim(), password })

/** Step 2: email code and TOTP. Starts the in-memory session. */
export async function verify(challenge: string, emailCode: string, totp: string) {
  const info = await api.post<SignInInfo>('/admin/auth/verify', {
    challenge,
    email_code: normalizeDigits(emailCode).trim(),
    totp: normalizeDigits(totp).trim(),
  })
  useSession.getState().start({
    token: info.access_token,
    tokenExpiresAt: info.expires_at,
    me: info.me,
    policy: info.policy,
    idleExpiresAt: info.idle_expires_at,
    absoluteExpiresAt: info.absolute_expires_at,
    elevatedUntil: info.elevated_until,
  })
}

export const requestPasswordReset = (email: string) =>
  api.post<{ delay_hours: number; hold_hours: number }>('/admin/auth/password-reset', { email: email.trim() })

export async function stepUp(totp: string) {
  const r = await api.post<{ elevated_until: number }>(
    '/admin/step-up',
    { totp: normalizeDigits(totp).trim() },
    { skipStepUp: true }
  )
  useSession.getState().setElevated(r.elevated_until)
}

export async function heartbeat() {
  const r = await api.post<{ idle_expires_at: number }>('/admin/session/heartbeat')
  useSession.getState().setIdle(r.idle_expires_at)
  broadcast({ type: 'idle', idleExpiresAt: r.idle_expires_at })
}

export async function refreshToken() {
  const r = await api.post<{ access_token: string; expires_at: number; idle_expires_at: number }>(
    '/admin/auth/refresh',
    { refresh_token: useSession.getState().token }
  )
  useSession.getState().setToken(r.access_token, r.expires_at)
  useSession.getState().setIdle(r.idle_expires_at)
  broadcast({ type: 'token', token: r.access_token, expiresAt: r.expires_at })
}

export async function signOut() {
  try {
    await api.post('/admin/logout')
  } catch {
    // The session is ended locally either way.
  }
  endSession('signed_out')
}

/** End the session in this tab and in the others. */
export function endSession(reason: 'idle' | 'absolute' | 'revoked' | 'signed_out') {
  useSession.getState().end(reason)
  broadcast({ type: 'end', reason })
}
