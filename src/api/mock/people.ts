/* eslint-disable @typescript-eslint/no-explicit-any -- the mock reads loosely typed request bodies on purpose */
import { hasLevel } from '@/access/dependencies'
import type { ActivityEvent, KycCase, KycState, Ticket, TicketStats, UserLookup, UserProfile, UserRow, Verification } from '../models'
import type { TransportRequest, TransportResponse } from '../types'
import { fail, guard, iso, ok, page, uuid, validation, type DomainCtx, type NeedRule, type SensitiveRule } from './util'

/**
 * Mock of requirement 02 (users, KYC) and 04 (tickets). The lookup route
 * returns only the blocks the caller's grants allow, as the backend must.
 */

const NEEDS: NeedRule[] = [
  [/^POST$/, /^\/admin\/users\/query$/, ['users', 'lookup']],
  [/^POST$/, /^\/admin\/users\/[\w-]+\/reveal$/, ['reveal_pii', 'allow']],
  [/^POST$/, /^\/admin\/users\/[\w-]+\/verification\/level$/, ['kyc', 'approve']],
  [/^GET$/, /^\/admin\/users\/[\w-]+\/activity$/, ['users', 'view']],
  [/^GET$/, /^\/admin\/users\/[\w-]+\/verification$/, ['kyc', 'status']],
  [/^GET$/, /^\/admin\/users\/[\w-]+(\/lookup)?$/, ['users', 'lookup']],
  [/^GET$/, /^\/admin\/kyc\/cases\/[\w-]+\/documents\//, ['kyc_documents', 'allow']],
  [/^GET$/, /^\/admin\/kyc\/cases/, ['kyc', 'view']],
  [/^POST$/, /^\/admin\/kyc\/cases/, ['kyc', 'approve']],
  [/^GET$/, /^\/admin\/tickets/, ['tickets', 'view']],
  [/^POST$/, /^\/admin\/tickets\/query$/, ['tickets', 'view']],
  [/^(POST|PUT)$/, /^\/admin\/tickets/, ['tickets', 'edit']],
]
const SENSITIVE: SensitiveRule[] = [
  [/^POST$/, /^\/admin\/users\/[\w-]+\/(reveal|verification\/level)$/],
  [/^GET$/, /^\/admin\/kyc\/cases\/[\w-]+\/documents\//],
  [/^POST$/, /^\/admin\/kyc\/cases\/[\w-]+\/decision$/],
]

interface UserRec extends UserProfile { email: string; mobile: string; name: string; national_id: string }
let users: UserRec[] = []
let cases: KycCase[] = []
let tickets: Ticket[] = []
let verification: Record<string, Verification> = {}
let activity: ActivityEvent[] = []

const ago = (min: number) => iso(Date.now() - min * 60_000)
const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2')
const maskMobile = (m: string) => m.replace(/^(\+\d{2})\d+(\d{3})$/, '$1*****$2')
export const USER_IDS = Array.from({ length: 12 }, (_, i) => `9c1a00${String(i + 1).padStart(2, '0')}-aaaa-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`)

export function resetPeople() {
  const names = ['علی رضایی', 'مریم کریمی', 'حسین احمدی', 'زهرا موسوی', 'رضا نوری', 'سارا حیدری', 'امیر صادقی', 'نیلوفر رحیمی', 'کامران فرهادی', 'لیلا مرادی', 'پویا اکبری', 'مهسا سلطانی']
  users = USER_IDS.map((hk, i): UserRec => {
    const status: UserRow['status'] = i === 4 ? 'SUSPENDED' : i === 9 ? 'BANNED' : 'ACTIVE'
    const level = [2, 1, 3, 2, 0, 1, 3, 2, 1, 0, 2, 1][i]
    const kyc: KycState = ([ 'approved', 'in_review', 'approved', 'approved', 'none', 'pending', 'approved', 'needs_info', 'rejected', 'none', 'approved', 'pending'] as KycState[])[i]
    const email = `user${i + 1}@mail.example`
    return {
      hk, email, mobile: `+98912${String(1000000 + i * 7919).slice(0, 7)}`, name: names[i], national_id: `00${(1234567 + i * 31).toString().padStart(8, '0')}`,
      email_masked: maskEmail(email), mobile_masked: maskMobile(`+98912${String(1000000 + i * 7919).slice(0, 7)}`), name_masked: names[i].replace(/(\S)\S*$/, '$1***'),
      status, level, kyc_state: kyc, created_at: ago(60 * 24 * (10 + i * 9)), last_sign_in_at: ago(30 * (i + 1)), country: 'IR',
      counts: { sessions: i % 3, restrictions_active: i === 0 ? 1 : 0 }, flags: i === 4 ? ['security_hold'] : i === 9 ? ['court_order'] : [],
      security_hold_until: i === 4 ? iso(Date.now() + 20 * 3_600_000) : undefined,
    }
  })
  cases = users.filter((u) => ['pending', 'in_review', 'needs_info', 'rejected', 'approved'].includes(u.kyc_state)).slice(0, 8).map((u, i): KycCase => ({
    id: `kyc-${300 + i}`, user_hk: u.hk, status: u.kyc_state as KycCase['status'], level_requested: u.level + 1, assigned_to: u.kyc_state === 'in_review' ? 'mina@exchange.example' : undefined,
    created_at: ago(60 * (3 + i * 11)),
    checks: { identity: i % 4 === 3 ? 'fail' : i % 3 === 2 ? 'pending' : 'pass', liveness: i % 5 === 4 ? 'fail' : 'pass', sanctions: i === 6 ? 'match' : i % 3 === 2 ? 'pending' : 'clear' },
    documents: [{ id: 'd1', kind: 'national_id_front', name: 'id-front.jpg', uploaded_at: ago(60 * (3 + i * 11)) }, { id: 'd2', kind: 'national_id_back', name: 'id-back.jpg', uploaded_at: ago(60 * (3 + i * 11)) }, { id: 'd3', kind: 'selfie', name: 'selfie.jpg', uploaded_at: ago(60 * (3 + i * 11)) }],
    notes: i === 1 ? [{ by: 'mina@exchange.example', at: ago(120), text: 'Photo is blurry; asked the user for a new one.' }] : [],
  }))
  verification = Object.fromEntries(users.map((u) => [u.hk, {
    level: u.level, allows: { deposit: u.level >= 1, trade: u.level >= 1, withdraw: u.level >= 2 },
    limits: u.level >= 2 ? [{ currency: 'USDT', daily: u.level === 3 ? '100000' : '10000', remaining: u.level === 3 ? '98000' : '7600' }] : [],
    history: u.level ? [{ from: 0, to: u.level, by: 'mina@exchange.example', at: ago(60 * 24 * 12), reason: 'Documents verified' }] : [],
  }]))
  activity = Array.from({ length: 30 }, (_, i) => ({ id: uuid(), at: ago(i * 53 + 4), action: ['user.sign_in', 'user.password_change', 'user.withdrawal_request', 'user.session_revoke'][i % 4], ip: `198.51.100.${10 + (i % 6)}`, outcome: i % 9 === 0 ? 'failure' : 'success' }))
  const mt = (id: string, user: string, subject: string, category: string, priority: Ticket['priority'], status: Ticket['status'], assignee: string | undefined, sla: Ticket['sla_state'], minAgo: number, msgs: { who: 'user' | 'agent'; internal?: boolean; body: string }[]): Ticket => ({
    id, user_hk: user, subject, category, priority, status, assignee, sla_state: sla, created_at: ago(minAgo), updated_at: ago(Math.max(1, minAgo - 40)),
    messages: msgs.map((m, i) => ({ id: `${id}-m${i}`, author_type: m.who, author: m.who === 'user' ? 'user' : 'sara@exchange.example', internal: !!m.internal, body: m.body, created_at: ago(minAgo - i * 15) })),
  })
  tickets = [
    mt('T-2201', USER_IDS[0], 'برداشت USDT معلق مانده', 'withdrawal', 'high', 'open', undefined, 'at_risk', 180, [{ who: 'user', body: 'برداشت من دو ساعت است در حال بررسی است.' }]),
    mt('T-2198', USER_IDS[1], 'کد پیامکی نمی‌رسد', 'account', 'normal', 'pending_user', 'sara@exchange.example', 'ok', 900, [{ who: 'user', body: 'کد پیامکی برای ورود نمی‌رسد.' }, { who: 'agent', body: 'لطفاً شمارهٔ ثبت‌شده را بررسی کنید.' }, { who: 'agent', internal: true, body: 'Kavenegar had errors earlier today.' }]),
    mt('T-2190', USER_IDS[2], 'درخواست ارتقای سطح', 'kyc', 'low', 'solved', 'sara@exchange.example', 'ok', 4000, [{ who: 'user', body: 'مدارک را بارگذاری کردم.' }, { who: 'agent', body: 'مدارک شما در حال بررسی است.' }]),
    mt('T-2185', USER_IDS[3], 'اختلاف در موجودی', 'ledger', 'urgent', 'open', 'sara@exchange.example', 'breached', 2600, [{ who: 'user', body: 'موجودی تتر من با آنچه واریز کردم نمی‌خواند.' }]),
    mt('T-2180', USER_IDS[5], 'تغییر ایمیل حساب', 'account', 'normal', 'open', undefined, 'ok', 300, [{ who: 'user', body: 'می‌خواهم ایمیلم را عوض کنم.' }]),
    mt('T-2171', USER_IDS[6], 'سؤال دربارهٔ کارمزد', 'fees', 'low', 'closed', 'sara@exchange.example', 'ok', 9000, [{ who: 'user', body: 'کارمزد معاملات OTC چقدر است؟' }, { who: 'agent', body: 'بین ۰٫۱ تا ۰٫۳ درصد.' }]),
  ]
}
resetPeople()

const kycOf = (hk: string) => cases.find((c) => c.user_hk === hk)
const asRow = (u: UserRec): UserRow => ({ hk: u.hk, email_masked: u.email_masked, mobile_masked: u.mobile_masked, status: u.status, level: u.level, kyc_state: u.kyc_state, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })
const profile = ({ email: _e, mobile: _m, name: _n, national_id: _i, ...rest }: UserRec): UserProfile => rest

function lookupFor(u: UserRec, ctx: DomainCtx): UserLookup {
  const g = ctx.grants
  const out: UserLookup = {}
  if (hasLevel(g, 'users', 'lookup')) out.user = asRow(u)
  if (hasLevel(g, 'kyc', 'status')) out.kyc = { state: u.kyc_state, level: u.level, last_decision_at: kycOf(u.hk)?.status === 'approved' ? ago(60 * 24 * 12) : undefined }
  if (hasLevel(g, 'withdrawals', 'status')) out.withdrawals = [{ id: 'w-1042', amount: '25000', currency: 'USDT', status: 'review', created_at: ago(35) }, { id: 'w-1030', amount: '150000000', currency: 'IRT', status: 'completed', created_at: ago(2000) }]
  if (hasLevel(g, 'transactions', 'status')) out.transactions = [{ id: 'tx-77', kind: 'deposit', currency: 'USDT', status: 'settled', created_at: ago(600) }, { id: 'tx-78', kind: 'otc_trade', currency: 'BTC', status: 'settled', created_at: ago(300) }]
  if (hasLevel(g, 'requests', 'status')) out.requests = tickets.filter((t) => t.user_hk === u.hk).map((t) => ({ id: t.id, kind: 'ticket', status: t.status, created_at: t.created_at }))
  if (hasLevel(g, 'system_health', 'view')) out.system_health = { mode: 'open', lockdowns: ['withdrawals'], price_engine: 'ok', venues_stale: 1 }
  return out
}

export function handlePeople(req: TransportRequest, ctx: DomainCtx): TransportResponse | null {
  const url = new URL(req.path, 'http://x')
  const path = url.pathname
  const q = url.searchParams
  if (!/^\/admin\/(users|kyc|tickets)/.test(path) || /\/restrictions/.test(path)) return null
  const denied = guard(req, path, ctx, NEEDS, SENSITIVE)
  if (denied) return denied
  const body = (req.body ?? {}) as Record<string, any>
  let m: RegExpExecArray | null

  /* users */
  if (path === '/admin/users/query' && req.method === 'POST') {
    let list = users
    const email = String(body.email ?? '').trim().toLowerCase()
    const mobile = String(body.mobile ?? '').trim()
    // Exact match only: the backend searches by blind index, never by scanning decrypted values.
    if (email) list = list.filter((u) => u.email === email)
    if (mobile) list = list.filter((u) => u.mobile === mobile)
    if (body.hk) list = list.filter((u) => u.hk === String(body.hk).toLowerCase())
    if (body.status) list = list.filter((u) => u.status === body.status)
    if (body.level !== undefined && body.level !== '') list = list.filter((u) => u.level === Number(body.level))
    const qs = new URLSearchParams({ limit: String(body.limit ?? 50), ...(body.cursor ? { cursor: String(body.cursor) } : {}) })
    return ok(page(list.map(asRow), qs))
  }
  if ((m = /^\/admin\/users\/([\w-]+)$/.exec(path)) && req.method === 'GET') {
    const u = users.find((x) => x.hk === m![1])
    return u ? ok(profile(u)) : fail(404, 'not_found')
  }
  if ((m = /^\/admin\/users\/([\w-]+)\/lookup$/.exec(path)) && req.method === 'GET') {
    const u = users.find((x) => x.hk === m![1])
    return u ? ok(lookupFor(u, ctx)) : fail(404, 'not_found')
  }
  if ((m = /^\/admin\/users\/([\w-]+)\/reveal$/.exec(path)) && req.method === 'POST') {
    const u = users.find((x) => x.hk === m![1])
    if (!u) return fail(404, 'not_found')
    const reason = String(body.reason ?? '').trim()
    const fields = (body.fields ?? []) as string[]
    const errors: Record<string, string> = {}
    if (!reason || reason.length > 1000) errors.reason = 'from 1 to 1000 characters'
    if (!fields.length || fields.some((f) => !['email', 'mobile', 'name', 'national_id'].includes(f))) errors.fields = 'choose from email, mobile, name, national_id'
    if (Object.keys(errors).length) return validation(errors)
    return ok({ values: Object.fromEntries(fields.map((f) => [f, (u as any)[f]])), audited: true })
  }
  if ((m = /^\/admin\/users\/([\w-]+)\/verification$/.exec(path)) && req.method === 'GET') return verification[m[1]] ? ok(verification[m[1]]) : fail(404, 'not_found')
  if ((m = /^\/admin\/users\/([\w-]+)\/verification\/level$/.exec(path)) && req.method === 'POST') {
    const u = users.find((x) => x.hk === m![1])
    if (!u) return fail(404, 'not_found')
    const level = Number(body.level), reason = String(body.reason ?? '').trim()
    if (!Number.isInteger(level) || level < 0 || level > 3) return validation({ level: 'from 0 to 3' })
    if (!reason) return validation({ reason: 'is required' })
    if (level > 2 && ctx.email === 'nobody') return fail(403, 'second_approval_required')
    verification[u.hk].history.unshift({ from: u.level, to: level, by: ctx.email, at: iso(), reason })
    u.level = level; verification[u.hk].level = level
    return ok(verification[u.hk])
  }
  if ((m = /^\/admin\/users\/([\w-]+)\/activity$/.exec(path)) && req.method === 'GET') return users.some((x) => x.hk === m![1]) ? ok(page(activity, q)) : fail(404, 'not_found')

  /* KYC */
  if (path === '/admin/kyc/cases' && req.method === 'GET') {
    let list = cases
    if (q.get('status')) list = list.filter((c) => c.status === q.get('status'))
    if (q.get('assigned_to')) list = list.filter((c) => c.assigned_to === (q.get('assigned_to') === 'me' ? ctx.email : q.get('assigned_to')))
    return ok(page(list.map(({ documents: _d, notes: _n, ...c }) => c), q))
  }
  if ((m = /^\/admin\/kyc\/cases\/([\w-]+)$/.exec(path)) && req.method === 'GET') {
    const c = cases.find((x) => x.id === m![1])
    return c ? ok(c) : fail(404, 'not_found')
  }
  if ((m = /^\/admin\/kyc\/cases\/([\w-]+)\/documents\/([\w-]+)$/.exec(path)) && req.method === 'GET') {
    const c = cases.find((x) => x.id === m![1])
    const d = c?.documents?.find((x) => x.id === m![2])
    if (!c || !d) return fail(404, 'not_found')
    return ok({ kind: d.kind, content_type: 'image/jpeg', expires_at: iso(Date.now() + 60_000), note: 'Short-lived signed URL (mock). Opening it is audited.' })
  }
  if ((m = /^\/admin\/kyc\/cases\/([\w-]+)\/(claim|decision)$/.exec(path)) && req.method === 'POST') {
    const c = cases.find((x) => x.id === m![1])
    if (!c) return fail(404, 'not_found')
    if (m[2] === 'claim') {
      if (c.assigned_to && c.assigned_to !== ctx.email) return fail(409, 'conflict', { assigned_to: c.assigned_to })
      c.assigned_to = ctx.email
      return ok(c)
    }
    const decision = String(body.decision ?? ''), reason = String(body.reason ?? '').trim()
    const errors: Record<string, string> = {}
    if (!['approve', 'reject', 'needs_info'].includes(decision)) errors.decision = 'is not a decision'
    if (!reason) errors.reason = 'is required'
    if (decision === 'approve' && !(Number(body.level) >= 1 && Number(body.level) <= 3)) errors.level = 'from 1 to 3'
    if (Object.keys(errors).length) return validation(errors)
    if (['approved', 'rejected'].includes(c.status)) return fail(409, 'conflict', { status: c.status })
    if (c.assigned_to !== ctx.email) return fail(409, 'conflict', { assigned_to: c.assigned_to ?? null })
    const u = users.find((x) => x.hk === c.user_hk)!
    c.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_info'
    u.kyc_state = c.status
    if (decision === 'approve') { u.level = Number(body.level); verification[u.hk].level = u.level; verification[u.hk].history.unshift({ from: verification[u.hk].level, to: u.level, by: ctx.email, at: iso(), reason }) }
    return ok(c)
  }

  /* tickets */
  if (path === '/admin/tickets/query' && req.method === 'POST') {
    let list = tickets
    for (const k of ['status', 'category', 'priority', 'assignee', 'user_hk', 'sla_state'] as const) if (body[k]) list = list.filter((t) => String((t as any)[k] === undefined ? '' : (t as any)[k]) === (k === 'assignee' && body[k] === 'me' ? ctx.email : body[k]))
    const qs = new URLSearchParams({ limit: String(body.limit ?? 50), ...(body.cursor ? { cursor: String(body.cursor) } : {}) })
    return ok(page(list.map(({ messages: _m, ...t }) => t), qs))
  }
  if (path === '/admin/tickets/stats' && req.method === 'GET') {
    const stats: TicketStats = { backlog: tickets.filter((t) => ['open', 'pending_internal'].includes(t.status)).length, first_response_minutes: 42, resolution_hours: 9.5, sla_breaches: tickets.filter((t) => t.sla_state === 'breached').length, by_agent: [{ agent: 'sara@exchange.example', open: tickets.filter((t) => t.assignee === 'sara@exchange.example' && t.status !== 'closed' && t.status !== 'solved').length }] }
    return ok(stats)
  }
  if ((m = /^\/admin\/tickets\/([\w-]+)$/.exec(path)) && req.method === 'GET') {
    const t = tickets.find((x) => x.id === m![1])
    return t ? ok(t) : fail(404, 'not_found')
  }
  if ((m = /^\/admin\/tickets\/([\w-]+)\/(claim|messages|status|priority)$/.exec(path))) {
    const t = tickets.find((x) => x.id === m![1])
    if (!t) return fail(404, 'not_found')
    const touch = () => { t.updated_at = iso() }
    if (m[2] === 'claim') {
      if (t.assignee && t.assignee !== ctx.email) return fail(409, 'conflict', { assignee: t.assignee })
      t.assignee = ctx.email; touch(); return ok(t)
    }
    if (m[2] === 'messages') {
      const text = String(body.body ?? '').trim()
      if (!text || text.length > 5000) return validation({ body: 'from 1 to 5000 characters' })
      t.messages!.push({ id: `${t.id}-m${t.messages!.length}`, author_type: 'agent', author: ctx.email, internal: !!body.internal, body: text, created_at: iso() })
      if (!body.internal && t.status === 'open') t.status = 'pending_user'
      touch(); return ok(t, 201)
    }
    if (m[2] === 'status') {
      if (!['open', 'pending_user', 'pending_internal', 'solved', 'closed'].includes(body.status)) return validation({ status: 'is not a status' })
      t.status = body.status; touch(); return ok(t)
    }
    if (m[2] === 'priority') {
      if (!['low', 'normal', 'high', 'urgent'].includes(body.priority)) return validation({ priority: 'is not a priority' })
      t.priority = body.priority; touch(); return ok(t)
    }
  }
  return fail(404, 'not_found')
}
