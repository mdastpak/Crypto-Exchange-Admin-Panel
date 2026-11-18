import type { Me, Policy } from '@/api/types'
import { useSession, type EndReason } from './session-store'

/**
 * Tabs of one browser share one session. The token is never stored on disk; a
 * new tab asks the others for it over a same-origin BroadcastChannel. Activity
 * in one tab keeps the session alive for all, and sign-out or expiry in one
 * tab closes all.
 */
type Msg =
  | { type: 'hello' }
  | {
      type: 'session'
      token: string
      tokenExpiresAt: number
      me: Me
      policy: Policy
      idleExpiresAt: number
      absoluteExpiresAt: number
      elevatedUntil: number
    }
  | { type: 'idle'; idleExpiresAt: number }
  | { type: 'token'; token: string; expiresAt: number }
  | { type: 'elevated'; until: number }
  | { type: 'end'; reason: Exclude<EndReason, null> }

let channel: BroadcastChannel | null = null

export function broadcast(m: Msg) {
  channel?.postMessage(m)
}

export function startTabSync(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  channel = new BroadcastChannel('cex-admin-session')
  channel.onmessage = (ev: MessageEvent<Msg>) => {
    const s = useSession.getState()
    const m = ev.data
    switch (m.type) {
      case 'hello':
        if (s.token && s.me && s.policy && !s.seal) {
          broadcast({
            type: 'session',
            token: s.token,
            tokenExpiresAt: s.tokenExpiresAt,
            me: s.me,
            policy: s.policy,
            idleExpiresAt: s.idleExpiresAt,
            absoluteExpiresAt: s.absoluteExpiresAt,
            elevatedUntil: s.elevatedUntil,
          })
        }
        break
      case 'session':
        if (!s.token) s.start(m)
        break
      case 'idle':
        if (s.token) s.setIdle(m.idleExpiresAt)
        break
      case 'token':
        if (s.token) s.setToken(m.token, m.expiresAt)
        break
      case 'elevated':
        if (s.token) s.setElevated(m.until)
        break
      case 'end':
        if (s.token) s.end(m.reason)
        break
    }
  }
  broadcast({ type: 'hello' })
  return () => {
    channel?.close()
    channel = null
  }
}
