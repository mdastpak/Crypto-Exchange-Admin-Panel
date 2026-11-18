import { type Grants } from '@/access/catalog'
import { applyDependencies, levelIndex } from '@/access/dependencies'
import type { Envelope, Me, Policy, Transport, TransportRequest, TransportResponse } from '../types'
import { handleDomain, resetDomain } from './domain'
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

const ALL: Grants = {
  tickets: 'edit', users: 'view', kyc: 'approve', withdrawals: 'approve', transactions: 'view',
  requests: 'view', system_health: 'view', restrictions: 'edit', currencies: 'manage',
  platform: 'manage', audit: 'view', access: 'manage', markets: 'edit', prices: 'approve',
  payouts: 'edit', integrity: 'approve', venues: 'approve', otc: 'edit', notifications: 'edit',
}

export const groups: Record<string, { name: string; version: number; grants: Grants }> = {
  super_admin: { name: 'super_admin', version: 1, grants: ALL },
  support_agent: {
    name: 'support_agent', version: 3,
    grants: applyDependencies({ tickets: 'edit', restrictions: 'request', transactions: 'status' }).grants,
  },
  finance_analyst: {
    name: 'finance_analyst', version: 2,
    grants: applyDependencies({ withdrawals: 'view', transactions: 'view', currencies: 'view', markets: 'view', prices: 'view', payouts: 'view', audit: 'view' }).grants,
  },
  finance_manager: {
    name: 'finance_manager', version: 2,
    grants: applyDependencies({ withdrawals: 'approve', currencies: 'view', audit: 'view', payouts: 'edit', venues: 'approve' }).grants,
  },
}

const ADMINS: Record<string, { password: string; groups: string[] }> = {
  'ali@exchange.example': { password: 'correct horse battery staple', groups: ['super_admin'] },
  'sara@exchange.example': { password: 'correct horse battery staple', groups: ['support_agent'] },
  'nima@exchange.example': { password: 'correct horse battery staple', groups: ['super_admin'] },
  'reza@exchange.example': { password: 'correct horse battery staple', groups: ['finance_manager'] },
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
  resetDomain()
  resetMoney()
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

const mePayload = (email: string): Me => {
  const gs = ADMINS[email]?.groups ?? []
  const grants: Grants = {}
  for (const g of gs) {
    for (const [r, l] of Object.entries(groups[g]?.grants ?? {})) {
      grants[r] = levelIndex(r, l) > levelIndex(r, grants[r] ?? 'none') ? l : (grants[r] ?? l)
    }
  }
  return { email, groups: gs, grants }
}
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

const sensitive = (req: TransportRequest) => req.method === 'PUT' && /^\/admin\/access\/groups\//.test(req.path)

async function handle(req: TransportRequest): Promise<TransportResponse> {
  const now = Date.now()
  const body = (req.body ?? {}) as Record<string, string>

  // --- public sign-in ---
  if (req.method === 'POST' && req.path === '/admin/auth/login') {
    const email = String(body.email ?? '').toLowerCase()
    const key = email || 'x'
    if ((failures.get(key) ?? 0) >= 5) return fail(429, 'rate_limited')
    const acct = ADMINS[email]
    const passwordOk = !!acct && acct.password === body.password && String(body.password).length >= 14
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
    return ok(signInInfo(startSession(ch.email)))
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

  if (req.path === '/admin/session/heartbeat') s.idleExpiresAt = now + MOCK_POLICY.idleMs
  else if (req.path !== '/admin/me') s.idleExpiresAt = now + MOCK_POLICY.idleMs

  if (sensitive(req) && now > s.elevatedUntil) {
    return fail(403, 'step_up_required', { step_up: '/admin/step-up' })
  }

  switch (`${req.method} ${req.path}`) {
    case 'GET /admin/me':
      return ok({ ...mePayload(s.email), idle_expires_at: s.idleExpiresAt, absolute_expires_at: s.absoluteExpiresAt, elevated_until: s.elevatedUntil })
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
    case 'GET /admin/access/groups':
      return ok({ groups: Object.entries(groups).map(([id, g]) => ({ id, version: g.version, grants: g.grants })) })
  }

  const m = /^\/admin\/access\/groups\/([\w-]+)$/.exec(req.path)
  if (m && req.method === 'PUT') {
    const mine = mePayload(s.email).grants
    if (mine.access !== 'manage') return fail(403, 'permission_denied', { required: 'access:manage' })
    const g = groups[m[1]]
    if (!g) return fail(404, 'not_found')
    const grants = (req.body as { grants?: Grants })?.grants ?? {}
    const { added } = applyDependencies(grants)
    if (added.length) return fail(422, 'dependency_missing', { missing: added })
    return ok({ status: 'pending_second_approval', group: m[1], requested_by: s.email }, 202)
  }
  const ctx = { email: s.email, grants: mePayload(s.email).grants, elevated: now <= s.elevatedUntil }
  const domain = handleDomain(req, ctx) ?? handleMoney(req, ctx)
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
