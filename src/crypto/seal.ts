/**
 * Sealed payloads: the application-layer envelope of docs/06-api-contract.md.
 *
 *   key  = HKDF-SHA-256(ECDH-P256(client, server), salt = session id, info = "cex-admin-seal-v1")
 *   body = AES-256-GCM(JSON {ts, data}), a fresh 96-bit IV per message
 *   AAD  = v | kid | sid | direction | seq | method | path | request id
 *
 * It protects against intermediaries that end TLS (a CDN, WAF, or proxy) and against
 * replay. It does not protect against a script that runs in the page.
 */
const enc = new TextEncoder()
const dec = new TextDecoder()

export const VERSION = 1
export const SEAL_INFO = 'cex-admin-seal-v1'
export const MAX_SKEW_MS = 60_000
/** A response or request may arrive out of order by up to this many sequence numbers. */
export const SEQ_WINDOW = 16

export interface SealedEnvelope { v: number; kid: string; seq: number; iv: string; ct: string }
export type Direction = 'req' | 'res'
export interface SealContext { kid: string; sid: string; direction: Direction; seq: number; method: string; path: string; requestId: string }

export class SealError extends Error {
  readonly reason: 'version' | 'kid' | 'seq' | 'tag' | 'stale' | 'format'
  constructor(reason: SealError['reason']) {
    super(`seal_invalid:${reason}`)
    this.name = 'SealError'
    this.reason = reason
  }
}

export const b64u = {
  enc(bytes: ArrayBuffer | Uint8Array): string {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    let s = ''
    for (const b of u) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  dec(text: string): Uint8Array<ArrayBuffer> {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4))
    const out = new Uint8Array(new ArrayBuffer(s.length))
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  },
}

export interface KeyPair { privateKey: CryptoKey; publicJwk: JsonWebKey }

/** The private key never leaves the browser: it is generated non-extractable. */
export async function generateKeyPair(): Promise<KeyPair> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  return { privateKey: kp.privateKey, publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } }
}

export async function deriveSealKey(privateKey: CryptoKey, peerPublicJwk: JsonWebKey, sessionId: string): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey('jwk', peerPublicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256)
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(sessionId), info: enc.encode(SEAL_INFO) },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

/** Imports a raw key. Used by the known-answer tests only. */
export const importRawKey = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])

/** The additional authenticated data: moving a ciphertext to another route, session, direction, or request breaks it. */
export function aad(c: SealContext): Uint8Array<ArrayBuffer> {
  const path = c.path.split('?')[0]
  return enc.encode([VERSION, c.kid, c.sid, c.direction, c.seq, c.method.toUpperCase(), path, c.requestId].join('|')) as Uint8Array<ArrayBuffer>
}

export async function seal(key: CryptoKey, ctx: SealContext, data: unknown, opts: { iv?: Uint8Array<ArrayBuffer>; now?: number } = {}): Promise<SealedEnvelope> {
  const iv = opts.iv ?? crypto.getRandomValues(new Uint8Array(12))
  const plain = enc.encode(JSON.stringify({ ts: opts.now ?? Date.now(), data: data ?? null }))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(ctx), tagLength: 128 }, key, plain)
  return { v: VERSION, kid: ctx.kid, seq: ctx.seq, iv: b64u.enc(iv), ct: b64u.enc(ct) }
}

export const isEnvelope = (x: unknown): x is SealedEnvelope =>
  !!x && typeof x === 'object' && (x as SealedEnvelope).v === VERSION && typeof (x as SealedEnvelope).ct === 'string' && typeof (x as SealedEnvelope).iv === 'string' && typeof (x as SealedEnvelope).seq === 'number'

/** Opens an envelope. Any failure throws a `SealError` with no detail beyond a coarse reason. */
export async function open<T = unknown>(key: CryptoKey, ctx: Omit<SealContext, 'seq' | 'kid'>, env: SealedEnvelope, opts: { now?: number } = {}): Promise<T> {
  if (!isEnvelope(env)) throw new SealError('format')
  if (env.v !== VERSION) throw new SealError('version')
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64u.dec(env.iv), additionalData: aad({ ...ctx, kid: env.kid, seq: env.seq }), tagLength: 128 },
      key, b64u.dec(env.ct)
    )
  } catch {
    throw new SealError('tag')
  }
  const msg = JSON.parse(dec.decode(plain)) as { ts: number; data: T }
  if (Math.abs((opts.now ?? Date.now()) - msg.ts) > MAX_SKEW_MS) throw new SealError('stale')
  return msg.data
}

/** Tracks the sequence numbers one side has accepted: no repeats, small reordering allowed. */
export class SeqWindow {
  private last = 0
  private seen = new Set<number>()
  /** Would this number be accepted? It does not change the window, so garbage cannot burn numbers. */
  check(seq: number): boolean {
    return Number.isInteger(seq) && seq >= 1 && seq > this.last - SEQ_WINDOW && !this.seen.has(seq)
  }
  /** Record a number once its message authenticated. */
  commit(seq: number): void {
    this.seen.add(seq)
    if (seq > this.last) this.last = seq
    for (const s of this.seen) if (s <= this.last - SEQ_WINDOW) this.seen.delete(s)
  }
  accept(seq: number): boolean {
    if (!this.check(seq)) return false
    this.commit(seq)
    return true
  }
}

/** The long-term server key signs the key agreement so that a middlebox cannot substitute its own key. */
export const canonicalJwk = (j: JsonWebKey) => JSON.stringify({ crv: j.crv, kty: j.kty, x: j.x, y: j.y })
export const transcript = (sid: string, kid: string, clientKey: JsonWebKey, serverKey: JsonWebKey) =>
  enc.encode([sid, kid, canonicalJwk(clientKey), canonicalJwk(serverKey)].join('|')) as Uint8Array<ArrayBuffer>

export async function signTranscript(signingKey: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<string> {
  return b64u.enc(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, data))
}
export async function verifyTranscript(pinnedPublic: JsonWebKey, data: Uint8Array<ArrayBuffer>, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('jwk', pinnedPublic, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64u.dec(signature), data)
}
