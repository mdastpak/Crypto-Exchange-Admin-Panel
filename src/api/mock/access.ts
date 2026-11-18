/* eslint-disable @typescript-eslint/no-explicit-any -- the mock reads loosely typed request bodies on purpose */
import { REQUIREMENTS, RESOURCES, type Grants } from '@/access/catalog'
import { applyDependencies, levelIndex } from '@/access/dependencies'
import type { TransportRequest, TransportResponse } from '../types'
import { addChange, admins, changes, grantsOf, groups, policy, publicChange, type AdminRec, type Assignment, type GroupRec } from './directory'
import { fail, guard, iso, ok, validation, type DomainCtx, type NeedRule, type SensitiveRule } from './util'

const NEEDS: NeedRule[] = [
  [/^POST$/, /^\/admin\/access\/preview/, ['access', 'view']],
  [/^GET$/, /^\/admin\/access\//, ['access', 'view']],
  [/^(POST|PUT|DELETE)$/, /^\/admin\/access\//, ['access', 'manage']],
  [/^GET$/, /^\/admin\/staff/, ['staff', 'view']],
  [/^(POST|PUT|DELETE)$/, /^\/admin\/staff/, ['staff', 'manage']],
  [/^GET$/, /^\/admin\/security\//, ['security', 'view']],
  [/^PUT$/, /^\/admin\/security\//, ['security', 'manage']],
]
const SENSITIVE: SensitiveRule[] = [
  [/^(POST|PUT)$/, /^\/admin\/access\/(groups|changes)/],
  [/^(POST|PUT)$/, /^\/admin\/staff/],
  [/^PUT$/, /^\/admin\/security\/policy$/],
]

const INCOMPATIBLE: [string, string][] = [['finance_analyst', 'finance_manager']]
const members = (id: string) => Object.values(admins).filter((a) => a.groups.some((g) => g.id === id)).length
const publicGroup = (g: GroupRec) => ({ id: g.id, name: g.name, description: g.description, status: g.status, system: g.system, version: g.version, grants: g.grants, members: members(g.id) })
const publicAdmin = (a: AdminRec) => ({
  hk: a.hk, email: a.email, status: a.status, groups: a.groups, totp_enabled: a.totp_enabled, last_sign_in_at: a.last_sign_in_at,
  password_changed_at: a.password_changed_at,
  password_expires_at: new Date(Date.parse(a.password_changed_at) + policy.password.max_age_days * 86_400_000).toISOString(),
  must_change_password: !!a.mustChangePassword,
})
const missingDeps = (grants: Grants) => applyDependencies(grants).added

export function handleAccess(req: TransportRequest, ctx: DomainCtx): TransportResponse | null {
  const url = new URL(req.path, 'http://x')
  const path = url.pathname
  if (!/^\/admin\/(access|staff|security)/.test(path)) return null
  const denied = guard(req, path, ctx, NEEDS, SENSITIVE)
  if (denied) return denied
  const body = (req.body ?? {}) as Record<string, any>
  const reason = String(body.reason ?? '').trim()
  const needReason = () => (!reason || reason.length > 1000 ? validation({ reason: 'from 1 to 1000 characters' }) : null)
  let m: RegExpExecArray | null

  /* catalog, groups, preview */
  if (path === '/admin/access/catalog' && req.method === 'GET') return ok({ resources: RESOURCES, requirements: REQUIREMENTS })
  if (path === '/admin/access/groups' && req.method === 'GET') return ok({ items: Object.values(groups).map(publicGroup) })
  if ((m = /^\/admin\/access\/groups\/([\w-]+)\/versions$/.exec(path)) && req.method === 'GET') {
    const g = groups[m[1]]
    return g ? ok({ items: [...g.versions].reverse() }) : fail(404, 'not_found')
  }
  if (path === '/admin/access/preview' && req.method === 'POST') {
    const r = applyDependencies((body.grants ?? {}) as Grants)
    return ok(r)
  }
  if (path === '/admin/access/groups' && req.method === 'POST') {
    const name = String(body.name ?? '').trim()
    const errors: Record<string, string> = {}
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) errors.name = 'lower-case letters, digits, underscores; 3 to 41 characters'
    if (groups[name]) errors.name = 'already exists'
    if (Object.keys(errors).length) return validation(errors)
    const r = needReason(); if (r) return r
    const grants = (body.grants ?? {}) as Grants
    if (missingDeps(grants).length) return fail(422, 'dependency_missing', { missing: missingDeps(grants) })
    const ch = addChange({
      kind: 'group_create', summary: name, requested_by: ctx.email, reason, payload: { name, grants },
      apply: (by) => { groups[name] = { id: name, name, description: String(body.description ?? ''), status: 'active', system: false, version: 1, grants, versions: [{ version: 1, grants, reason, author: ctx.email, approved_by: by, at: iso() }] } },
    })
    return ok(publicChange(ch), 202)
  }
  if ((m = /^\/admin\/access\/groups\/([\w-]+)(?:\/(retire))?$/.exec(path))) {
    const g = groups[m[1]]
    if (!g) return fail(404, 'not_found')
    if (g.system) return fail(409, 'system_group')
    const r = needReason(); if (r) return r
    if (m[2] === 'retire' && req.method === 'POST') {
      const ch = addChange({ kind: 'group_change', summary: `${g.id} (retire)`, requested_by: ctx.email, reason, payload: { retire: true }, apply: () => { g.status = 'retired' } })
      return ok(publicChange(ch), 202)
    }
    if (req.method === 'PUT') {
      const grants = (body.grants ?? {}) as Grants
      const missing = missingDeps(grants)
      if (missing.length) return fail(422, 'dependency_missing', { missing })
      const ch = addChange({
        kind: 'group_change', summary: g.id, requested_by: ctx.email, reason, payload: { grants },
        apply: (by) => { g.version++; g.grants = grants; g.versions.push({ version: g.version, grants, reason, author: ctx.email, approved_by: by, at: iso() }) },
      })
      return ok(publicChange(ch), 202)
    }
  }
  if ((m = /^\/admin\/access\/effective\/([\w-]+)$/.exec(path)) && req.method === 'GET') {
    const a = Object.values(admins).find((x) => x.hk === m![1])
    if (!a) return fail(404, 'not_found')
    const rows = Object.entries(grantsOf(a.email)).map(([resource, level]) => ({
      resource, level,
      by: a.groups.filter((asg) => !asg.expires_at || Date.parse(asg.expires_at) > Date.now()).map((asg) => asg.id).filter((id) => levelIndex(resource, groups[id]?.grants[resource] ?? 'none') >= levelIndex(resource, level) && groups[id]?.grants[resource]),
    }))
    return ok({ email: a.email, grants: rows })
  }

  /* pending two-person changes */
  if (path === '/admin/access/changes' && req.method === 'GET') return ok({ items: changes.map(publicChange) })
  if ((m = /^\/admin\/access\/changes\/([\w-]+)\/(approve|reject)$/.exec(path)) && req.method === 'POST') {
    const c = changes.find((x) => x.id === m![1])
    if (!c) return fail(404, 'not_found')
    if (c.status !== 'pending') return fail(409, 'already_resolved')
    if (c.requested_by === ctx.email) return fail(403, 'second_approval_required')
    c.decided_by = ctx.email; c.decided_at = iso()
    if (m[2] === 'approve') { c.apply(ctx.email); c.status = 'approved' } else c.status = 'rejected'
    return ok(publicChange(c))
  }

  /* staff */
  if (path === '/admin/staff' && req.method === 'GET') return ok({ items: Object.values(admins).map(publicAdmin) })
  if (path === '/admin/staff' && req.method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const errors: Record<string, string> = {}
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'is not an email address'
    if (admins[email]) errors.email = 'already an administrator'
    const asg = (body.groups ?? []) as Assignment[]
    if (!asg.length) errors.groups = 'at least one group is required'
    if (asg.some((x) => !groups[x.id] || groups[x.id].status !== 'active')) errors.groups = 'unknown or retired group'
    if (Object.keys(errors).length) return validation(errors)
    const r = needReason(); if (r) return r
    const ch = addChange({
      kind: 'staff_create', summary: email, requested_by: ctx.email, reason, payload: { email, groups: asg },
      apply: () => { admins[email] = { hk: crypto.randomUUID(), email, password: 'pending-enrolment-password', status: 'active', groups: asg, totp_enabled: false, password_changed_at: iso(), mustChangePassword: true } },
    })
    return ok(publicChange(ch), 202)
  }
  if ((m = /^\/admin\/staff\/([\w-]+)\/(groups|disable|enable|reset-totp|sessions)$/.exec(path))) {
    const a = Object.values(admins).find((x) => x.hk === m![1])
    if (!a) return fail(404, 'not_found')
    if (m[2] === 'sessions' && req.method === 'GET') return ok({ items: [] })
    const r = needReason(); if (r) return r
    if (a.email === ctx.email) return fail(403, 'self_change')
    const supers = () => Object.values(admins).filter((x) => x.status === 'active' && x.groups.some((g) => g.id === 'super_admin'))
    if (m[2] === 'groups' && req.method === 'PUT') {
      const asg = (body.groups ?? []) as Assignment[]
      if (!asg.length || asg.some((x) => !groups[x.id] || groups[x.id].status !== 'active')) return validation({ groups: 'unknown or retired group' })
      const ids = asg.map((x) => x.id)
      if (INCOMPATIBLE.some(([x, y]) => ids.includes(x) && ids.includes(y))) return fail(409, 'incompatible_grants', { groups: INCOMPATIBLE[0] })
      if (a.groups.some((g) => g.id === 'super_admin') && !ids.includes('super_admin') && supers().length <= 2) return fail(409, 'last_super_admin')
      const ch = addChange({ kind: 'staff_groups', summary: a.email, requested_by: ctx.email, reason, payload: { groups: asg }, apply: () => { a.groups = asg } })
      return ok(publicChange(ch), 202)
    }
    if (m[2] === 'disable' && req.method === 'POST') {
      if (a.groups.some((g) => g.id === 'super_admin') && supers().length <= 2) return fail(409, 'last_super_admin')
      a.status = 'disabled'
      return ok(publicAdmin(a))
    }
    if (m[2] === 'enable' && req.method === 'POST') { a.status = 'active'; return ok(publicAdmin(a)) }
    if (m[2] === 'reset-totp' && req.method === 'POST') {
      const ch = addChange({ kind: 'staff_reset_totp', summary: a.email, requested_by: ctx.email, reason, payload: {}, apply: () => { a.totp_enabled = false } })
      return ok(publicChange(ch), 202)
    }
  }

  /* security policy */
  if (path === '/admin/security/policy' && req.method === 'GET') return ok(policy)
  if (path === '/admin/security/policy' && req.method === 'PUT') {
    const r = needReason(); if (r) return r
    const pw = body.password ?? {}, ss = body.session ?? {}
    const errors: Record<string, string> = {}
    const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
    if (!int(pw.min_length, 12, 128)) errors['password.min_length'] = 'from 12 to 128'
    if (!int(pw.max_age_days, 7, 365)) errors['password.max_age_days'] = 'from 7 to 365'
    if (!int(pw.reset_delay_hours, 0, 168)) errors['password.reset_delay_hours'] = 'from 0 to 168'
    if (!int(pw.post_reset_hold_hours, 0, 168)) errors['password.post_reset_hold_hours'] = 'from 0 to 168'
    if (!int(ss.idle_minutes, 5, 60)) errors['session.idle_minutes'] = 'from 5 to 60'
    if (!int(ss.absolute_hours, 1, 12)) errors['session.absolute_hours'] = 'from 1 to 12'
    if (!int(ss.access_token_minutes, 5, 15)) errors['session.access_token_minutes'] = 'from 5 to 15'
    if (!int(ss.max_per_admin, 1, 3)) errors['session.max_per_admin'] = 'from 1 to 3'
    if (!int(ss.step_up_minutes, 1, 15)) errors['session.step_up_minutes'] = 'from 1 to 15'
    if (Object.keys(errors).length) return validation(errors)
    const ch = addChange({
      kind: 'policy_change', summary: 'security policy', requested_by: ctx.email, reason, payload: { password: pw, session: ss },
      apply: () => { policy.password = { ...policy.password, ...pw }; policy.session = { ...policy.session, ...ss }; policy.version++ },
    })
    return ok(publicChange(ch), 202)
  }
  return fail(404, 'not_found')
}
