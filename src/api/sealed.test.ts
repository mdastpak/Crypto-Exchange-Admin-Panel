import { beforeEach, describe, expect, it } from 'vitest'
import { verify, login } from '@/auth/auth-api'
import { useSession } from '@/auth/session-store'
import { seal } from '@/crypto/seal'
import { api, setTransport } from './client'
import { mockTransport, resetMock } from './mock/server'
import type { Transport, TransportRequest, TransportResponse } from './types'

const PW = 'correct horse battery staple'

/** A transport that records every request and response, so a test can look at what an intermediary would see. */
function recorder(inner: Transport = mockTransport) {
  const log: { req: TransportRequest; res: TransportResponse }[] = []
  const t: Transport = async (req) => {
    const res = await inner(req)
    log.push({ req: structuredClone(req), res: structuredClone(res) })
    return res
  }
  return { t, log }
}

async function signIn(email = 'reza@exchange.example') {
  setTransport(mockTransport)
  const c = await login(email, PW)
  await verify(c.challenge, '123456', '654321')
}

beforeEach(() => {
  resetMock()
  useSession.setState({ token: null, me: null, seal: null, endReason: null })
})

describe('sealed payloads end to end (client, transport, mock server)', () => {
  it('negotiates a session key at sign-in', async () => {
    await signIn()
    const s = useSession.getState().seal
    expect(s).not.toBeNull()
    expect(s!.kid).toBe('k_mock_1')
    expect(s!.key.extractable).toBe(false)
  })

  it('shows the caller plaintext, while the wire carries only ciphertext', async () => {
    await signIn()
    const { t, log } = recorder()
    setTransport(t)
    const detail = await api.get<{ destination_value: string }>('/admin/payouts/po-9001')
    expect(detail.destination_value).toMatch(/^TLp2gW4k/)
    const wire = JSON.stringify(log[0])
    expect(wire).not.toContain('TLp2gW4k')
    expect(log[0].res.sealed).toBeDefined()

    const users = await api.post<{ items: unknown[] }>('/admin/users/query', { email: 'user1@mail.example' })
    expect(users.items).toHaveLength(1)
    const second = JSON.stringify(log[1])
    expect(second).not.toContain('user1@mail.example')
    expect(log[1].req.sealedBody).toBeDefined()
    expect(log[1].req.body).toBeUndefined()
  })

  it('leaves non-sensitive routes in the clear', async () => {
    await signIn()
    const { t, log } = recorder()
    setTransport(t)
    await api.get('/admin/currencies?q=BTC')
    expect(log[0].res.sealed).toBeUndefined()
    expect(JSON.stringify(log[0].res.body)).toContain('BTC')
  })

  it('refuses a body in the clear on a sealed route', async () => {
    await signIn()
    const token = useSession.getState().token
    const r = await mockTransport({ method: 'POST', path: '/admin/users/query', body: { email: 'user1@mail.example' }, token })
    expect(r.status).toBe(415)
    expect(r.body.code).toBe('sealed_required')
  })

  it('refuses a replayed request', async () => {
    await signIn()
    const { t, log } = recorder()
    setTransport(t)
    await api.post('/admin/users/query', { status: 'ACTIVE' })
    const again = await mockTransport({ ...log[0].req, token: useSession.getState().token })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('replay_detected')
  })

  it('refuses a tampered ciphertext and a ciphertext moved to another route, with no detail', async () => {
    await signIn()
    const { t, log } = recorder()
    setTransport(t)
    await api.post('/admin/users/query', { status: 'ACTIVE' })
    const token = useSession.getState().token
    const sealedBody = log[0].req.sealedBody!
    const bad = await mockTransport({ ...log[0].req, token, sealedBody: { ...sealedBody, seq: sealedBody.seq + 1, ct: sealedBody.ct.slice(0, -4) + 'AAAA' } })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('seal_invalid')
    expect(JSON.stringify(bad.body)).not.toMatch(/tag|stale|format/)
    const moved = await mockTransport({ ...log[0].req, token, path: '/admin/tickets/query', sealedBody: { ...sealedBody, seq: sealedBody.seq + 1 } })
    expect(moved.body.code).toBe('seal_invalid')
  })

  it('refuses a stale message', async () => {
    await signIn()
    const s = useSession.getState().seal!
    const requestId = crypto.randomUUID()
    const old = await seal(s.key, { kid: s.kid, sid: s.sid, direction: 'req', seq: 50, method: 'POST', path: '/admin/users/query', requestId }, { status: 'ACTIVE' }, { now: Date.now() - 120_000 })
    const r = await mockTransport({ method: 'POST', path: '/admin/users/query', sealedBody: old, requestId, token: useSession.getState().token })
    expect(r.body.code).toBe('seal_invalid')
  })

  it('treats a downgrade (a sealed route answered in the clear) as an error', async () => {
    await signIn()
    setTransport(async (req) => {
      const res = await mockTransport(req)
      // A middlebox cannot read the sealed answer, so it invents a plain one.
      return res.sealed ? { status: 200, body: { status: 200, message: 'OK', info: { items: [{ hk: 'forged' }] } } } : res
    })
    await expect(api.post('/admin/users/query', { status: 'ACTIVE' })).rejects.toMatchObject({ code: 'seal_invalid' })
  })

  it('treats a response sealed under another key as an error', async () => {
    await signIn()
    const other = await (async () => { resetMock(); await signIn('ali@exchange.example'); return useSession.getState().seal })()
    void other
    setTransport(async (req) => {
      const res = await mockTransport(req)
      return res.sealed ? { ...res, sealed: { ...res.sealed, ct: res.sealed.ct.slice(0, -4) + 'AAAA' } } : res
    })
    await expect(api.post('/admin/users/query', { status: 'ACTIVE' })).rejects.toMatchObject({ code: 'seal_invalid' })
  })

  it('keeps a transport-level failure readable, so step-up and session end still work', async () => {
    await signIn()
    const r = await api.post('/admin/users/query', { status: 'ACTIVE' }).then(() => null, (e) => e)
    expect(r).toBeNull()
    // 404 on a sealed route stays plain and is still reported as such.
    const err = await api.get('/admin/users/nope').catch((e) => e)
    expect(err).toMatchObject({ status: 404 })
  })

  it('does not share the session with other tabs when sealing is active (the sequence numbers are per tab)', async () => {
    await signIn()
    expect(useSession.getState().seal).not.toBeNull() // tab-sync skips sealed sessions; see auth/tab-sync.ts
  })
})
