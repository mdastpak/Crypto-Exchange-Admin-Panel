import { beforeEach, describe, expect, it } from 'vitest'
import { mockTransport, resetMock } from './server'

const PW = 'correct horse battery staple'
async function signIn(email: string) {
  const c = await mockTransport({ method: 'POST', path: '/admin/auth/login', body: { email, password: PW } })
  const v = await mockTransport({ method: 'POST', path: '/admin/auth/verify', body: { challenge: (c.body.info as { challenge: string }).challenge, email_code: '123456', totp: '654321' } })
  const token = (v.body.info as { access_token: string }).access_token
  return { call: (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => mockTransport({ method, path, body, token }) }
}
const info = <T>(r: { body: { info?: unknown } }) => r.body.info as T
const U = '9c1a0001-aaaa-4000-8000-000000000001'

beforeEach(() => resetMock())

describe('withdrawals and payouts', () => {
  it('lists the review queue and approves or rejects once', async () => {
    const { call } = await signIn('reza@exchange.example')
    const queue = info<{ id: string; status: string }[]>(await call('GET', '/admin/withdrawals'))
    expect(queue.length).toBeGreaterThan(1)
    expect(queue.every((w) => w.status === 'review')).toBe(true)
    expect((await call('POST', `/admin/withdrawals/${queue[0].id}/approve`)).status).toBe(200)
    expect((await call('POST', `/admin/withdrawals/${queue[0].id}/approve`)).body.code).toBe('withdrawal_not_in_review')
    const noReason = await call('POST', `/admin/withdrawals/${queue[1].id}/reject`, { reason: ' ' })
    expect(noReason.status).toBe(400)
    const rej = await call('POST', `/admin/withdrawals/${queue[1].id}/reject`, { reason: 'Suspicious destination' })
    expect(info<{ status: string; reason: string }>(rej)).toMatchObject({ status: 'rejected', reason: 'Suspicious destination' })
  })

  it('does not let a finance analyst decide, but lets them read', async () => {
    const { call } = await signIn('sara@exchange.example') // support: no withdrawal read
    expect((await call('GET', '/admin/withdrawals')).status).toBe(403)
  })

  it('hides the destination in the list, shows it in the detail, and audits the read', async () => {
    const { call } = await signIn('reza@exchange.example')
    const list = info<Record<string, unknown>[]>(await call('GET', '/admin/payouts?status=submitted'))
    expect(list.every((p) => !('destination_value' in p))).toBe(true)
    const detail = info<{ destination_value: string }>(await call('GET', '/admin/payouts/po-9001'))
    expect(detail.destination_value).toMatch(/^TLp2/)
    const ali = await signIn('ali@exchange.example')
    const log = info<{ items: { action: string; target_id: string }[] }>(await ali.call('GET', '/admin/audit?action=withdrawal.payout_view'))
    expect(log.items[0]).toMatchObject({ action: 'withdrawal.payout_view', target_id: 'po-9001' })
  })

  it('never lets a payout be recorded twice', async () => {
    const { call } = await signIn('reza@exchange.example')
    expect((await call('POST', '/admin/payouts/po-9001/complete', { tracking_id: '' })).status).toBe(400)
    expect((await call('POST', '/admin/payouts/po-9001/complete', { tracking_id: '0xabc' })).status).toBe(200)
    expect((await call('POST', '/admin/payouts/po-9001/fail', { reason: 'late' })).body.code).toBe('payout_not_open')
  })
})

describe('restrictions', () => {
  it('validates the scope rules and reports ended sessions for a freeze', async () => {
    const { call } = await signIn('ali@exchange.example')
    const bad = await call('POST', `/admin/users/${U}/restrictions`, { scope: 'account', operations: ['withdraw'], reason: 'fraud' })
    expect(bad.status).toBe(400)
    const asset = await call('POST', `/admin/users/${U}/restrictions`, { scope: 'asset', operations: ['withdraw'], reason: 'fraud' })
    expect((asset.body.info as { errors: Record<string, string> }).errors).toHaveProperty('currency_hk')
    const freeze = await call('POST', `/admin/users/${U}/restrictions`, { scope: 'account', reason: 'court_order', case_ref: 'C-1' })
    expect(freeze.status).toBe(201)
    expect(info<{ ended_sessions: number }>(freeze).ended_sessions).toBeGreaterThan(0)
  })

  it('lifts once, with a note, and refuses a stale version', async () => {
    const { call } = await signIn('ali@exchange.example')
    const r = info<{ items: { id: string; version: number }[] }>(await call('GET', `/admin/users/${U}/restrictions`)).items[0]
    expect((await call('POST', `/admin/users/${U}/restrictions/${r.id}/lift?version=${r.version + 5}`, { note: 'x' })).body.code).toBe('version_conflict')
    expect((await call('POST', `/admin/users/${U}/restrictions/${r.id}/lift?version=${r.version}`, { note: '' })).status).toBe(400)
    expect((await call('POST', `/admin/users/${U}/restrictions/${r.id}/lift?version=${r.version}`, { note: 'order revoked' })).status).toBe(200)
    expect((await call('POST', `/admin/users/${U}/restrictions/${r.id}/lift?version=${r.version + 1}`, { note: 'again' })).body.code).toBe('already_lifted')
  })

  it('lets support read restrictions but not create them', async () => {
    const { call } = await signIn('sara@exchange.example')
    expect((await call('GET', `/admin/users/${U}/restrictions`)).status).toBe(200)
    expect((await call('POST', `/admin/users/${U}/restrictions`, { scope: 'account', reason: 'fraud' })).body.code).toBe('permission_denied')
  })
})

describe('integrity and audit', () => {
  it('needs two administrators to reseal and pins what the first one saw', async () => {
    const ali = await signIn('ali@exchange.example')
    const nima = await signIn('nima@exchange.example')
    const first = await ali.call('POST', '/admin/integrity/findings/41/reseal', { reason: 'Reviewed: matches the approval' })
    expect(first.status).toBe(202)
    expect(info<{ reseal_requested_by: string; reseal_row_version: number; reseal_values: object }>(first)).toMatchObject({ reseal_requested_by: 'ali@exchange.example', reseal_row_version: 7 })
    expect((await ali.call('POST', '/admin/integrity/findings/41/reseal', { reason: 'me again' })).body.code).toBe('second_approval_required')
    const second = await nima.call('POST', '/admin/integrity/findings/41/reseal', { reason: 'Confirmed' })
    expect(second.status).toBe(200)
    expect(info<{ resolution: string }>(second).resolution).toBe('resealed')
    expect((await nima.call('POST', '/admin/integrity/findings/41/reseal', { reason: 'x' })).body.code).toBe('already_resolved')
    const open = info<{ items: { id: number }[] }>(await nima.call('GET', '/admin/integrity/findings'))
    expect(open.items.map((f) => f.id)).not.toContain(41)
  })

  it('filters the audit log and pages it with an opaque cursor', async () => {
    const { call } = await signIn('ali@exchange.example')
    const denied = info<{ items: { outcome: string }[] }>(await call('GET', '/admin/audit?outcome=denied&limit=200'))
    expect(denied.items.length).toBeGreaterThan(0)
    expect(denied.items.every((e) => e.outcome === 'denied')).toBe(true)
    const p1 = info<{ items: { hk: string }[]; next_cursor?: string }>(await call('GET', '/admin/audit?limit=20'))
    expect(p1.next_cursor).toBeTruthy()
    const p2 = info<{ items: { hk: string }[] }>(await call('GET', `/admin/audit?limit=20&cursor=${p1.next_cursor}`))
    expect(p2.items.some((e) => p1.items.some((x) => x.hk === e.hk))).toBe(false)
  })
})

describe('venues, OTC routing, and SMS', () => {
  it('clears a hold once and needs the venues approval level', async () => {
    const reza = await signIn('reza@exchange.example')
    expect((await reza.call('POST', '/admin/venues/holds/hold-7/clear', { reason: '' })).status).toBe(400)
    expect((await reza.call('POST', '/admin/venues/holds/hold-7/clear', { reason: 'Difference explained by a pending transfer' })).status).toBe(200)
    expect((await reza.call('POST', '/admin/venues/holds/hold-7/clear', { reason: 'again' })).body.code).toBe('already_cleared')
    const sara = await signIn('sara@exchange.example')
    expect((await sara.call('GET', '/admin/venues')).body.code).toBe('permission_denied')
  })

  it('saves routing rules as a new version and reports bad venues by field path', async () => {
    const { call } = await signIn('ali@exchange.example')
    const bad = await call('PUT', '/admin/otc/routing/rules', { reason: 'test', rules: [{ name: 'r', venues: [{ venue: 'nowhere' }] }] })
    expect(bad.status).toBe(400)
    expect(bad.body.info).toMatchObject({ errors: { 'rules[0].venues[0].venue': expect.any(String) } })
    const ok = await call('PUT', '/admin/otc/routing/rules', { reason: 'tighten', rules: [{ name: 'only', markets: ['BTC/USDT'], use_inventory: true }] })
    expect(info<{ version: number }>(ok).version).toBe(4)
    const exp = info<{ route?: { rule: string }; reason?: string }>(await call('POST', '/admin/otc/routing/explain', { market: 'ETH/USDT', side: 'buy', quantity: '1', price: '3000' }))
    expect(exp.route).toBeUndefined()
    expect(exp.reason).toBe('no_rule_matched')
  })

  it('validates the SMS order the way the backend does', async () => {
    const { call } = await signIn('ali@exchange.example')
    expect((await call('PUT', '/admin/notifications/sms', { mode: 'manual', order: [] })).status).toBe(400)
    expect((await call('PUT', '/admin/notifications/sms', { mode: 'manual', order: ['smsir'] })).status).toBe(400) // smsir has no reminder template
    const ok = await call('PUT', '/admin/notifications/sms', { mode: 'manual', order: ['smsir', 'kavenegar'] })
    expect(info<{ effective_order: string[] }>(ok).effective_order).toEqual(['smsir', 'kavenegar'])
  })
})
