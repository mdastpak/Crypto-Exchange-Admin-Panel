import { requestStepUp } from '@/auth/step-up-store'
import { useSession } from '@/auth/session-store'
import { isSealedRoute, staysPlain } from '@/crypto/classes'
import { SealError, isEnvelope, open, seal } from '@/crypto/seal'
import { API_MODE } from '@/lib/env'
import { httpTransport } from './http-transport'
import { mockTransport } from './mock/server'
import { ApiError, type Transport, type TransportRequest } from './types'

let transport: Transport = API_MODE === 'http' ? httpTransport : mockTransport

/** Tests replace the transport. */
export function setTransport(t: Transport) {
  transport = t
}

const SESSION_ENDED_CODES: Record<string, 'revoked'> = {
  token_invalid: 'revoked',
  token_revoked: 'revoked',
  token_missing: 'revoked',
  session_inactive: 'revoked',
  admin_inactive: 'revoked',
}

interface CallOptions {
  /** Do not ask for a step-up on `403 step_up_required`. Used by the step-up call itself. */
  skipStepUp?: boolean
  signal?: AbortSignal
}

/**
 * The single choke point for backend calls: adds the token, unwraps the
 * envelope, ends the session on a dead token, and runs the step-up dialog
 * once when the backend asks for it.
 */
async function call<T>(
  method: TransportRequest['method'],
  path: string,
  body?: unknown,
  opts: CallOptions = {},
  retried = false
): Promise<T> {
  const { token, seal: sealState } = useSession.getState()
  const sealedRoute = !!sealState && isSealedRoute(path)
  const requestId = crypto.randomUUID()
  let res
  try {
    let sealedBody
    if (sealedRoute && sealState && body !== undefined) {
      // The sequence number is taken now, before any await, so concurrent requests never share one.
      const seq = sealState.nextSeq++
      sealedBody = await seal(sealState.key, { kid: sealState.kid, sid: sealState.sid, direction: 'req', seq, method, path, requestId }, body)
    }
    res = await transport({ method, path, body: sealedBody ? undefined : body, sealedBody, requestId, token, signal: opts.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'network', 'network')
  }
  let env = res.body
  if (sealedRoute && sealState) {
    if (res.sealed) {
      try {
        if (!isEnvelope(res.sealed) || res.sealed.kid !== sealState.kid || !sealState.responses.check(res.sealed.seq)) throw new SealError('seq')
        env = await open(sealState.key, { sid: sealState.sid, direction: 'res', method, path, requestId }, res.sealed)
        sealState.responses.commit(res.sealed.seq)
      } catch {
        // Never show what could not be authenticated.
        throw new ApiError(0, 'seal_invalid', 'seal_invalid', undefined, requestId)
      }
    } else if (res.status < 400 || !staysPlain(res.status)) {
      // A sealed route that answers in the clear could be a downgrade: refuse it.
      throw new ApiError(0, 'seal_invalid', 'seal_invalid', undefined, requestId)
    }
  }
  if (res.status >= 400) {
    const code = env.code ?? 'error'
    if (res.status === 401 && token && SESSION_ENDED_CODES[code]) {
      useSession.getState().end('revoked')
    }
    if (res.status === 403 && code === 'password_expired') useSession.getState().setPasswordExpired(true)
    if (res.status === 403 && code === 'step_up_required' && !opts.skipStepUp && !retried) {
      if (await requestStepUp()) return call<T>(method, path, body, opts, true)
    }
    throw new ApiError(res.status, code, env.message, env.info, env.request_id)
  }
  return env.info as T
}

export const api = {
  get: <T>(path: string, opts?: CallOptions) => call<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('POST', path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('PUT', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('PATCH', path, body, opts),
  del: <T>(path: string, opts?: CallOptions) => call<T>('DELETE', path, undefined, opts),
}
