/* eslint-disable @typescript-eslint/no-explicit-any -- the mock reads loosely typed request bodies on purpose */
import type {
  AuditEntry, IntegrityFinding, Payout, PayoutDetail, Restriction, RouteExplanation, RoutingRulesView, SmsStatus, VenueState, Withdrawal,
} from '../models'
import type { TransportRequest, TransportResponse } from '../types'
import { conflict, fail, guard, iso, ok, page, uuid, validation, vconflict, type DomainCtx, type NeedRule, type SensitiveRule } from './util'

/**
 * Mock of the money-flow area: withdrawals and payouts, restrictions, audit,
 * integrity findings, venues, OTC routing, and SMS routing. Shapes follow the
 * backend's swagger.json; rules follow docs/api.md.
 */

const NEEDS: NeedRule[] = [
  [/^GET$/, /^\/admin\/withdrawals/, ['withdrawals', 'view']],
  [/^POST$/, /^\/admin\/withdrawals/, ['withdrawals', 'approve']],
  [/^GET$/, /^\/admin\/payouts$/, ['payouts', 'view']],
  [/./, /^\/admin\/payouts\//, ['payouts', 'edit']],
  [/^GET$/, /^\/admin\/users\/[^/]+\/restrictions/, ['restrictions', 'request']],
  [/^POST$/, /^\/admin\/users\/[^/]+\/restrictions/, ['restrictions', 'edit']],
  [/^GET$/, /^\/admin\/audit/, ['audit', 'view']],
  [/^GET$/, /^\/admin\/integrity/, ['integrity', 'view']],
  [/^POST$/, /^\/admin\/integrity/, ['integrity', 'approve']],
  [/^GET$/, /^\/admin\/venues/, ['venues', 'view']],
  [/^POST$/, /^\/admin\/venues/, ['venues', 'approve']],
  [/^(GET|POST)$/, /^\/admin\/otc\/routing\/(rules|explain)/, ['otc', 'view']],
  [/^PUT$/, /^\/admin\/otc\/routing\/rules/, ['otc', 'edit']],
  [/^GET$/, /^\/admin\/notifications\/sms/, ['notifications', 'view']],
  [/^PUT$/, /^\/admin\/notifications\/sms/, ['notifications', 'edit']],
]
const SENSITIVE: SensitiveRule[] = [
  [/^POST$/, /^\/admin\/withdrawals\/[\w-]+\/(approve|reject)$/],
  [/^POST$/, /^\/admin\/payouts\/[\w-]+\/(complete|fail)$/],
  [/^POST$/, /^\/admin\/users\/[^/]+\/restrictions/],
  [/^POST$/, /^\/admin\/integrity\/findings\/\d+\/reseal$/],
  [/^POST$/, /^\/admin\/venues\/holds\//],
  [/^PUT$/, /^\/admin\/(otc\/routing\/rules|notifications\/sms)$/],
]

let withdrawals: Withdrawal[] = []
let payouts: PayoutDetail[] = []
let restrictions: Restriction[] = []
let audit: AuditEntry[] = []
let findings: IntegrityFinding[] = []
let venues: VenueState[] = []
let rules: RoutingRulesView = { enabled: true, cache_seconds: 10 }
let sms: SmsStatus

const USER_A = '9c1a0001-aaaa-4000-8000-000000000001'
const USER_B = '9c1a0002-bbbb-4000-8000-000000000002'
const ago = (min: number) => iso(Date.now() - min * 60_000)

export function resetMoney() {
  withdrawals = [
    { id: 'w-1042', user_hk: USER_A, currency_hk: 'h-usdt', currency: 'USDT', network: 'tron', destination_id: 'd1', destination: 'TQn9…x7Zp', amount: '25000', fee: '1', total: '25001', status: 'review', review_reason: 'amount', created_at: ago(35), updated_at: ago(35) },
    { id: 'w-1041', user_hk: USER_B, currency_hk: 'h-btc', currency: 'BTC', network: 'bitcoin', destination_id: 'd2', destination: 'bc1q…f2k9', amount: '1.25', fee: '0.0002', total: '1.2502', status: 'review', review_reason: 'amount', created_at: ago(90), updated_at: ago(90) },
    { id: 'w-1039', user_hk: USER_A, currency_hk: 'h-eth', currency: 'ETH', network: 'ethereum', destination_id: 'd3', destination: '0x9aE…03b1', amount: '18.4', fee: '0.002', total: '18.402', status: 'review', review_reason: 'no_threshold', created_at: ago(240), updated_at: ago(240) },
    { id: 'w-1036', user_hk: USER_B, currency_hk: 'h-usdt', currency: 'USDT', network: 'tron', destination_id: 'd4', destination: 'TLp2…a9Qd', amount: '4200', fee: '1', total: '4201', status: 'processing', created_at: ago(500), updated_at: ago(300) },
    { id: 'w-1030', user_hk: USER_A, currency_hk: 'h-irt', currency: 'IRT', network: 'internal', destination_id: 'd5', destination: 'IR06…4521', amount: '150000000', fee: '0', total: '150000000', status: 'completed', created_at: ago(2000), updated_at: ago(1500) },
  ]
  const p = (id: string, w: string, user: string, rail: Payout['rail'], cur: string, amt: string, kind: Payout['destination_kind'], masked: string, value: string, status: Payout['status'], extra: Partial<PayoutDetail> = {}): PayoutDetail => ({
    id, withdrawal_id: w, user_hk: user, seq: 1, rail, currency: cur, amount: amt, fee: '0', status, destination: masked, destination_kind: kind, destination_value: value, attempts: 1, submitted_at: ago(120), ...extra,
  })
  payouts = [
    p('po-9001', 'w-1036', USER_B, 'chain', 'USDT', '4200', 'crypto', 'TLp2…a9Qd', 'TLp2gW4kQdYqLq7hE9hZq3mXr1cV8Na9Qd', 'submitted', { network: 'tron', fee: '1' }),
    p('po-9002', 'w-1030', USER_A, 'paya', 'IRT', '100000000', 'iban', 'IR06…4521', 'IR060170000000100324521001', 'submitted', { scheduled_for: ago(-60) }),
    p('po-9003', 'w-1030', USER_A, 'paya', 'IRT', '50000000', 'iban', 'IR06…4521', 'IR060170000000100324521001', 'planned', { scheduled_for: iso(Date.now() + 86_400_000), seq: 2 }),
    p('po-8990', 'w-1029', USER_B, 'chain', 'BTC', '0.2', 'crypto', 'bc1q…x0aa', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0aa', 'completed', { tracking_id: '0f3a…9c1d', completed_at: ago(900), network: 'bitcoin' }),
  ]
  restrictions = [{
    id: uuid(), user_hk: USER_A, scope: 'asset', currency_hk: 'h-usdt', operations: ['withdraw', 'convert'], reason: 'aml_review', case_ref: 'AML-2026-0042',
    note: 'Large inflow from a flagged address', active: true, version: 1, created_by: 'nima@exchange.example', created_at: ago(3000),
  }]
  const actions = ['admin.sign_in', 'currency.update', 'market.set', 'withdrawal.approve', 'price.override_set', 'platform.control_create', 'admin.step_up', 'user.restriction_add', 'integrity.reseal_request']
  const actors = ['ali@exchange.example', 'sara@exchange.example', 'nima@exchange.example', 'reza@exchange.example']
  audit = Array.from({ length: 120 }, (_, i): AuditEntry => {
    const action = actions[i % actions.length]
    const outcome = i % 17 === 0 ? 'denied' : i % 11 === 0 ? 'failure' : 'success'
    return {
      hk: uuid(), occurred_at: ago(i * 7 + 1), actor_type: 'admin', actor_id: actors[i % actors.length], action,
      target_type: action.split('.')[0], target_id: `t-${1000 - i}`, outcome, reason: outcome === 'denied' ? 'permission_denied' : undefined, request_id: uuid(),
      ip: '203.0.113.' + (10 + (i % 5)), user_agent: 'Chrome · Linux',
      changes: action === 'currency.update' ? { before: { en_name: 'Terra', version: 2 }, after: { en_name: 'Terra Classic', version: 3 } } : action === 'market.set' ? { before: { taker_fee_bps: 20 }, after: { taker_fee_bps: 25 } } : undefined,
      integrity: i % 40 === 0 ? 'mismatch' : 'verified',
    }
  })
  findings = [
    { id: 41, table: 'withdrawals', row_key: 'w-1033', check: 'mismatch', detected_by: 'verifier', detected_at: ago(600), last_seen_at: ago(10), seen_count: 12, reseal_values: undefined },
    { id: 40, table: 'restrictions', row_key: 'r-771', check: 'missing', detected_by: 'read', detected_at: ago(4000), last_seen_at: ago(3000), seen_count: 3 },
    { id: 33, table: 'platform_controls', row_key: 'c-12', check: 'mismatch', detected_by: 'read', detected_at: ago(9000), last_seen_at: ago(8000), seen_count: 1, resolution: 'resealed', resolved_at: ago(7000), resolved_by: 'nima@exchange.example', reason: 'Row edited during a reviewed migration' },
  ]
  const snap = { kind: 'balances', taken_at: ago(1), fresh: true }
  venues = [
    {
      venue: 'binance', snapshots: [snap, { kind: 'markets', taken_at: ago(3), fresh: true }], instruments: 412, trading: 398, holds: [],
      balances: [
        { asset: 'BTC', currency: 'BTC', free: 12.4, locked: 0.6, reserved: 1, available: 11.4, booked: 13, difference: 0, mismatch_runs: 0, taken_at: ago(1), routability: 'routable' },
        { asset: 'USDT', currency: 'USDT', free: 1_250_000, locked: 0, reserved: 0, available: 1_250_000, booked: 1_250_000, difference: 0, mismatch_runs: 0, taken_at: ago(1), routability: 'routable' },
      ],
    },
    {
      venue: 'nobitex', snapshots: [{ kind: 'balances', taken_at: ago(25), fresh: false, failed_at: ago(2), failure: 'timeout' }], instruments: 88, trading: 80,
      holds: [{ id: 'hold-7', venue: 'nobitex', asset: 'USDT', currency_hk: 'h-usdt', booked: 100_000, reported: 99_400, difference: -600, detected_at: ago(200) }],
      balances: [{ asset: 'USDT', currency: 'USDT', free: 99_400, locked: 0, reserved: 0, available: 0, booked: 100_000, difference: -600, mismatch_runs: 4, taken_at: ago(25), routability: 'held', reasons: ['reconciliation_hold', 'stale_snapshot'] }],
    },
  ]
  rules = {
    enabled: true, cache_seconds: 10,
    version: {
      version: 3, reason: 'Prefer inventory for small trades', created_by: 'nima@exchange.example', created_at: ago(5000),
      rules: [
        { name: 'small-inventory', priority: 10, markets: ['BTC/USDT', 'ETH/USDT'], max_notional: '10000', use_inventory: true },
        { name: 'large-binance', priority: 20, markets: ['BTC/USDT'], min_notional: '10000', strategy: 'best', max_cost_bps: 40, venues: [{ venue: 'binance', max_balance_share_bps: 2000, reserve: '1' }] },
      ],
    },
  }
  sms = {
    mode: 'auto', effective_order: ['kavenegar', 'smsir'], delivery_reports: true, window_minutes: 15,
    providers: [
      { name: 'kavenegar', templates: ['sign_in', 'withdrawal', 'anti_phishing_reminder', 'delisting_notice'], healthy: true, accepted: 412, provider_errors: 3, delivered: 398, failed: 4 },
      { name: 'smsir', templates: ['sign_in', 'withdrawal'], healthy: false, breaker_open_until: iso(Date.now() + 5 * 60_000), accepted: 80, provider_errors: 31, delivered: 40, failed: 22 },
    ],
  }
}
resetMoney()

export function handleMoney(req: TransportRequest, ctx: DomainCtx): TransportResponse | null {
  const url = new URL(req.path, 'http://x')
  const path = url.pathname
  const q = url.searchParams
  if (!/^\/admin\/(withdrawals|payouts|users|audit|integrity|venues|otc|notifications)/.test(path)) return null
  const denied = guard(req, path, ctx, NEEDS, SENSITIVE)
  if (denied) return denied
  const body = (req.body ?? {}) as Record<string, any>
  let m: RegExpExecArray | null

  /* withdrawals */
  if (path === '/admin/withdrawals' && req.method === 'GET') {
    const st = q.get('status')
    const list = st ? withdrawals.filter((w) => w.status === st).reverse() : withdrawals.filter((w) => w.status === 'review')
    return ok(list.slice(0, Number(q.get('limit') ?? 100)))
  }
  if ((m = /^\/admin\/withdrawals\/([\w-]+)\/(approve|reject)$/.exec(path)) && req.method === 'POST') {
    const w = withdrawals.find((x) => x.id === m![1])
    if (!w) return fail(404, 'withdrawal_not_found')
    if (w.status !== 'review') return fail(409, 'withdrawal_not_in_review')
    if (m[2] === 'reject') {
      const r = String(body.reason ?? '').trim()
      if (!r || r.length > 500) return validation({ reason: 'from 1 to 500 characters' })
      w.status = 'rejected'; w.reason = r
    } else w.status = 'queued'
    w.reviewed_at = iso(); w.updated_at = iso()
    return ok(w)
  }

  /* payouts */
  if (path === '/admin/payouts' && req.method === 'GET') {
    const st = q.get('status') ?? 'submitted'
    return ok(payouts.filter((x) => x.status === st).map(({ destination_value: _v, destination_memo: _m, ...rest }) => rest))
  }
  if ((m = /^\/admin\/payouts\/([\w-]+)(?:\/(complete|fail))?$/.exec(path))) {
    const po = payouts.find((x) => x.id === m![1])
    if (!po) return fail(404, 'not_found')
    if (req.method === 'GET') {
      audit.unshift({ hk: uuid(), occurred_at: iso(), actor_type: 'admin', actor_id: ctx.email, action: 'withdrawal.payout_view', target_type: 'payout', target_id: po.id, outcome: 'success', integrity: 'verified' })
      return ok(po)
    }
    if (!['planned', 'submitted'].includes(po.status)) return fail(409, 'payout_not_open')
    if (m[2] === 'complete') {
      if (!String(body.tracking_id ?? '').trim()) return validation({ tracking_id: 'is required' })
      po.status = 'completed'; po.tracking_id = body.tracking_id; po.completed_at = iso()
    } else {
      if (!String(body.reason ?? '').trim()) return validation({ reason: 'is required' })
      po.status = 'failed'; po.last_error = body.reason; po.failed_at = iso()
    }
    const { destination_value: _v, destination_memo: _m, ...rest } = po
    return ok(rest)
  }

  /* restrictions of a user */
  if ((m = /^\/admin\/users\/([^/]+)\/restrictions(?:\/([\w-]+)\/lift)?$/.exec(path))) {
    const hk = m[1]
    if (hk.startsWith('404')) return fail(404, 'not_found')
    if (req.method === 'GET') {
      let list = restrictions.filter((r) => r.user_hk === hk).reverse()
      if (q.get('active') === 'true') list = list.filter((r) => r.active)
      return ok({ items: list })
    }
    if (m[2]) {
      const r = restrictions.find((x) => x.id === m![2] && x.user_hk === hk)
      if (!r) return fail(404, 'not_found')
      if (conflict(r.version, q.get('version'))) return vconflict(r.version)
      if (!r.active) return fail(409, 'already_lifted')
      if (!String(body.note ?? '').trim()) return validation({ note: 'is required' })
      r.active = false; r.lifted_at = iso(); r.lifted_by = ctx.email; r.lift_note = body.note; r.version++
      return ok(r)
    }
    const errors: Record<string, string> = {}
    if (!['account', 'operation', 'asset'].includes(body.scope)) errors.scope = 'is not a scope'
    if (body.scope !== 'account' && !(body.operations?.length)) errors.operations = 'at least one operation is required'
    if (body.scope === 'account' && body.operations?.length) errors.operations = 'a freeze takes no operations'
    if (body.scope === 'asset' && !body.currency_hk) errors.currency_hk = 'is required'
    if (!body.reason) errors.reason = 'is required'
    if (body.ends_at && Date.parse(body.ends_at) <= Date.now()) errors.ends_at = 'must be in the future'
    if (Object.keys(errors).length) return validation(errors)
    const r = { ...body, id: uuid(), user_hk: hk, active: true, version: 1, created_by: ctx.email, created_at: iso() } as Restriction
    restrictions.push(r)
    return ok({ restriction: r, ended_sessions: body.scope === 'account' ? 2 : 0 }, 201)
  }

  /* audit */
  if (path === '/admin/audit' && req.method === 'GET') {
    let list = audit
    const f = (k: keyof AuditEntry, v: string | null) => { if (v) list = list.filter((e) => String(e[k]) === v) }
    f('actor_id', q.get('actor_id')); f('action', q.get('action')); f('target_type', q.get('target_type')); f('target_id', q.get('target_id')); f('outcome', q.get('outcome'))
    if (q.get('since')) list = list.filter((e) => e.occurred_at >= q.get('since')!)
    if (q.get('until')) list = list.filter((e) => e.occurred_at < q.get('until')!)
    return ok(page(list, q))
  }

  /* integrity */
  if (path === '/admin/integrity/findings' && req.method === 'GET') {
    const list = q.get('all') === 'true' ? findings : findings.filter((f) => !f.resolution)
    return ok(page(list, q))
  }
  if ((m = /^\/admin\/integrity\/findings\/(\d+)\/reseal$/.exec(path)) && req.method === 'POST') {
    const f = findings.find((x) => x.id === Number(m![1]))
    if (!f) return fail(404, 'not_found')
    if (f.resolution) return fail(409, 'already_resolved')
    const reason = String(body.reason ?? '').trim()
    if (!reason || reason.length > 1000) return validation({ reason: 'from 1 to 1000 characters' })
    const fresh = f.reseal_requested_at && Date.now() - Date.parse(f.reseal_requested_at) < 24 * 3_600_000
    if (!f.reseal_requested_by || !fresh) {
      Object.assign(f, { reseal_requested_by: ctx.email, reseal_requested_at: iso(), reseal_request_reason: reason, reseal_row_version: 7, reseal_values: { status: 'queued', amount: '4200', destination: '[secret]' } })
      return ok(f, 202)
    }
    if (f.reseal_requested_by === ctx.email) return fail(403, 'second_approval_required')
    Object.assign(f, { resolution: 'resealed', resolved_at: iso(), resolved_by: ctx.email, reason })
    return ok(f)
  }

  /* venues */
  if (path === '/admin/venues' && req.method === 'GET') return ok(venues)
  if ((m = /^\/admin\/venues\/holds\/([\w-]+)\/clear$/.exec(path)) && req.method === 'POST') {
    const h = venues.flatMap((v) => v.holds).find((x) => x.id === m![1])
    if (!h) return fail(404, 'not_found')
    if (h.cleared_at) return fail(409, 'already_cleared')
    const reason = String(body.reason ?? '').trim()
    if (!reason || reason.length > 1000) return validation({ reason: 'from 1 to 1000 characters' })
    h.cleared_at = iso(); h.cleared_by = ctx.email; h.clear_reason = reason
    return ok(h)
  }

  /* OTC routing */
  if (path === '/admin/otc/routing/rules' && req.method === 'GET') return ok(rules)
  if (path === '/admin/otc/routing/rules' && req.method === 'PUT') {
    const reason = String(body.reason ?? '').trim()
    const errors: Record<string, string> = {}
    if (!reason || reason.length > 1000) errors.reason = 'from 1 to 1000 characters'
    if (!Array.isArray(body.rules)) errors.rules = 'must be a list'
    else body.rules.forEach((r: any, i: number) => {
      if (!r.name) errors[`rules[${i}].name`] = 'is required'
      r.venues?.forEach((v: any, j: number) => { if (!['binance', 'nobitex', 'kraken'].includes(v.venue)) errors[`rules[${i}].venues[${j}].venue`] = 'has no connector' })
    })
    if (Object.keys(errors).length) return validation(errors)
    const version = { version: (rules.version?.version ?? 0) + 1, rules: body.rules, reason, created_by: ctx.email, created_at: iso() }
    rules = { ...rules, version }
    return ok(version)
  }
  if (path === '/admin/otc/routing/explain' && req.method === 'POST') {
    if (!/^[A-Z0-9]+\/[A-Z0-9]+$/.test(String(body.market ?? ''))) return fail(404, 'market_not_found')
    const notional = Number(body.quantity) * Number(body.price)
    const list = rules.version?.rules ?? []
    const results = list.map((r) => {
      const marketOk = !r.markets || r.markets.includes(body.market)
      const minOk = !r.min_notional || notional >= Number(r.min_notional)
      const maxOk = !r.max_notional || notional <= Number(r.max_notional)
      const matched = marketOk && minOk && maxOk
      return { rule: r.name, matched, skipped: matched ? undefined : [!marketOk ? 'market' : !minOk ? 'below_min_notional' : 'above_max_notional'], sources: matched ? [{ source: r.use_inventory ? 'inventory' : 'venue', venue: r.venues?.[0]?.venue, capacity: Number(body.quantity) * 2, cost_bps: r.use_inventory ? 8 : 22 }] : undefined }
    })
    const hit = results.find((r) => r.matched)
    const exp: RouteExplanation = {
      rule_version: rules.version?.version ?? 0, rules: results,
      ...(hit ? { route: { rule: hit.rule, cost_bps: hit.sources![0].cost_bps, legs: [{ source: hit.sources![0].source, venue: hit.sources![0].venue, symbol: body.market, quantity: Number(body.quantity), notional, cost_bps: hit.sources![0].cost_bps }] } } : { reason: 'no_rule_matched' }),
    }
    return ok(exp)
  }

  /* SMS routing */
  if (path === '/admin/notifications/sms' && req.method === 'GET') return ok(sms)
  if (path === '/admin/notifications/sms' && req.method === 'PUT') {
    const errors: Record<string, string> = {}
    if (!['auto', 'manual'].includes(body.mode)) errors.mode = 'is not a mode'
    if (body.mode === 'manual') {
      const names = sms.providers.map((p) => p.name)
      const order: string[] = body.order ?? []
      if (!order.length) errors.order = 'is required in manual mode'
      else if (order.some((n) => !names.includes(n)) || new Set(order).size !== order.length) errors.order = 'names configured providers, each once'
      else if (!order.some((n) => sms.providers.find((p) => p.name === n)?.templates.includes('anti_phishing_reminder'))) errors.order = 'must keep a provider with the anti_phishing_reminder template'
    }
    if (Object.keys(errors).length) return validation(errors)
    sms = { ...sms, mode: body.mode, order: body.mode === 'manual' ? body.order : undefined, effective_order: body.mode === 'manual' ? body.order : ['kavenegar', 'smsir'] }
    return ok(sms)
  }
  return fail(404, 'not_found')
}
