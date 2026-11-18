import type { Envelope, Me, Policy, Transport, TransportRequest, TransportResponse } from '../types'
import { admins, grantsOf, policy as policyRec, resetDirectory } from './directory'
import { handleAccess } from './access'
import { handleDomain, resetDomain } from './domain'
import { handlePeople, resetPeople } from './people'
import { handleFinance, resetFinance } from './finance'
import { handleMoney, resetMoney } from './money'

/**
 * In-memory stand-in for the admin API. It follows the contract proposed in
 * docs/backend-requirements (01 and 07): three-factor sign-in, refresh, idle
 * and absolute limits, step-up, groups with dependencies. Where the real
 * backend does not exist yet, this file is the executable specification.
 */

export const MOCK_POLICY: Policy = {
  idleMs: 15 * 60_000,
  absoluteMs: 8 * 3_600_000,
  accessTokenMs: 10 * 60_000,
  warnMs: 2 * 60_000,
  stepUpMs: 5 * 60_000,
}

interface MockSession {
  email: string
  token: string
  refresh: string
  tokenExpiresAt: number
  idleExpiresAt: number
  absoluteExpiresAt: number
  elevatedUntil: number
  stepUpFails: number
  ended: boolean
}

const challenges = new Map<string, { email: string; passwordOk: boolean }>()
const sessions = new Map<string, MockSession>()
const failures = new Map<string, number>()

export function resetMock() {
  resetDirectory()
  resetDomain()
  resetMoney()
  resetPeople()
  resetFinance()
  challenges.clear()
  sessions.clear()
  failures.clear()
}

const ok = (info: unknown, status = 200): TransportResponse => ({
  status,
  body: { status, message: 'OK', info },
})
const fail = (status: number, code: string, info?: unknown): TransportResponse => ({
  status,
  body: { status, message: code, code, info, request_id: crypto.randomUUID() } as Envelope,
})

const mePayload = (email: string): Me => ({ email, groups: (admins[email]?.groups ?? []).map((g) => g.id), grants: grantsOf(email) })

const tokenFor = (n: number) => `mock-${n}-${crypto.randomUUID()}`

function startSession(email: string): MockSession {
  const now = Date.now()
  const s: MockSession = {
    email, token: tokenFor(1), refresh: tokenFor(2),
    tokenExpiresAt: now + MOCK_POLICY.accessTokenMs,
    idleExpiresAt: now + MOCK_POLICY.idleMs,
    absoluteExpiresAt: now + MOCK_POLICY.absoluteMs,
    elevatedUntil: now + MOCK_POLICY.stepUpMs, // the sign-in counts as an authenticator check
    stepUpFails: 0, ended: false,
  }
  sessions.set(s.token, s)
  return s
}

function signInInfo(s: MockSession) {
  return {
    access_token: s.token,
    expires_at: s.tokenExpiresAt,
    idle_expires_at: s.idleExpiresAt,
    absolute_expires_at: s.absoluteExpiresAt,
    elevated_until: s.elevatedUntil,
    policy: MOCK_POLICY,
    me: mePayload(s.email),
  }
}

async function handle(req: TransportRequest): Promise<TransportResponse> {
  const now = Date.now()
  const body = (req.body ?? {}) as Record<string, string>

  // --- public sign-in ---
  if (req.method === 'POST' && req.path === '/admin/auth/login') {
    const email = String(body.email ?? '').toLowerCase()
    const key = email || 'x'
    if ((failures.get(key) ?? 0) >= 5) return fail(429, 'rate_limited')
    const acct = admins[email]
    const passwordOk = !!acct && acct.status === 'active' && acct.password === body.password && String(body.password).length >= 14
    if (!passwordOk) failures.set(key, (failures.get(key) ?? 0) + 1)
    const id = crypto.randomUUID()
    challenges.set(id, { email, passwordOk })
    return ok({ challenge: id }) // identical for known and unknown accounts
  }
  if (req.method === 'POST' && req.path === '/admin/auth/verify') {
    const ch = challenges.get(String(body.challenge))
    challenges.delete(String(body.challenge))
    const codesOk = /^\d{6}$/.test(String(body.email_code)) && /^\d{6}$/.test(String(body.totp)) && body.totp !== '000000'
    if (!ch || !ch.passwordOk || !codesOk) return fail(401, 'code_invalid')
    failures.delete(ch.email)
    admins[ch.email].last_sign_in_at = new Date().toISOString()
    return ok({ ...signInInfo(startSession(ch.email)), password_expired: !!admins[ch.email].mustChangePassword })
  }
  if (req.method === 'POST' && req.path === '/admin/auth/password-reset') {
    return ok({ message: 'accepted', delay_hours: 24, hold_hours: 12 }, 202)
  }
  if (req.method === 'POST' && req.path === '/admin/auth/refresh') {
    const s = sessions.get(String(body.refresh_token ?? req.token ?? ''))
    if (!s || s.ended) return fail(401, 'session_inactive')
    return refresh(s)
  }

  // --- authenticated ---
  const s = req.token ? sessions.get(req.token) : undefined
  if (!req.token) return fail(401, 'token_missing')
  if (!s || s.ended) return fail(401, 'session_inactive')
  if (now > s.absoluteExpiresAt || now > s.idleExpiresAt) {
    s.ended = true
    return fail(401, 'session_inactive')
  }
  if (now > s.tokenExpiresAt) return fail(401, 'token_invalid', { expired: true })
  const rec = admins[s.email]
  if (!rec || rec.status !== 'active') { s.ended = true; return fail(401, 'admin_inactive') }
  if (req.method === 'POST' && req.path === '/admin/auth/password-change') {
    const next = String((req.body as { new_password?: string })?.new_password ?? '')
    const cur = String((req.body as { current_password?: string })?.current_password ?? '')
    if (cur !== rec.password) return fail(403, 'password_invalid')
    const errors: Record<string, string> = {}
    if (next.length < policyRec.password.min_length) errors.new_password = `at least ${policyRec.password.min_length} characters`
    else if (next === rec.password || new Set(next).size < 5) errors.new_password = 'is too weak or was used before'
    if (Object.keys(errors).length) return fail(400, 'validation_failed', { errors })
    rec.password = next; rec.mustChangePassword = false; rec.password_changed_at = new Date().toISOString()
    return ok({ sessions_ended: 0 })
  }
  if (rec.mustChangePassword && !['/admin/me', '/admin/logout', '/admin/session/heartbeat'].includes(req.path)) return fail(403, 'password_expired')

  if (req.path === '/admin/session/heartbeat') s.idleExpiresAt = now + MOCK_POLICY.idleMs
  else if (req.path !== '/admin/me') s.idleExpiresAt = now + MOCK_POLICY.idleMs


  switch (`${req.method} ${req.path}`) {
    case 'GET /admin/me':
      return ok({ ...mePayload(s.email), password_expired: !!rec.mustChangePassword, idle_expires_at: s.idleExpiresAt, absolute_expires_at: s.absoluteExpiresAt, elevated_until: s.elevatedUntil })
    case 'POST /admin/session/heartbeat':
      return ok({ idle_expires_at: s.idleExpiresAt })
    case 'POST /admin/step-up': {
      if (!/^\d{6}$/.test(String(body.totp)) || body.totp === '000000') {
        s.stepUpFails++
        if (s.stepUpFails >= 5) { s.ended = true; return fail(401, 'session_inactive') }
        return fail(401, 'code_invalid')
      }
      s.stepUpFails = 0
      s.elevatedUntil = now + MOCK_POLICY.stepUpMs
      return ok({ elevated_until: s.elevatedUntil })
    }
    case 'POST /admin/logout':
      s.ended = true
      return ok({})
    case 'GET /admin/sessions':
      return ok({ sessions: [...sessions.values()].filter((x) => !x.ended && x.email === s.email).map((x) => ({
        id: x.token.slice(0, 12), current: x.token === s.token, device: 'Chrome · Linux', network: '203.0.113.x',
        last_active: x.idleExpiresAt - MOCK_POLICY.idleMs, elevated_until: x.elevatedUntil })) })
  }

  const ctx = { email: s.email, grants: mePayload(s.email).grants, elevated: now <= s.elevatedUntil }
  const domain = handleAccess(req, ctx) ?? handlePeople(req, ctx) ?? handleFinance(req, ctx) ?? handleDomain(req, ctx) ?? handleMoney(req, ctx)
  if (domain) return domain
  return fail(404, 'not_found')
}

function refresh(s: MockSession): TransportResponse {
  const now = Date.now()
  if (now > s.absoluteExpiresAt || now > s.idleExpiresAt) { s.ended = true; return fail(401, 'session_inactive') }
  sessions.delete(s.token)
  s.token = tokenFor(3)
  s.tokenExpiresAt = now + MOCK_POLICY.accessTokenMs
  sessions.set(s.token, s)
  return ok({ access_token: s.token, expires_at: s.tokenExpiresAt, idle_expires_at: s.idleExpiresAt })
}

export const mockTransport: Transport = async (req) => {
  await new Promise((r) => setTimeout(r, 60))
  // Like HTTP: the request and the response are copies, never shared references.
  const res = await handle(structuredClone(req))
  return structuredClone(res)
}
