import { create } from 'zustand'
import type { Me, Policy } from '@/api/types'
import type { SealSession } from '@/crypto/session'

/**
 * The only holder of the access token. It lives in memory: nothing is written
 * to localStorage, sessionStorage, IndexedDB, or cookies, so a reload signs
 * the administrator out. This is intended.
 */
export type EndReason = 'idle' | 'absolute' | 'revoked' | 'signed_out' | null

interface StartPayload {
  token: string
  tokenExpiresAt: number
  me: Me
  policy: Policy
  idleExpiresAt: number
  absoluteExpiresAt: number
  elevatedUntil: number
  passwordExpired?: boolean
  seal?: SealSession | null
}

interface SessionState {
  token: string | null
  tokenExpiresAt: number
  me: Me | null
  policy: Policy | null
  /** Server-reported times, in ms since epoch. */
  idleExpiresAt: number
  absoluteExpiresAt: number
  elevatedUntil: number
  passwordExpired: boolean
  seal: SealSession | null
  endReason: EndReason
  start: (p: StartPayload) => void
  setToken: (token: string, tokenExpiresAt: number) => void
  setIdle: (idleExpiresAt: number) => void
  setElevated: (until: number) => void
  setMe: (me: Me) => void
  setPasswordExpired: (v: boolean) => void
  end: (reason: Exclude<EndReason, null>) => void
  clearReason: () => void
}

const empty = {
  token: null,
  tokenExpiresAt: 0,
  me: null,
  policy: null,
  idleExpiresAt: 0,
  absoluteExpiresAt: 0,
  elevatedUntil: 0,
  passwordExpired: false,
  seal: null,
}

export const useSession = create<SessionState>()((set) => ({
  ...empty,
  endReason: null,
  start: (p) => set({ ...p, passwordExpired: !!p.passwordExpired, seal: p.seal ?? null, endReason: null }),
  setToken: (token, tokenExpiresAt) => set({ token, tokenExpiresAt }),
  setIdle: (idleExpiresAt) => set({ idleExpiresAt }),
  setElevated: (elevatedUntil) => set({ elevatedUntil }),
  setMe: (me) => set({ me }),
  setPasswordExpired: (passwordExpired) => set({ passwordExpired }),
  end: (reason) => set({ ...empty, endReason: reason }),
  clearReason: () => set({ endReason: null }),
}))

export const isSignedIn = () => useSession.getState().token !== null
