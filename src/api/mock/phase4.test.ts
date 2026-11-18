import { beforeEach, describe, expect, it } from 'vitest'
import { mockTransport, resetMock } from './server'
import { USER_IDS } from './people'

const PW = 'correct horse battery staple'
async function signIn(email: string) {
  const c = await mockTransport({ method: 'POST', path: '/admin/auth/login', body: { email, password: PW } })
  const v = await mockTransport({ method: 'POST', path: '/admin/auth/verify', body: { challenge: (c.body.info as { challenge: string }).challenge, email_code: '123456', totp: '654321' } })
  const info = v.body.info as { access_token: string; password_expired?: boolean }
  return { info, call: (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => mockTransport({ method, path, body, token: info.access_token }) }
}
const info = <T>(r: { body: { info?: unknown } }) => r.body.info as T
const U = USER_IDS[0]

beforeEach(() => resetMock())

describe('users, lookups, and reveal', () => {
  it('returns only the lookup blocks the grants allow', async () => {
    const sara = await signIn('sara@exchange.example') // support: lookups through tickets:edit, no users:view
    const l = info<Record<string, unknown>>(await sara.call('GET', `/admin/users/${U}/lookup`))
    expect(Object.keys(l).sort()).toEqual(['kyc', 'requests', 'system_health', 'transactions', 'user', 'withdrawals'])
    const reza = await signIn('reza@exchange.example') // finance manager: users lookup + kyc status + health, no requests
    const r = info<Record<string, unknown>>(await reza.call('GET', `/admin/users/${U}/lookup`))
    expect(r).not.toHaveProperty('requests')
    expect(r).toHaveProperty('withdrawals')
  })

  it('shows masked profiles and never plaintext identifiers in lists', async () => {
    const { call } = await signIn('sara@exchange.example')
    const page = info<{ items: Record<string, unknown>[] }>(await call('POST', '/admin/users/query', { status: 'ACTIVE' }))
    expect(page.items.length).toBeGreaterThan(3)
    for (const row of page.items) {
      expect(JSON.stringify(row)).not.toMatch(/user\d+@/)
      expect(String(row.email_masked)).toMatch(/\*\*\*/)
    }
  })

  it('finds a user only by an exact email', async () => {
    const { call } = await signIn('sara@exchange.example')
    expect(info<{ items: unknown[] }>(await call('POST', '/admin/users/query', { email: 'user1@mail.example' })).items).toHaveLength(1)
    expect(info<{ items: unknown[] }>(await call('POST', '/admin/users/query', { email: 'user1@mail' })).items).toHaveLength(0)
  })

  it('reveals identity data only with the special permission, a reason, and a step-up', async () => {
    const sara = await signIn('sara@exchange.example')
    expect((await sara.call('POST', `/admin/users/${U}/reveal`, { fields: ['email'], reason: 'x' })).body.code).toBe('permission_denied')
    const mina = await signIn('mina@exchange.example')
    expect((await mina.call('POST', `/admin/users/${U}/reveal`, { fields: ['email'], reason: '' })).status).toBe(400)
    expect((await mina.call('POST', `/admin/users/${U}/reveal`, { fields: ['ssn'], reason: 'x' })).status).toBe(400)
    const ok = await mina.call('POST', `/admin/users/${U}/reveal`, { fields: ['email', 'national_id'], reason: 'KYC check' })
    expect(info<{ values: Record<string, string> }>(ok).values.email).toBe('user1@mail.example')
  })
})

describe('KYC', () => {
  it('requires claiming a case before a decision, and refuses a decision on a closed one', async () => {
    const mina = await signIn('mina@exchange.example')
    const list = info<{ items: { id: string; status: string; assigned_to?: string }[] }>(await mina.call('GET', '/admin/kyc/cases?status=pending'))
    const c = list.items[0]
    expect((await mina.call('POST', `/admin/kyc/cases/${c.id}/decision`, { decision: 'approve', level: 2, reason: 'ok' })).body.code).toBe('conflict')
    expect((await mina.call('POST', `/admin/kyc/cases/${c.id}/claim`)).status).toBe(200)
    expect((await mina.call('POST', `/admin/kyc/cases/${c.id}/decision`, { decision: 'approve', level: 9, reason: 'ok' })).status).toBe(400)
    expect((await mina.call('POST', `/admin/kyc/cases/${c.id}/decision`, { decision: 'approve', level: 2, reason: 'Documents verified' })).status).toBe(200)
    expect((await mina.call('POST', `/admin/kyc/cases/${c.id}/decision`, { decision: 'reject', reason: 'again' })).body.code).toBe('conflict')
  })

  it('gates documents behind their own permission', async () => {
    const reza = await signIn('reza@exchange.example')
    expect((await reza.call('GET', '/admin/kyc/cases/kyc-300/documents/d1')).body.code).toBe('permission_denied')
    const mina = await signIn('mina@exchange.example')
    expect((await mina.call('GET', '/admin/kyc/cases/kyc-300/documents/d1')).status).toBe(200)
  })
})

describe('tickets', () => {
  it('lets support reply, keeps internal notes internal, and refuses a second claimer', async () => {
    const sara = await signIn('sara@exchange.example')
    const open = info<{ items: { id: string; assignee?: string }[] }>(await sara.call('POST', '/admin/tickets/query', { status: 'open' }))
    const free = open.items.find((t) => !t.assignee)!
    expect((await sara.call('POST', `/admin/tickets/${free.id}/claim`)).status).toBe(200)
    expect((await sara.call('POST', `/admin/tickets/${free.id}/messages`, { body: '  ', internal: false })).status).toBe(400)
    const sent = await sara.call('POST', `/admin/tickets/${free.id}/messages`, { body: 'We are checking', internal: true })
    expect(sent.status).toBe(201)
    const detail = info<{ status: string; messages: { internal: boolean }[] }>(await sara.call('GET', `/admin/tickets/${free.id}`))
    expect(detail.status).toBe('open') // an internal note does not change the status
    expect(detail.messages.at(-1)?.internal).toBe(true)
    const ali = await signIn('ali@exchange.example')
    expect((await ali.call('POST', `/admin/tickets/${free.id}/claim`)).body.code).toBe('conflict')
  })

  it('does not let a finance manager read tickets', async () => {
    const reza = await signIn('reza@exchange.example')
    expect((await reza.call('POST', '/admin/tickets/query', {})).body.code).toBe('permission_denied')
  })
})

describe('ledger', () => {
  it('refuses an unbounded query, surfaces unverified rows and unbalanced entries', async () => {
    const reza = await signIn('reza@exchange.example')
    expect((await reza.call('POST', '/admin/ledger/balances/query', {})).status).toBe(400)
    expect((await reza.call('POST', '/admin/ledger/entries/query', {})).status).toBe(400)
    const bal = info<{ items: { verified: boolean }[] }>(await reza.call('POST', '/admin/ledger/balances/query', { currency: 'USDT' }))
    expect(bal.items.some((b) => !b.verified)).toBe(true)
    const ent = info<{ items: { balanced: boolean }[] }>(await reza.call('POST', '/admin/ledger/entries/query', { since: '2020-01-01T00:00:00Z', limit: 200 }))
    expect(ent.items.some((e) => !e.balanced)).toBe(true)
  })

  it('makes only an administrator with ledger:edit start a reconciliation', async () => {
    const reza = await signIn('reza@exchange.example')
    expect((await reza.call('POST', '/admin/ledger/reconciliation/run')).body.code).toBe('permission_denied')
    const ali = await signIn('ali@exchange.example')
    expect((await ali.call('POST', '/admin/ledger/reconciliation/run')).status).toBe(202)
    expect((await ali.call('POST', '/admin/ledger/reconciliation/run')).body.code).toBe('conflict')
  })
})

describe('access, staff, and policy (two-person)', () => {
  it('holds a group change until a second administrator approves it, then applies it with a new version', async () => {
    const ali = await signIn('ali@exchange.example')
    const nima = await signIn('nima@exchange.example')
    const grants = { tickets: 'edit', users: 'lookup', kyc: 'status', withdrawals: 'status', requests: 'status', system_health: 'view', transactions: 'status' }
    const req = await ali.call('PUT', '/admin/access/groups/support_agent', { grants, reason: 'Add transaction states' })
    expect(req.status).toBe(202)
    const id = info<{ id: string }>(req).id
    const before = info<{ items: { id: string; version: number }[] }>(await ali.call('GET', '/admin/access/groups')).items.find((g) => g.id === 'support_agent')!
    expect((await ali.call('POST', `/admin/access/changes/${id}/approve`)).body.code).toBe('second_approval_required')
    expect((await nima.call('POST', `/admin/access/changes/${id}/approve`)).status).toBe(200)
    const after = info<{ items: { id: string; version: number }[] }>(await ali.call('GET', '/admin/access/groups')).items.find((g) => g.id === 'support_agent')!
    expect(after.version).toBe(before.version + 1)
    const versions = info<{ items: { version: number; approved_by?: string }[] }>(await ali.call('GET', '/admin/access/groups/support_agent/versions')).items
    expect(versions[0]).toMatchObject({ version: after.version, approved_by: 'nima@exchange.example' })
  })

  it('refuses a grant set that misses a dependency, and an edit to a system group', async () => {
    const { call } = await signIn('ali@exchange.example')
    const bad = await call('PUT', '/admin/access/groups/support_agent', { grants: { tickets: 'edit' }, reason: 'x' })
    expect(bad.status).toBe(422)
    expect(bad.body.code).toBe('dependency_missing')
    expect((await call('PUT', '/admin/access/groups/super_admin', { grants: {}, reason: 'x' })).body.code).toBe('system_group')
  })

  it('takes effect on the next request once approved: a removed grant is denied', async () => {
    const sara = await signIn('sara@exchange.example')
    expect((await sara.call('POST', '/admin/tickets/query', {})).status).toBe(200)
    const ali = await signIn('ali@exchange.example')
    const nima = await signIn('nima@exchange.example')
    const req = await ali.call('PUT', '/admin/access/groups/support_agent', { grants: {}, reason: 'Temporary freeze' })
    await nima.call('POST', `/admin/access/changes/${info<{ id: string }>(req).id}/approve`)
    expect((await sara.call('POST', '/admin/tickets/query', {})).body.code).toBe('permission_denied') // same token, no new sign-in
  })

  it('protects staff: no self change, no last super admin, no incompatible groups', async () => {
    const ali = await signIn('ali@exchange.example')
    const staff = info<{ items: { hk: string; email: string }[] }>(await ali.call('GET', '/admin/staff')).items
    const me = staff.find((s) => s.email === 'ali@exchange.example')!
    const nima = staff.find((s) => s.email === 'nima@exchange.example')!
    const omid = staff.find((s) => s.email === 'omid@exchange.example')!
    expect((await ali.call('POST', `/admin/staff/${me.hk}/disable`, { reason: 'x' })).body.code).toBe('self_change')
    expect((await ali.call('POST', `/admin/staff/${nima.hk}/disable`, { reason: 'x' })).body.code).toBe('last_super_admin') // only two super admins exist
    expect((await ali.call('PUT', `/admin/staff/${omid.hk}/groups`, { groups: [{ id: 'finance_analyst' }, { id: 'finance_manager' }], reason: 'x' })).body.code).toBe('incompatible_grants')
    expect((await ali.call('PUT', `/admin/staff/${omid.hk}/groups`, { groups: [], reason: 'x' })).status).toBe(400)
  })

  it('ends an expired assignment by itself', async () => {
    const omid = await signIn('omid@exchange.example')
    expect(info<{ me: { grants: Record<string, string> } }>({ body: { info: omid.info } }).me.grants.ledger).toBe('view')
  })

  it('validates the security policy against its floors and holds a change for approval', async () => {
    const { call } = await signIn('ali@exchange.example')
    const policy = info<{ password: Record<string, number>; session: Record<string, number> }>(await call('GET', '/admin/security/policy'))
    const bad = await call('PUT', '/admin/security/policy', { ...policy, password: { ...policy.password, min_length: 8 }, session: { ...policy.session, idle_minutes: 90 }, reason: 'x' })
    expect(bad.status).toBe(400)
    expect(Object.keys((bad.body.info as { errors: object }).errors).sort()).toEqual(['password.min_length', 'session.idle_minutes'])
    const ok = await call('PUT', '/admin/security/policy', { ...policy, password: { ...policy.password, max_age_days: 60 }, reason: 'Tighten rotation' })
    expect(ok.status).toBe(202)
  })
})

describe('password expiry', () => {
  it('blocks everything except the password change until it is changed', async () => {
    const s = await signIn('expired@exchange.example')
    expect(s.info.password_expired).toBe(true)
    expect((await s.call('GET', '/admin/tickets/stats')).body.code).toBe('password_expired')
    expect((await s.call('POST', '/admin/auth/password-change', { current_password: 'wrong', new_password: 'a much longer new password' })).body.code).toBe('password_invalid')
    const weak = await s.call('POST', '/admin/auth/password-change', { current_password: PW, new_password: 'short' })
    expect(weak.status).toBe(400)
    expect((await s.call('POST', '/admin/auth/password-change', { current_password: PW, new_password: 'a much longer new password' })).status).toBe(200)
    expect((await s.call('GET', '/admin/tickets/stats')).status).toBe(200)
  })

  it('refuses a disabled administrator at sign-in without saying why', async () => {
    const c = await mockTransport({ method: 'POST', path: '/admin/auth/login', body: { email: 'former@exchange.example', password: PW } })
    const v = await mockTransport({ method: 'POST', path: '/admin/auth/verify', body: { challenge: (c.body.info as { challenge: string }).challenge, email_code: '123456', totp: '654321' } })
    expect(v.status).toBe(401)
    expect(v.body.code).toBe('code_invalid')
  })
})
