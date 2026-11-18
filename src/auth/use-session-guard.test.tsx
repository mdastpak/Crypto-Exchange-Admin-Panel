import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTransport } from '@/api/client'
import type { Policy } from '@/api/types'
import { useSession } from './session-store'
import { useSessionGuard } from './use-session-guard'

const policy: Policy = { idleMs: 15 * 60_000, absoluteMs: 8 * 3_600_000, accessTokenMs: 10 * 60_000, warnMs: 120_000, stepUpMs: 300_000 }

function signIn(now: number, overrides: Partial<{ idle: number; abs: number; tokenExp: number }> = {}) {
  useSession.getState().start({
    token: 't', tokenExpiresAt: overrides.tokenExp ?? now + 10 * 60_000,
    me: { email: 'a@b.c', groups: [], grants: {} }, policy,
    idleExpiresAt: overrides.idle ?? now + policy.idleMs,
    absoluteExpiresAt: overrides.abs ?? now + policy.absoluteMs, elevatedUntil: 0,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  useSession.setState({ token: null, endReason: null })
})
afterEach(() => vi.useRealTimers())

describe('session guard', () => {
  it('ends the session when idle time runs out', () => {
    setTransport(async () => ({ status: 200, body: { status: 200, message: 'ok', info: {} } }))
    signIn(Date.now(), { idle: Date.now() + 5_000 })
    renderHook(() => useSessionGuard())
    act(() => { vi.advanceTimersByTime(6_000) })
    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().endReason).toBe('idle')
  })

  it('ends the session at the absolute limit even while the user is active', () => {
    setTransport(async () => ({ status: 200, body: { status: 200, message: 'ok', info: { idle_expires_at: Date.now() + 9e5 } } }))
    signIn(Date.now(), { abs: Date.now() + 5_000 })
    renderHook(() => useSessionGuard())
    act(() => { window.dispatchEvent(new Event('pointerdown')); vi.advanceTimersByTime(6_000) })
    expect(useSession.getState().endReason).toBe('absolute')
  })

  it('sends a heartbeat only after real user input', async () => {
    const calls: string[] = []
    setTransport(async ({ path }) => {
      calls.push(path)
      return { status: 200, body: { status: 200, message: 'ok', info: { idle_expires_at: Date.now() + 9e5 } } }
    })
    signIn(Date.now())
    renderHook(() => useSessionGuard())
    // Mounting counts as the first activity; let the first heartbeat go out.
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000) })
    const afterMount = calls.filter((c) => c.endsWith('heartbeat')).length
    // No input for a while: no more heartbeats, because nothing real happened.
    await act(async () => { await vi.advanceTimersByTimeAsync(100_000) })
    expect(calls.filter((c) => c.endsWith('heartbeat')).length).toBe(afterMount)
    // New input: the next tick reports it.
    await act(async () => {
      window.dispatchEvent(new Event('keydown'))
      await vi.advanceTimersByTimeAsync(35_000)
    })
    expect(calls.filter((c) => c.endsWith('heartbeat')).length).toBe(afterMount + 1)
  })

  it('refreshes the token before it expires while the user is active', async () => {
    const calls: string[] = []
    setTransport(async ({ path }) => {
      calls.push(path)
      return { status: 200, body: { status: 200, message: 'ok', info: { access_token: 't2', expires_at: Date.now() + 6e5, idle_expires_at: Date.now() + 9e5 } } }
    })
    signIn(Date.now(), { tokenExp: Date.now() + 90_000 })
    renderHook(() => useSessionGuard())
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(calls).toContain('/admin/auth/refresh')
    expect(useSession.getState().token).toBe('t2')
  })
})
