/* eslint-disable @typescript-eslint/no-explicit-any -- the mock reads loosely typed request bodies on purpose */
import type { DailyRow, HouseAccount, LedgerBalance, LedgerEntry, ReconRun } from '../models'
import type { TransportRequest, TransportResponse } from '../types'
import { USER_IDS } from './people'
import { fail, guard, iso, ok, page, uuid, validation, type DomainCtx, type NeedRule, type SensitiveRule } from './util'

/** Mock of requirement 03: read-only ledger and reconciliation, plus a manual run. */

const NEEDS: NeedRule[] = [
  [/^POST$/, /^\/admin\/ledger\/reconciliation\/run$/, ['ledger', 'edit']],
  [/./, /^\/admin\/(ledger|reports)/, ['ledger', 'view']],
]
const SENSITIVE: SensitiveRule[] = [[/^POST$/, /^\/admin\/ledger\/reconciliation\/run$/]]

let balances: LedgerBalance[] = []
let entries: LedgerEntry[] = []
let house: HouseAccount[] = []
let runs: ReconRun[] = []
let daily: DailyRow[] = []

const ago = (min: number) => iso(Date.now() - min * 60_000)
const KINDS = ['deposit', 'transfer', 'otc_trade', 'withdrawal', 'conversion', 'lock', 'release']
const CURS = ['USDT', 'BTC', 'ETH', 'IRT']

export function resetFinance() {
  balances = USER_IDS.slice(0, 8).flatMap((u, i) => CURS.slice(0, 2 + (i % 3)).map((c, j): LedgerBalance => ({
    user_hk: u, currency: c, available: c === 'BTC' ? (0.1 + i * 0.07).toFixed(6) : c === 'IRT' ? String(1_000_000 * (i + 1)) : String(1200 * (i + 1) + j * 33),
    locked: c === 'USDT' && i === 0 ? '25001' : '0', pending: '0', verified: !(i === 5 && c === 'USDT'),
  })))
  entries = Array.from({ length: 90 }, (_, i): LedgerEntry => {
    const kind = KINDS[i % KINDS.length], cur = CURS[i % 3], amt = String(100 + (i % 17) * 37)
    return {
      id: `le-${5000 - i}`, kind, reference: `${kind}:${7000 - i}`, idempotency_key: `${kind}:${uuid().slice(0, 8)}`, currency: cur, created_at: ago(i * 41 + 3),
      postings: kind === 'otc_trade'
        ? [{ account: 'user:available', amount: `-${amt}` }, { account: 'exchange:inventory', amount: amt }]
        : kind === 'withdrawal' ? [{ account: 'user:locked', amount: `-${amt}` }, { account: 'custody', amount: `-${amt}` }, { account: 'user:withdrawn', amount: `${2 * Number(amt)}` }]
        : [{ account: 'custody', amount: amt }, { account: 'user:available', amount: `-${amt}` }],
      balanced: true,
    }
  })
  entries[7].postings[1].amount = '9'; entries[7].balanced = false // an entry that does not sum to zero, to show it is surfaced
  house = CURS.flatMap((c) => [
    { account: 'custody', currency: c, balance: c === 'BTC' ? '41.2' : '2400000' }, { account: 'fees', currency: c, balance: c === 'BTC' ? '0.18' : '9150' },
    { account: 'inventory', currency: c, balance: c === 'BTC' ? '6.4' : '310000' }, { account: 'pending_deposit', currency: c, balance: '0' },
  ])
  runs = Array.from({ length: 12 }, (_, i): ReconRun => ({
    id: `rc-${200 - i}`, started_at: ago(i * 60 + 5), duration_ms: 3400 + i * 120, result: i === 3 ? 'differences' : 'ok',
    differences: i === 3 ? [{ currency: 'USDT', amount: '-600' }] : [],
  }))
  daily = Array.from({ length: 7 }, (_, d) => CURS.slice(0, 3).map((c, k): DailyRow => ({
    day: new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10), currency: c,
    deposits: String(50000 + d * 1300 + k * 900), withdrawals: String(41000 + d * 700 + k * 450), fees: String(320 + d * 14 + k * 9), otc_volume: String(1_200_000 + d * 31_000 + k * 80_000),
  }))).flat()
}
resetFinance()

export function handleFinance(req: TransportRequest, ctx: DomainCtx): TransportResponse | null {
  const url = new URL(req.path, 'http://x')
  const path = url.pathname
  const q = url.searchParams
  if (!/^\/admin\/(ledger|reports)/.test(path)) return null
  const denied = guard(req, path, ctx, NEEDS, SENSITIVE)
  if (denied) return denied
  const body = (req.body ?? {}) as Record<string, any>
  let m: RegExpExecArray | null
  const qs = () => new URLSearchParams({ limit: String(Math.min(200, Number(body.limit ?? 50))), ...(body.cursor ? { cursor: String(body.cursor) } : {}) })

  if (path === '/admin/ledger/balances/query' && req.method === 'POST') {
    // A query needs a bound: a user or a currency (the backend rejects an unbounded scan).
    if (!body.user_hk && !body.currency) return validation({ user_hk: 'a user or a currency is required' })
    let list = balances
    if (body.user_hk) list = list.filter((b) => b.user_hk === String(body.user_hk).toLowerCase())
    if (body.currency) list = list.filter((b) => b.currency === String(body.currency).toUpperCase())
    return ok(page(list, qs()))
  }
  if (path === '/admin/ledger/entries/query' && req.method === 'POST') {
    if (!body.user_hk && !body.since && !body.reference) return validation({ since: 'a time range, a user, or a reference is required' })
    let list = entries
    if (body.kind) list = list.filter((e) => e.kind === body.kind)
    if (body.currency) list = list.filter((e) => e.currency === String(body.currency).toUpperCase())
    if (body.reference) list = list.filter((e) => e.reference.includes(String(body.reference)))
    if (body.since) list = list.filter((e) => e.created_at >= body.since)
    if (body.until) list = list.filter((e) => e.created_at < body.until)
    return ok(page(list, qs()))
  }
  if ((m = /^\/admin\/ledger\/entries\/([\w-]+)$/.exec(path)) && req.method === 'GET') {
    const e = entries.find((x) => x.id === m![1])
    return e ? ok(e) : fail(404, 'not_found')
  }
  if (path === '/admin/ledger/house-accounts' && req.method === 'GET') return ok(house)
  if (path === '/admin/ledger/reconciliation/runs' && req.method === 'GET') return ok(page(runs, q))
  if (path === '/admin/ledger/reconciliation/run' && req.method === 'POST') {
    if (runs[0].result === 'running') return fail(409, 'conflict', { code: 'reconciliation_running' })
    const r: ReconRun = { id: `rc-${Number(runs[0].id.slice(3)) + 1}`, started_at: iso(), duration_ms: 0, result: 'running', differences: [] }
    runs.unshift(r)
    setTimeout(() => { r.result = 'ok'; r.duration_ms = 3120 }, 1500)
    return ok(r, 202)
  }
  if (path === '/admin/reports/daily' && req.method === 'GET') {
    const from = q.get('from'), to = q.get('to')
    return ok({ items: daily.filter((d) => (!from || d.day >= from) && (!to || d.day <= to)) })
  }
  return fail(404, 'not_found')
}
