import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '@/auth/session-store'
import { useStepUp } from '@/auth/step-up-store'
import { api, setTransport } from './client'
import { ApiError, type Policy, type TransportResponse } from './types'

const policy: Policy = { idleMs: 9e5, absoluteMs: 2.88e7, accessTokenMs: 6e5, warnMs: 12e4, stepUpMs: 3e5 }
const signIn = () =>
  useSession.getState().start({
    token: 't1', tokenExpiresAt: Date.now() + 6e5, me: { email: 'a@b.c', groups: [], grants: {} },
    policy, idleExpiresAt: Date.now() + 9e5, absoluteExpiresAt: Date.now() + 2.88e7, elevatedUntil: 0,
  })
const res = (status: number, code?: string, info?: unknown): TransportResponse => ({
  status, body: { status, message: code ?? 'ok', code, info },
})

beforeEach(() => {
  useSession.setState({ token: null, me: null, endReason: null })
  useStepUp.setState({ open: false, resolve: null })
})

describe('api client', () => {
  it('returns the info of the envelope and sends the bearer token', async () => {
    signIn()
    const t = vi.fn().mockResolvedValue(res(200, undefined, { x: 1 }))
    setTransport(t)
    await expect(api.get('/admin/me')).resolves.toEqual({ x: 1 })
    expect(t.mock.calls[0][0].token).toBe('t1')
  })

  it('throws an ApiError with code and info', async () => {
    signIn()
    setTransport(async () => res(409, 'version_conflict', { version: 3 }))
    const err = await api.put('/x', {}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'version_conflict', info: { version: 3 } })
  })

  it('ends the session when the token is dead', async () => {
    signIn()
    setTransport(async () => res(401, 'session_inactive'))
    await api.get('/admin/me').catch(() => {})
    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().endReason).toBe('revoked')
  })

  it('asks for a step-up once and retries the request', async () => {
    signIn()
    let calls = 0
    const t = vi.fn(async () => (++calls === 1 ? res(403, 'step_up_required') : res(200, undefined, { done: true })))
    setTransport(t)
    const p = api.post('/admin/platform/controls', {})
    await vi.waitFor(() => expect(useStepUp.getState().open).toBe(true))
    useStepUp.getState().settle(true)
    await expect(p).resolves.toEqual({ done: true })
    expect(t).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the step-up is cancelled', async () => {
    signIn()
    const t = vi.fn(async () => res(403, 'step_up_required'))
    setTransport(t)
    const p = api.post('/x', {}).catch((e) => e)
    await vi.waitFor(() => expect(useStepUp.getState().open).toBe(true))
    useStepUp.getState().settle(false)
    expect(await p).toMatchObject({ code: 'step_up_required' })
    expect(t).toHaveBeenCalledTimes(1)
  })

  it('shares one step-up dialog between concurrent requests', async () => {
    signIn()
    const seen = new Map<string, number>()
    setTransport(async ({ path }) => {
      const n = (seen.get(path) ?? 0) + 1
      seen.set(path, n)
      return n === 1 ? res(403, 'step_up_required') : res(200, undefined, { path })
    })
    const a = api.post('/a', {})
    const b = api.post('/b', {})
    await vi.waitFor(() => expect(useStepUp.getState().open).toBe(true))
    useStepUp.getState().settle(true)
    await expect(Promise.all([a, b])).resolves.toEqual([{ path: '/a' }, { path: '/b' }])
  })

  it('maps a network failure to code "network"', async () => {
    signIn()
    setTransport(async () => { throw new TypeError('fetch failed') })
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'network', status: 0 })
  })
})
