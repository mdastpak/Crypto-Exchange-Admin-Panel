import { SeqWindow } from './seal'

/** The sealing state of one session. It lives in memory only and dies with the session. */
export interface SealSession {
  key: CryptoKey
  kid: string
  sid: string
  /** Next request sequence number. Allocated synchronously, so concurrent calls never share one. */
  nextSeq: number
  /** Response sequence numbers already accepted. */
  responses: SeqWindow
}

export function newSealSession(key: CryptoKey, kid: string, sid: string): SealSession {
  return { key, kid, sid, nextSeq: 1, responses: new SeqWindow() }
}
