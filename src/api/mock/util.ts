import type { Grants } from '@/access/catalog'
import { hasLevel } from '@/access/dependencies'
import type { Envelope, TransportRequest, TransportResponse } from '../types'

export const ok = (info: unknown, status = 200): TransportResponse => ({ status, body: { status, message: 'OK', info } })
export const fail = (status: number, code: string, info?: unknown): TransportResponse => ({
  status, body: { status, message: code, code, info: { code, ...(info as object) }, request_id: crypto.randomUUID() } as Envelope,
})
export const validation = (errors: Record<string, string>) => fail(400, 'validation_failed', { errors })
export const iso = (ms = Date.now()) => new Date(ms).toISOString()
export const uuid = () => crypto.randomUUID()
export const conflict = (have: number, sent: unknown) => sent !== undefined && sent !== null && Number(sent) !== have
export const vconflict = (v: number) => fail(409, 'version_conflict', { version: v })

export function page<T>(items: T[], q: URLSearchParams): { items: T[]; next_cursor?: string } {
  const limit = Math.min(200, Math.max(1, Number(q.get('limit') ?? 50)))
  const start = q.get('cursor') ? Number(atob(q.get('cursor')!)) : 0
  const slice = items.slice(start, start + limit)
  return { items: slice, next_cursor: start + limit < items.length ? btoa(String(start + limit)) : undefined }
}

export interface DomainCtx { email: string; grants: Grants; elevated: boolean }
export type Need = [resource: string, level: string]
export type NeedRule = [method: RegExp, path: RegExp, need: Need]
export type SensitiveRule = [method: RegExp, path: RegExp]

/** Permission and step-up checks shared by the mock areas. Returns a refusal, or null to go on. */
export function guard(req: TransportRequest, path: string, ctx: DomainCtx, needs: NeedRule[], sensitive: SensitiveRule[]): TransportResponse | null {
  const need = needs.find(([m, p]) => m.test(req.method) && p.test(path))?.[2]
  if (need && !hasLevel(ctx.grants, need[0], need[1])) return fail(403, 'permission_denied', { required: `${need[0]}:${need[1]}` })
  if (sensitive.some(([m, p]) => m.test(req.method) && p.test(path)) && !ctx.elevated) {
    return fail(403, 'step_up_required', { step_up: '/admin/step-up' })
  }
  return null
}
