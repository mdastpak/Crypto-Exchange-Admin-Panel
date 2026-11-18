import { useEffect, useRef } from 'react'
import { endSession, heartbeat, refreshToken } from './auth-api'
import { useSession } from './session-store'

const HEARTBEAT_MS = 30_000
const HEARTBEAT_WARN_MS = 5_000
const ACTIVITY_WINDOW_MS = 60_000

/**
 * Keeps the session honest from the browser side. The server decides when a
 * session ends; these timers only tell it about real user input and show the
 * truth in the UI.
 *
 * - Only pointer, keyboard, and touch input in a visible tab counts as activity.
 *   A running timer, a background tab, or a script does not.
 * - Activity is reported with a heartbeat, at most every 30 s (5 s once the
 *   warning is showing).
 * - The access token is refreshed before it expires.
 * - Idle and absolute limits end the session here too, so the UI never shows a
 *   dead session as alive.
 */
export function useSessionGuard() {
  const lastActivity = useRef(0)
  const lastHeartbeat = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    const mark = () => {
      lastActivity.current = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    mark()

    const tick = () => {
      const s = useSession.getState()
      if (!s.token || !s.policy) return
      const now = Date.now()
      if (now >= s.absoluteExpiresAt) return endSession('absolute')
      if (now >= s.idleExpiresAt) return endSession('idle')
      if (busy.current) return

      const warning = s.idleExpiresAt - now <= s.policy.warnMs
      const active =
        document.visibilityState === 'visible' && now - lastActivity.current <= ACTIVITY_WINDOW_MS
      const due = now - lastHeartbeat.current >= (warning ? HEARTBEAT_WARN_MS : HEARTBEAT_MS)
      const needsRefresh = s.tokenExpiresAt - now <= 2 * 60_000

      if (needsRefresh && active) {
        busy.current = true
        void refreshToken().catch(() => {}).finally(() => (busy.current = false))
      } else if (active && due && lastActivity.current > lastHeartbeat.current) {
        busy.current = true
        lastHeartbeat.current = now
        void heartbeat().catch(() => {}).finally(() => (busy.current = false))
      }
    }
    const id = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(id)
      events.forEach((e) => window.removeEventListener(e, mark))
    }
  }, [])
}

/** Request an immediate heartbeat, used by the "stay signed in" button. */
export async function staySignedIn() {
  await heartbeat()
}
