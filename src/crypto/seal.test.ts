import { describe, expect, it } from 'vitest'
import vectors from './vectors.json'
import { SEQ_WINDOW, SealError, SeqWindow, aad, b64u, deriveSealKey, generateKeyPair, importRawKey, open, seal, signTranscript, transcript, verifyTranscript, type SealContext } from './seal'

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)))
const ctx: SealContext = vectors.context as SealContext

async function pair() {
  const a = await generateKeyPair(), b = await generateKeyPair()
  const ka = await deriveSealKey(a.privateKey, b.publicJwk, 'sid-1')
  const kb = await deriveSealKey(b.privateKey, a.publicJwk, 'sid-1')
  return { ka, kb }
}

describe('seal: known answers (computed by Node/OpenSSL, not by this code)', () => {
  it('builds the AAD string as documented', () => {
    expect(new TextDecoder().decode(aad(ctx))).toBe(vectors.aad)
  })

  it('derives the same key as OpenSSL: ECDH then HKDF-SHA-256', async () => {
    const strip = ({ kty, crv, x, y }: JsonWebKey) => ({ kty, crv, x, y })
    const d = (j: JsonWebKey) => crypto.subtle.importKey('jwk', j, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    const priv = await d(vectors.clientJwk)
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('jwk', strip(vectors.serverJwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, priv, 256))
    expect([...bits].map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(vectors.sharedSecretHex)
    const key = await deriveSealKey(priv, strip(vectors.serverJwk), vectors.sid)
    const env = await seal(key, ctx, { email: 'user1@mail.example' }, { iv: hex(vectors.ivHex), now: vectors.ts })
    expect(env.ct).toBe(vectors.ct) // identical ciphertext and tag as OpenSSL's
  })

  it('opens the OpenSSL ciphertext', async () => {
    const key = await importRawKey(hex(vectors.keyHex))
    const { kid, seq, ...rest } = ctx
    const data = await open<{ email: string }>(key, rest, { v: 1, kid, seq, iv: b64u.enc(hex(vectors.ivHex)), ct: vectors.ct }, { now: vectors.ts })
    expect(data).toEqual({ email: 'user1@mail.example' })
  })
})

describe('seal: round trip and tampering', () => {
  it('both sides derive the same key and read each other', async () => {
    const { ka, kb } = await pair()
    const c: SealContext = { ...ctx, sid: 'sid-1' }
    const env = await seal(ka, c, { hello: 'world' })
    const { kid: _k, seq: _s, ...rest } = c
    expect(await open(kb, rest, env)).toEqual({ hello: 'world' })
  })

  it('uses a fresh IV for each message', async () => {
    const { ka } = await pair()
    const a = await seal(ka, ctx, { x: 1 }), b = await seal(ka, ctx, { x: 1 })
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)
  })

  it.each([
    ['another route', { path: '/admin/users/reveal' }],
    ['another method', { method: 'PUT' }],
    ['another session', { sid: 'sid-2' }],
    ['another direction', { direction: 'res' as const }],
    ['another request', { requestId: 'req-9999' }],
  ])('refuses a ciphertext moved to %s', async (_name, change) => {
    const { ka, kb } = await pair()
    const c: SealContext = { ...ctx, sid: 'sid-1' }
    const env = await seal(ka, c, { secret: 1 })
    const { kid: _k, seq: _s, ...rest } = { ...c, ...change }
    await expect(open(kb, rest, env)).rejects.toMatchObject({ reason: 'tag' })
  })

  it('refuses a changed ciphertext, a changed sequence number, and a wrong key', async () => {
    const { ka, kb } = await pair()
    const other = await pair()
    const c: SealContext = { ...ctx, sid: 'sid-1' }
    const env = await seal(ka, c, { secret: 1 })
    const { kid: _k, seq: _s, ...rest } = c
    const flipped = b64u.dec(env.ct); flipped[0] ^= 1
    await expect(open(kb, rest, { ...env, ct: b64u.enc(flipped) })).rejects.toBeInstanceOf(SealError)
    await expect(open(kb, rest, { ...env, seq: env.seq + 1 })).rejects.toMatchObject({ reason: 'tag' })
    await expect(open(other.kb, rest, env)).rejects.toMatchObject({ reason: 'tag' })
    await expect(open(kb, rest, { ...env, v: 2 })).rejects.toMatchObject({ reason: 'format' })
  })

  it('refuses a stale or future message', async () => {
    const { ka, kb } = await pair()
    const c: SealContext = { ...ctx, sid: 'sid-1' }
    const { kid: _k, seq: _s, ...rest } = c
    const old = await seal(ka, c, {}, { now: Date.now() - 61_000 })
    await expect(open(kb, rest, old)).rejects.toMatchObject({ reason: 'stale' })
    const future = await seal(ka, c, {}, { now: Date.now() + 61_000 })
    await expect(open(kb, rest, future)).rejects.toMatchObject({ reason: 'stale' })
    const fresh = await seal(ka, c, {}, { now: Date.now() - 30_000 })
    await expect(open(kb, rest, fresh)).resolves.toEqual({})
  })

  it('keeps the private key non-extractable', async () => {
    const kp = await generateKeyPair()
    await expect(crypto.subtle.exportKey('jwk', kp.privateKey)).rejects.toThrow()
  })
})

describe('seal: sequence window', () => {
  it('rejects a repeat, accepts small reordering, rejects far-behind numbers', () => {
    const w = new SeqWindow()
    expect([1, 2, 3].map((n) => w.accept(n))).toEqual([true, true, true])
    expect(w.accept(3)).toBe(false) // replay
    expect(w.accept(6)).toBe(true)
    expect(w.accept(5)).toBe(true) // reordered
    expect(w.accept(5)).toBe(false)
    expect(w.accept(0)).toBe(false)
    expect(w.accept(1.5)).toBe(false)
    expect(w.accept(6 + SEQ_WINDOW + 5)).toBe(true)
    expect(w.accept(4)).toBe(false) // now too far behind
  })

  it('does not use up a number for a message that failed to authenticate', () => {
    const w = new SeqWindow()
    expect(w.check(9)).toBe(true) // seen on the wire, decryption failed: nothing committed
    expect(w.check(9)).toBe(true)
    w.commit(9)
    expect(w.check(9)).toBe(false)
  })
})

describe('seal: key agreement signature', () => {
  it('detects a substituted server key', async () => {
    const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const pinned = await crypto.subtle.exportKey('jwk', signing.publicKey)
    const client = await generateKeyPair(), server = await generateKeyPair(), mitm = await generateKeyPair()
    const sig = await signTranscript(signing.privateKey, transcript('sid', 'kid', client.publicJwk, server.publicJwk))
    expect(await verifyTranscript(pinned, transcript('sid', 'kid', client.publicJwk, server.publicJwk), sig)).toBe(true)
    expect(await verifyTranscript(pinned, transcript('sid', 'kid', client.publicJwk, mitm.publicJwk), sig)).toBe(false)
    expect(await verifyTranscript(pinned, transcript('other', 'kid', client.publicJwk, server.publicJwk), sig)).toBe(false)
  })
})
