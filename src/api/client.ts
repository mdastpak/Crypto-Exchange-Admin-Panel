import { requestStepUp } from '@/auth/step-up-store'
import { useSession } from '@/auth/session-store'
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
  const { token } = useSession.getState()
  let res
  try {
    res = await transport({ method, path, body, token, signal: opts.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'network', 'network')
  }
  const env = res.body
  if (res.status >= 400) {
    const code = env.code ?? 'error'
    if (res.status === 401 && token && SESSION_ENDED_CODES[code]) {
      useSession.getState().end('revoked')
    }
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
