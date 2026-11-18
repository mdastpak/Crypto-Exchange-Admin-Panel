import { API_MODE, SEALING, SEALING_PUBKEY } from '@/lib/env'
import { deriveSealKey, generateKeyPair, transcript, verifyTranscript, type KeyPair } from '@/crypto/seal'
import { newSealSession, type SealSession } from '@/crypto/session'

export interface SealOffer { pair: KeyPair; clientKey: JsonWebKey }
export interface SealAnswer { kid: string; sid: string; server_key: JsonWebKey; signature: string }

/** The key to verify the server's signature with: pinned at build time, or the mock's own in mock mode. */
async function pinnedKey(): Promise<JsonWebKey | null> {
  if (API_MODE === 'mock') return (await import('@/api/mock/server')).mockSealingPublicKey()
  if (!SEALING_PUBKEY) return null
  try { return JSON.parse(SEALING_PUBKEY) as JsonWebKey } catch { return null }
}

/** Step 1 of sign-in: an ephemeral key pair whose private half never leaves this tab. */
export async function offerSeal(): Promise<SealOffer | null> {
  if (SEALING === 'off') return null
  const pair = await generateKeyPair()
  return { pair, clientKey: pair.publicJwk }
}

/**
 * Step 2: check the server's signature over the key agreement against the pinned key, then derive
 * the session key. Returns null when the server did not answer with a seal and sealing is optional.
 */
export async function acceptSeal(offer: SealOffer | null, answer: SealAnswer | undefined): Promise<SealSession | null> {
  if (!offer) return null
  if (!answer) {
    if (SEALING === 'required') throw new Error('seal_required')
    return null
  }
  const pinned = await pinnedKey()
  if (!pinned) throw new Error('seal_unpinned')
  const ok = await verifyTranscript(pinned, transcript(answer.sid, answer.kid, offer.clientKey, answer.server_key), answer.signature)
  if (!ok) throw new Error('seal_bad_signature')
  const key = await deriveSealKey(offer.pair.privateKey, answer.server_key, answer.sid)
  return newSealSession(key, answer.kid, answer.sid)
}
