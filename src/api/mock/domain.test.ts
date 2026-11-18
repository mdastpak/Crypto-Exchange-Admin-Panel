import { beforeEach, describe, expect, it } from 'vitest'
import { mockTransport, resetMock } from './server'

const PW = 'correct horse battery staple'

async function signIn(email: string, stepUp = true) {
  const c = await mockTransport({ method: 'POST', path: '/admin/auth/login', body: { email, password: PW } })
  const v = await mockTransport({ method: 'POST', path: '/admin/auth/verify', body: { challenge: (c.body.info as { challenge: string }).challenge, email_code: '123456', totp: '654321' } })
  const info = v.body.info as { access_token: string }
  const token = info.access_token
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => mockTransport({ method, path, body, token })
  if (!stepUp) {
    // Let the elevation lapse so sensitive routes ask for a step-up.
    const { vi } = await import('vitest')
    vi.setSystemTime(Date.now() + 6 * 60_000)
  }
  return { token, call }
}
const info = <T>(r: { body: { info?: unknown } }) => r.body.info as T

beforeEach(() => resetMock())

describe('mock operations API', () => {
  it('lists currencies with filters and cursors', async () => {
    const { call } = await signIn('ali@exchange.example')
    const first = info<{ items: { hk: string }[]; next_cursor?: string }>(await call('GET', '/admin/currencies?limit=3'))
    expect(first.items).toHaveLength(3)
    expect(first.next_cursor).toBeTruthy()
    const second = info<{ items: { hk: string }[] }>(await call('GET', `/admin/currencies?limit=3&cursor=${first.next_cursor}`))
    expect(second.items.map((i) => i.hk)).not.toContain(first.items[0].hk)
    const pending = info<{ items: { status: string }[] }>(await call('GET', '/admin/currencies?status=pending'))
    expect(pending.items.every((i) => i.status === 'pending')).toBe(true)
  })

  it('refuses a stale version with the current one', async () => {
    const { call } = await signIn('ali@exchange.example')
    const list = info<{ items: { hk: string; version: number }[] }>(await call('GET', '/admin/currencies?q=BTC'))
    const c = list.items[0]
    const ok = await call('PUT', `/admin/currencies/${c.hk}`, { info: { en_name: 'Bitcoin Core' }, version: c.version })
    expect(ok.status).toBe(200)
    const stale = await call('PUT', `/admin/currencies/${c.hk}`, { info: { en_name: 'Again' }, version: c.version })
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ code: 'version_conflict', info: { version: c.version + 1 } })
  })

  it('validates a new currency and rejects duplicates', async () => {
    const { call } = await signIn('ali@exchange.example')
    const bad = await call('POST', '/admin/currencies', { info: { en_name: '', fa_name: 'x', symbol: 'a', is_token: true } })
    expect(bad.status).toBe(400)
    expect(Object.keys((bad.body.info as { errors: object }).errors).sort()).toEqual(['info.contract', 'info.en_name', 'info.symbol'])
    const dup = await call('POST', '/admin/currencies', { info: { en_name: 'Bit', fa_name: 'بیت', symbol: 'btc' } })
    expect(dup.status).toBe(409)
    expect(dup.body).toMatchObject({ code: 'duplicate_symbol', info: { field: 'info.symbol' } })
  })

  it('never changes the contract or decimals of an existing network', async () => {
    const { call } = await signIn('ali@exchange.example')
    const usdt = info<{ items: { hk: string }[] }>(await call('GET', '/admin/currencies?q=USDT')).items[0]
    const nets = info<{ network: string; contract_address: string; decimals: number }[]>(await call('GET', `/admin/currencies/${usdt.hk}/networks`))
    const tron = nets.find((n) => n.network === 'tron')!
    const body = { ...tron, min_deposit: '1', min_withdrawal: '20', max_withdrawal: '0', withdrawal_fee: '1' }
    expect((await call('PUT', `/admin/currencies/${usdt.hk}/networks/tron`, { ...body, decimals: 18 })).body.code).toBe('network_contract_fixed')
    expect((await call('PUT', `/admin/currencies/${usdt.hk}/networks/tron`, { ...body, withdrawal_fee: '2' })).status).toBe(200)
  })

  it('refuses without the permission, and asks for a step-up on sensitive routes', async () => {
    const support = await signIn('sara@exchange.example')
    const denied = await support.call('GET', '/admin/platform')
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('permission_denied')

    const { vi } = await import('vitest')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const ali = await signIn('ali@exchange.example', false)
      const r = await ali.call('POST', '/admin/platform/controls', { kind: 'lockdown', feature: 'trading', starts_at: new Date().toISOString(), reason: 'x' })
      expect(r.status).toBe(403)
      expect(r.body.code).toBe('step_up_required')
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies a price override within the bound at once and holds a large one for a second administrator', async () => {
    const ali = await signIn('ali@exchange.example')
    const nima = await signIn('nima@exchange.example')
    const small = await ali.call('POST', '/admin/markets/BTC/USDT/price-override', { mid: '64100', expires_in_seconds: 600, reason: 'provider lag' })
    expect(info<{ in_force: boolean; pending: boolean }>(small)).toMatchObject({ in_force: true, pending: false })
    const id = info<{ id: string }>(small).id
    expect((await ali.call('POST', `/admin/price-overrides/${id}/end`)).status).toBe(200)

    const big = await ali.call('POST', '/admin/markets/BTC/USDT/price-override', { mid: '70000', expires_in_seconds: 600, reason: 'providers down' })
    const o = info<{ id: string; pending: boolean; deviation_bps: number }>(big)
    expect(o.pending).toBe(true)
    expect(o.deviation_bps).toBeGreaterThan(300)
    // A market has one override at a time.
    expect((await ali.call('POST', '/admin/markets/BTC/USDT/price-override', { mid: '64000', expires_in_seconds: 60, reason: 'again' })).body.code).toBe('price_override_exists')
    // The requester cannot approve; a second administrator can.
    expect((await ali.call('POST', `/admin/price-overrides/${o.id}/approve`)).body.code).toBe('second_approval_required')
    const approved = await nima.call('POST', `/admin/price-overrides/${o.id}/approve`)
    expect(info<{ in_force: boolean; approved_by: string }>(approved)).toMatchObject({ in_force: true, approved_by: 'nima@exchange.example' })
    const price = info<{ status: string; mid: number }>(await ali.call('GET', '/admin/markets/BTC/USDT/price'))
    expect(price).toMatchObject({ status: 'override', mid: 70000 })
  })

  it('needs two administrators to lift a withdrawals lockdown', async () => {
    const ali = await signIn('ali@exchange.example')
    const nima = await signIn('nima@exchange.example')
    const overview = info<{ controls: { id: string; version: number; feature: string }[] }>(await ali.call('GET', '/admin/platform'))
    const ctl = overview.controls.find((c) => c.feature === 'withdrawals')!
    const first = await ali.call('POST', `/admin/platform/controls/${ctl.id}/lift`, { note: 'wallet checked' })
    expect(first.status).toBe(202)
    expect(info<{ lift_requested_by: string }>(first).lift_requested_by).toBe('ali@exchange.example')
    expect((await ali.call('POST', `/admin/platform/controls/${ctl.id}/lift`, { note: 'again' })).body.code).toBe('second_approval_required')
    const second = await nima.call('POST', `/admin/platform/controls/${ctl.id}/lift`, { note: 'confirmed' })
    expect(second.status).toBe(200)
    expect(info<{ lifted_by: string }>(second).lifted_by).toBe('nima@exchange.example')
    const after = info<{ status: { lockdowns: string[] } }>(await ali.call('GET', '/admin/platform'))
    expect(after.status.lockdowns).toEqual([])
  })

  it('cancels a scheduled delisting once and refuses a second cancel', async () => {
    const { call } = await signIn('ali@exchange.example')
    const lunc = info<{ items: { hk: string }[] }>(await call('GET', '/admin/currencies?q=LUNC')).items[0]
    const d = info<{ items: { id: string; version: number }[] }>(await call('GET', `/admin/currencies/${lunc.hk}/delistings`)).items[0]
    const r = await call('POST', `/admin/currencies/${lunc.hk}/delistings/${d.id}/cancel`, { version: d.version })
    expect(r.status).toBe(200)
    expect((await call('POST', `/admin/currencies/${lunc.hk}/delistings/${d.id}/cancel`, { version: d.version + 1 })).body.code).toBe('delisting_not_scheduled')
  })
})
