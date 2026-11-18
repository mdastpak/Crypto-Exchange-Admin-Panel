/** The envelope every backend endpoint answers with (docs/api.md, "Response envelope"). */
export interface Envelope<T = unknown> {
  status: number
  message: string
  code?: string
  request_id?: string
  info?: T
}

export interface TransportRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  token?: string | null
  signal?: AbortSignal
}

export interface TransportResponse {
  status: number
  body: Envelope
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly info: unknown
  readonly requestId?: string
  constructor(status: number, code: string, message: string, info?: unknown, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.info = info
    this.requestId = requestId
  }
}

export interface Policy {
  idleMs: number
  absoluteMs: number
  accessTokenMs: number
  warnMs: number
  stepUpMs: number
}

export interface Me {
  email: string
  groups: string[]
  grants: Record<string, string>
}
