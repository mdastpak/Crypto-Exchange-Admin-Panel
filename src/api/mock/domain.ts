/* eslint-disable @typescript-eslint/no-explicit-any -- the mock reads loosely typed request bodies on purpose */
import type { Grants } from '@/access/catalog'
import { hasLevel } from '@/access/dependencies'
import type {
  Capability, Currency, CurrencyNetwork, Delisting, Lifecycle, LifecycleState, Market,
  PlatformControl, PriceOverride,
} from '../models'
import type { Envelope, TransportRequest, TransportResponse } from '../types'

/**
 * Mock of the operations area (currencies, lifecycle, markets, prices,
 * platform controls). Shapes follow the backend's swagger.json; rules follow
 * docs/api.md, including optimistic versions, step-up routes, the price
 * override bound, and two-person lifts.
 */

const ok = (info: unknown, status = 200): TransportResponse => ({ status, body: { status, message: 'OK', info } })
const fail = (status: number, code: string, info?: unknown): TransportResponse => ({
  status, body: { status, message: code, code, info: { code, ...(info as object) }, request_id: crypto.randomUUID() } as Envelope,
})
const validation = (errors: Record<string, string>) => fail(400, 'validation_failed', { errors })
const iso = (ms = Date.now()) => new Date(ms).toISOString()
const uuid = () => crypto.randomUUID()

/* ---------- permission map (mirrors requirement 01) ---------- */
type Need = [resource: string, level: string]
const NEEDS: [RegExp, RegExp, Need][] = [
  [/^GET$/, /^\/admin\/currencies/, ['currencies', 'view']],
  [/^(POST|PUT|PATCH|DELETE)$/, /^\/admin\/currencies\/[\w-]+\/(networks|capabilities|delistings|migrations)/, ['currencies', 'manage']],
  [/^(POST|PUT|PATCH|DELETE)$/, /^\/admin\/currencies/, ['currencies', 'edit']],
  [/^GET$/, /^\/admin\/markets\/[^/]+\/[^/]+\/price/, ['prices', 'view']],
  [/^POST$/, /^\/admin\/markets\/[^/]+\/[^/]+\/price-override/, ['prices', 'edit']],
  [/^GET$/, /^\/admin\/markets/, ['markets', 'view']],
  [/^PUT$/, /^\/admin\/markets/, ['markets', 'edit']],
  [/^GET$/, /^\/admin\/price-overrides/, ['prices', 'view']],
  [/^POST$/, /^\/admin\/price-overrides\/[\w-]+\/approve/, ['prices', 'approve']],
  [/^POST$/, /^\/admin\/price-overrides/, ['prices', 'edit']],
  [/^GET$/, /^\/admin\/platform/, ['platform', 'view']],
  [/^(POST|PATCH)$/, /^\/admin\/platform/, ['platform', 'manage']],
]
/** Routes the backend classifies as sensitive (`adminRoutes`): they need a fresh step-up. */
const SENSITIVE: [RegExp, RegExp][] = [
  [/^(POST|PUT|DELETE)$/, /^\/admin\/currencies\/[\w-]+\/(migrations|delistings|capabilities|networks)/],
  [/^PUT$/, /^\/admin\/markets\//],
  [/^POST$/, /^\/admin\/markets\/[^/]+\/[^/]+\/price-override/],
  [/^POST$/, /^\/admin\/price-overrides\//],
  [/^POST$/, /^\/admin\/platform\/controls/],
  [/^PATCH$/, /^\/admin\/platform\/controls\//],
]

/* ---------- seed data ---------- */
const T0 = Date.parse('2026-06-01T09:00:00Z')
const H = {
  BTC: '5b3a0b1e-0001-4a00-8000-000000000001', ETH: '5b3a0b1e-0002-4a00-8000-000000000002',
  USDT: '5b3a0b1e-0003-4a00-8000-000000000003', USDC: '5b3a0b1e-0004-4a00-8000-000000000004',
  LUNA: '5b3a0b1e-0005-4a00-8000-000000000005', LUNC: '5b3a0b1e-0006-4a00-8000-000000000006',
  IRT: '5b3a0b1e-0007-4a00-8000-000000000007', XYZ: '5b3a0b1e-0008-4a00-8000-000000000008',
}
const cur = (n: number, hk: string, status: Currency['status'], sym: string, en: string, fa: string, o: Partial<Currency['info']> = {}): Currency => ({
  id: n, hk, status, version: 1 + (n % 3), created_at: iso(T0 + n * 86_400_000), updated_at: iso(T0 + n * 86_400_000 + 3_600_000),
  info: { en_name: en, fa_name: fa, symbol: sym, if_fiat: false, is_token: false, ...o },
})

let currencies: Currency[] = []
let networks: Record<string, CurrencyNetwork[]> = {}
let overrides: Record<string, Record<Capability, boolean>> = {}
let delistings: Delisting[] = []
let markets: Market[] = []
let priceOverrides: PriceOverride[] = []
let controls: PlatformControl[] = []
const mids: Record<string, number> = { 'BTC/USDT': 64_050, 'ETH/USDT': 3_120.5, 'USDT/IRT': 71_200 }

const net = (hk: string, network: string, over: Partial<CurrencyNetwork> = {}): CurrencyNetwork => ({
  network, currency_hk: hk, decimals: 6, custody_mode: 'ON_CHAIN', deposit_enabled: true, withdrawal_enabled: true,
  min_deposit: '1', min_withdrawal: '20', max_withdrawal: '0', withdrawal_fee: '1', requires_tag: false, ...over,
})
const mkt = (b: string, q: string, o: Partial<Market> = {}): Market => ({
  id: uuid(), base_symbol: b, quote_symbol: q, base_currency_hk: H[b as keyof typeof H], quote_currency_hk: H[q as keyof typeof H],
  status: 'ACTIVE', min_order_size: '0.0001', max_order_size: '10', min_notional: '10', tick_size: '0.01', lot_size: '0.0001',
  maker_fee_bps: 10, taker_fee_bps: 20, price_band_bps: 500, updated_at: iso(T0), ...o,
})

export function resetDomain() {
  currencies = [
    cur(1, H.BTC, 'approved', 'BTC', 'Bitcoin', 'بیت‌کوین'),
    cur(2, H.ETH, 'approved', 'ETH', 'Ethereum', 'اتریوم'),
    cur(3, H.USDT, 'approved', 'USDT', 'Tether', 'تتر', { is_token: true, contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' }),
    cur(4, H.USDC, 'pending', 'USDC', 'USD Coin', 'یو‌اس‌دی کوین', { is_token: true, contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }),
    cur(5, H.LUNA, 'pending', 'LUNA', 'Terra', 'ترا'),
    cur(6, H.LUNC, 'approved', 'LUNC', 'Terra Classic', 'ترا کلاسیک'),
    cur(7, H.IRT, 'approved', 'IRT', 'Toman', 'تومان', { if_fiat: true }),
    cur(8, H.XYZ, 'suspend', 'XYZ', 'XYZ Token', 'ایکس‌وای‌زد', { is_token: true, contract: '0x1111111111111111111111111111111111111111' }),
  ]
  networks = {
    [H.BTC]: [net(H.BTC, 'bitcoin', { decimals: 8, min_withdrawal: '0.001', withdrawal_fee: '0.0002', fee_currency: 'BTC' })],
    [H.ETH]: [net(H.ETH, 'ethereum', { decimals: 18, min_withdrawal: '0.01', withdrawal_fee: '0.002', fee_currency: 'ETH' })],
    [H.USDT]: [
      net(H.USDT, 'tron', { contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', fee_currency: 'TRX', explorer_url: 'https://tronscan.org' }),
      net(H.USDT, 'ethereum', { contract_address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', withdrawal_fee: '5', min_withdrawal: '50', fee_currency: 'ETH' }),
    ],
    [H.IRT]: [net(H.IRT, 'internal', { decimals: 0, custody_mode: 'OFF_CHAIN', min_withdrawal: '100000', withdrawal_fee: '0' })],
    [H.LUNC]: [net(H.LUNC, 'ethereum', { contract_address: '0xd2877702675e6cEb975b4A1dFf9fb7BAF4C91ea9', decimals: 18, fee_currency: 'ETH' })],
  }
  overrides = {}
  delistings = [{
    id: uuid(), currency_hk: H.LUNC, kind: 'standard', status: 'scheduled', settlement: 'convert', settlement_currency_hk: H.USDT,
    price_source: 'twap', version: 1, created_at: iso(T0 + 100 * 86_400_000),
    steps: [
      { state: 'delist_announced', at: iso(Date.now() - 86_400_000), applied_at: iso(Date.now() - 86_400_000) },
      { state: 'deposits_disabled', at: iso(Date.now() + 7 * 86_400_000) },
      { state: 'sell_only', at: iso(Date.now() + 14 * 86_400_000) },
      { state: 'frozen', at: iso(Date.now() + 45 * 86_400_000) },
      { state: 'delisted', at: iso(Date.now() + 48 * 86_400_000) },
    ],
  }]
  markets = [mkt('BTC', 'USDT'), mkt('ETH', 'USDT', { maker_fee_bps: 12, taker_fee_bps: 25 }), mkt('USDT', 'IRT', { status: 'MAINTENANCE', tick_size: '1' })]
  priceOverrides = []
  controls = [{
    id: uuid(), kind: 'lockdown', feature: 'withdrawals', starts_at: iso(Date.now() - 3_600_000), active: true, version: 1,
    reason: 'Wallet signature rotation', message: { fa: 'برداشت موقتاً متوقف است', en: 'Withdrawals are paused' },
    created_by: 'sara@exchange.example', created_at: iso(Date.now() - 3_700_000),
  }]
}
resetDomain()

/* ---------- helpers ---------- */
const lifecycleOf = (c: Currency): Lifecycle => {
  const d = delistings.find((x) => x.currency_hk === c.hk && x.status === 'scheduled')
  const applied = d?.steps.filter((s) => s.applied_at).at(-1)
  const next = d?.steps.find((s) => !s.applied_at)
  const state = (applied?.state ?? 'active') as LifecycleState
  const base: Record<Capability, boolean> = {
    deposit: !['deposits_disabled', 'sell_only', 'trading_halted', 'withdrawal_only', 'frozen', 'delisted'].includes(state),
    withdraw: !['frozen', 'delisted'].includes(state),
    buy: !['sell_only', 'trading_halted', 'withdrawal_only', 'frozen', 'delisted'].includes(state),
    sell: !['trading_halted', 'withdrawal_only', 'frozen', 'delisted'].includes(state),
    convert_into: state === 'active' || state === 'delist_announced', convert_from: !['frozen', 'delisted'].includes(state), listed: state !== 'delisted',
  }
  return { state, capabilities: { ...base, ...(overrides[c.hk] ?? {}) }, next: next && { state: next.state, at: next.at } }
}
const withLifecycle = (c: Currency): Currency => ({ ...c, lifecycle: lifecycleOf(c) })
const findCur = (hk: string) => currencies.find((c) => c.hk === hk.toLowerCase())
const conflict = (have: number, sent: unknown) => sent !== undefined && sent !== null && Number(sent) !== have
const vconflict = (v: number) => fail(409, 'version_conflict', { version: v })
const hasDigitsOnly = (s: string) => /^\d+(\.\d+)?$/.test(s)

function page<T>(items: T[], q: URLSearchParams): { items: T[]; next_cursor?: string } {
  const limit = Math.min(200, Math.max(1, Number(q.get('limit') ?? 50)))
  const start = q.get('cursor') ? Number(atob(q.get('cursor')!)) : 0
  const slice = items.slice(start, start + limit)
  return { items: slice, next_cursor: start + limit < items.length ? btoa(String(start + limit)) : undefined }
}

/* ---------- entry ---------- */
export interface DomainCtx { email: string; grants: Grants; elevated: boolean }

export function handleDomain(req: TransportRequest, ctx: DomainCtx): TransportResponse | null {
  const url = new URL(req.path, 'http://x')
  const path = url.pathname
  const q = url.searchParams
  if (!/^\/admin\/(currencies|markets|price-overrides|platform)/.test(path)) return null

  const need = NEEDS.find(([m, p]) => m.test(req.method) && p.test(path))?.[2]
  if (need && !hasLevel(ctx.grants, need[0], need[1])) return fail(403, 'permission_denied', { required: `${need[0]}:${need[1]}` })
  if (SENSITIVE.some(([m, p]) => m.test(req.method) && p.test(path)) && !ctx.elevated) {
    return fail(403, 'step_up_required', { step_up: '/admin/step-up' })
  }
  const body = (req.body ?? {}) as Record<string, any>
  let m: RegExpExecArray | null

  /* currencies */
  if (path === '/admin/currencies' && req.method === 'GET') {
    let list = [...currencies]
    const text = (q.get('q') ?? '').trim().toLowerCase()
    if (text) list = list.filter((c) => [c.info.symbol, c.info.en_name, c.info.fa_name].some((v) => v.toLowerCase().includes(text)))
    const st = q.get('status')?.split(',').filter(Boolean)
    if (st?.length) list = list.filter((c) => st.includes(c.status))
    const sort = q.get('sort')
    if (sort) {
      const key = sort.replace('-', '') as 'symbol' | 'en_name' | 'created_at' | 'updated_at'
      list.sort((a, b) => String((key === 'symbol' || key === 'en_name' ? a.info[key] : a[key])).localeCompare(String(key === 'symbol' || key === 'en_name' ? b.info[key] : b[key])))
      if (sort.startsWith('-')) list.reverse()
    } else list.sort((a, b) => b.id - a.id)
    const p = page(list, q)
    return ok({ ...p, items: p.items.map(withLifecycle) })
  }
  if (path === '/admin/currencies' && req.method === 'POST') {
    const info = (body.info ?? {}) as Partial<Currency['info']>
    const errors: Record<string, string> = {}
    if (!info.en_name?.trim()) errors['info.en_name'] = 'is required'
    if (!info.fa_name?.trim()) errors['info.fa_name'] = 'is required'
    if (!/^[A-Za-z0-9]{2,15}$/.test(info.symbol ?? '')) errors['info.symbol'] = 'must be 2 to 15 letters or digits'
    if (info.is_token && !info.contract) errors['info.contract'] = 'is required for a token'
    if (info.if_fiat && info.is_token) errors['info.is_token'] = 'a fiat currency cannot be a token'
    if (Object.keys(errors).length) return validation(errors)
    const symbol = info.symbol!.toUpperCase()
    if (currencies.some((c) => c.info.symbol === symbol)) return fail(409, 'duplicate_symbol', { field: 'info.symbol' })
    if (info.contract && currencies.some((c) => c.info.contract?.toLowerCase() === info.contract!.toLowerCase())) {
      return fail(409, 'duplicate_contract', { field: 'info.contract' })
    }
    const c: Currency = {
      id: Math.max(0, ...currencies.map((x) => x.id)) + 1, hk: uuid(), status: body.status ?? 'pending', version: 1,
      info: { en_name: info.en_name!.trim(), fa_name: info.fa_name!.trim(), symbol, if_fiat: !!info.if_fiat, is_token: !!info.is_token, contract: info.contract },
      created_at: iso(), updated_at: iso(),
    }
    currencies.push(c)
    return ok({ hk: c.hk, status: c.status, version: c.version }, 201)
  }
  if ((m = /^\/admin\/currencies\/([\w-]+)$/.exec(path))) {
    const c = findCur(m[1])
    if (!c) return fail(404, 'not_found')
    if (req.method === 'GET') return ok(withLifecycle(c))
    if (req.method === 'PUT') {
      if (conflict(c.version, body.version ?? q.get('version'))) return vconflict(c.version)
      const info = (body.info ?? {}) as Partial<Currency['info']>
      if (info.symbol && currencies.some((x) => x.hk !== c.hk && x.info.symbol === info.symbol!.toUpperCase())) return fail(409, 'duplicate_symbol', { field: 'info.symbol' })
      if (info.en_name !== undefined && !info.en_name.trim()) return validation({ 'info.en_name': 'is required' })
      Object.assign(c.info, Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined)))
      if (info.symbol) c.info.symbol = info.symbol.toUpperCase()
      if (body.status) c.status = body.status
      c.version++; c.updated_at = iso()
      return ok({ version: c.version })
    }
    if (req.method === 'DELETE') {
      if (conflict(c.version, q.get('version'))) return vconflict(c.version)
      if (c.deleted_at) return fail(404, 'not_found')
      if (['BTC', 'ETH', 'USDT'].includes(c.info.symbol)) return fail(409, 'currency_has_holders')
      c.status = 'deleted'; c.deleted_at = iso(); c.version++
      return ok({ version: c.version })
    }
  }
  if ((m = /^\/admin\/currencies\/([\w-]+)\/restore$/.exec(path)) && req.method === 'POST') {
    const c = findCur(m[1])
    if (!c) return fail(404, 'not_found')
    if (!c.deleted_at) return fail(409, 'not_deleted')
    if (conflict(c.version, q.get('version'))) return vconflict(c.version)
    c.status = 'pending'; delete c.deleted_at; c.version++
    return ok({ version: c.version })
  }
  if ((m = /^\/admin\/currencies\/([\w-]+)\/networks(?:\/(\w+))?$/.exec(path))) {
    const c = findCur(m[1])
    if (!c || c.deleted_at) return fail(404, 'not_found')
    if (req.method === 'GET') return ok(networks[c.hk] ?? [])
    if (req.method === 'PUT' && m[2]) {
      const errors: Record<string, string> = {}
      if (c.info.if_fiat !== (m[2] === 'internal')) errors.network = 'internal is for fiat currencies only'
      if (!Number.isInteger(body.decimals) || body.decimals < 0 || body.decimals > 36) errors.decimals = 'must be from 0 to 36'
      for (const f of ['min_deposit', 'min_withdrawal', 'max_withdrawal', 'withdrawal_fee']) if (!hasDigitsOnly(String(body[f] ?? ''))) errors[f] = 'must be a decimal amount'
      if (!errors.min_withdrawal && Number(body.max_withdrawal) !== 0 && Number(body.min_withdrawal) > Number(body.max_withdrawal)) errors.min_withdrawal = 'must not exceed the maximum'
      if (c.info.is_token && !body.contract_address) errors.contract_address = 'is required for a token'
      if (body.explorer_url && !/^https:\/\//.test(body.explorer_url)) errors.explorer_url = 'must be an https URL'
      if (Object.keys(errors).length) return validation(errors)
      const list = (networks[c.hk] ??= [])
      const existing = list.find((n) => n.network === m![2])
      if (existing && (existing.contract_address !== (body.contract_address || undefined) || existing.decimals !== body.decimals)) return fail(409, 'network_contract_fixed')
      const next = net(c.hk, m[2], { ...body, contract_address: body.contract_address || undefined })
      if (existing) Object.assign(existing, next); else list.push(next)
      return ok(next, existing ? 200 : 201)
    }
  }
  if ((m = /^\/admin\/currencies\/([\w-]+)\/capabilities\/(\w+)$/.exec(path))) {
    const c = findCur(m[1])
    if (!c) return fail(404, 'not_found')
    const cap = m[2] as Capability
    if (req.method === 'PUT') { overrides[c.hk] = { ...(overrides[c.hk] ?? {}), [cap]: !!body.allowed } as Record<Capability, boolean> }
    if (req.method === 'DELETE' && overrides[c.hk]) delete overrides[c.hk][cap]
    return ok(lifecycleOf(c))
  }
  if ((m = /^\/admin\/currencies\/([\w-]+)\/delistings(?:\/([\w-]+)\/(cancel))?$/.exec(path))) {
    const c = findCur(m[1])
    if (!c) return fail(404, 'not_found')
    if (req.method === 'GET') return ok({ items: delistings.filter((d) => d.currency_hk === c.hk).reverse() })
    if (req.method === 'POST' && !m[2]) {
      const steps = (body.steps ?? []) as Delisting['steps']
      const errors: Record<string, string> = {}
      if (!steps.length) errors.steps = 'at least one step is required'
      steps.forEach((s, i) => { if (i && Date.parse(s.at) <= Date.parse(steps[i - 1].at)) errors[`steps[${i}].at`] = 'must be after the previous step' })
      if (body.settlement === 'convert' && !body.settlement_currency_hk) errors.settlement_currency_hk = 'is required'
      if (body.settlement === 'claim' && !(body.claim_days > 0)) errors.claim_days = 'must be positive'
      if (Object.keys(errors).length) return validation(errors)
      if (c.status !== 'approved') return fail(409, 'not_listed')
      if (delistings.some((d) => d.currency_hk === c.hk && d.status === 'scheduled')) return fail(409, 'delisting_in_progress')
      const d: Delisting = { ...(body as Delisting), id: uuid(), currency_hk: c.hk, status: 'scheduled', version: 1, created_at: iso(), steps: steps.map((s) => ({ ...s })) }
      delistings.push(d)
      return ok(d, 201)
    }
    if (req.method === 'POST' && m[3] === 'cancel') {
      const d = delistings.find((x) => x.id === m![2] && x.currency_hk === c.hk)
      if (!d) return fail(404, 'not_found')
      if (conflict(d.version, body.version)) return vconflict(d.version)
      if (d.status !== 'scheduled') return fail(409, 'delisting_not_scheduled')
      if (d.steps.some((s) => s.applied_at && ['frozen', 'delisted'].includes(s.state))) return fail(409, 'delisting_irreversible')
      d.status = 'cancelled'; d.version++
      return ok(d)
    }
  }
  if ((m = /^\/admin\/currencies\/([\w-]+)\/migrations/.exec(path)) && req.method === 'GET') {
    return findCur(m[1]) ? ok({ items: [] }) : fail(404, 'not_found')
  }

  /* markets and prices */
  if (path === '/admin/markets' && req.method === 'GET') return ok(markets)
  if ((m = /^\/admin\/markets\/(\w+)\/(\w+)$/.exec(path))) {
    const mk = markets.find((x) => x.base_symbol === m![1] && x.quote_symbol === m![2])
    if (req.method === 'GET') return mk ? ok(mk) : fail(404, 'market_not_found')
    if (req.method === 'PUT') {
      const base = currencies.find((c) => c.info.symbol === m![1] && !c.deleted_at)
      const quote = currencies.find((c) => c.info.symbol === m![2] && !c.deleted_at)
      const errors: Record<string, string> = {}
      if (!base) errors.base = 'currency does not exist'
      if (!quote) errors.quote = 'currency does not exist'
      if (m[1] === m[2]) errors.quote = 'must differ from the base'
      if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'SUSPENDED', 'DELISTED'].includes(body.status)) errors.status = 'is not a status'
      for (const f of ['min_order_size', 'min_notional', 'tick_size', 'lot_size']) if (!hasDigitsOnly(String(body[f] ?? ''))) errors[f] = 'must be a decimal amount'
      if (!errors.tick_size && !(Number(body.tick_size) > 0)) errors.tick_size = 'must be positive'
      if (!errors.lot_size && !(Number(body.lot_size) > 0)) errors.lot_size = 'must be positive'
      if (Number(body.max_order_size) !== 0 && Number(body.min_order_size) > Number(body.max_order_size)) errors.min_order_size = 'must not exceed the maximum'
      for (const f of ['maker_fee_bps', 'taker_fee_bps']) if (!Number.isInteger(body[f]) || body[f] < 0 || body[f] > 1000) errors[f] = 'must be from 0 to 1000'
      if (Object.keys(errors).length) return validation(errors)
      const next = mkt(m[1], m[2], { ...body, id: mk?.id ?? uuid(), base_currency_hk: base!.hk, quote_currency_hk: quote!.hk, updated_at: iso() })
      if (mk) Object.assign(mk, next); else markets.push(next)
      return ok(next, mk ? 200 : 201)
    }
  }
  if ((m = /^\/admin\/markets\/(\w+)\/(\w+)\/price$/.exec(path)) && req.method === 'GET') {
    const sym = `${m[1]}/${m[2]}`
    const mid = mids[sym]
    if (!mid) return fail(404, 'price_unavailable')
    const o = priceOverrides.find((x) => x.market === sym && x.in_force)
    const at = iso()
    if (o) return ok({ market: sym, status: 'override', mid: Number(o.mid), bid: Number(o.bid), ask: Number(o.ask), at, updated: at })
    return ok({ market: sym, status: 'live', mid, bid: mid * 0.9998, ask: mid * 1.0002, sources: ['binance', 'coinbase', 'kraken'], vwap: { '1m': mid * 1.0001, '5m': mid * 0.9999 }, twap: { '1m': mid, '5m': mid }, at, updated: at })
  }
  if ((m = /^\/admin\/markets\/(\w+)\/(\w+)\/price-override$/.exec(path)) && req.method === 'POST') {
    const sym = `${m[1]}/${m[2]}`
    if (!markets.some((x) => x.base_symbol === m![1] && x.quote_symbol === m![2])) return fail(404, 'market_not_found')
    const errors: Record<string, string> = {}
    const mid = Number(body.mid), bid = Number(body.bid ?? body.mid), ask = Number(body.ask ?? body.mid)
    if (!(mid > 0)) errors.mid = 'must be positive'
    if (!(bid <= mid && mid <= ask)) errors.bid = 'bid <= mid <= ask'
    if (!(body.expires_in_seconds >= 1 && body.expires_in_seconds <= 86_400)) errors.expires_in_seconds = 'from 1 to 86400'
    if (!body.reason || String(body.reason).length > 500) errors.reason = 'from 1 to 500 characters'
    if (Object.keys(errors).length) return validation(errors)
    expire()
    if (priceOverrides.some((x) => x.market === sym && (x.in_force || x.pending))) return fail(409, 'price_override_exists')
    const ref = mids[sym]
    const dev = ref ? Math.ceil((Math.abs(mid - ref) / ref) * 10_000) : undefined
    const pending = dev === undefined || dev > 300
    const o: PriceOverride = {
      id: uuid(), market: sym, mid: String(body.mid), bid: String(body.bid ?? body.mid), ask: String(body.ask ?? body.mid), reason: body.reason,
      reference_mid: ref ? String(ref) : undefined, deviation_bps: dev, in_force: !pending, pending, lapsed: false,
      approve_by: pending ? iso(Date.now() + 30 * 60_000) : undefined, created_by: ctx.email, created_at: iso(), expires_at: iso(Date.now() + body.expires_in_seconds * 1000),
    }
    priceOverrides.unshift(o)
    return ok(o, 201)
  }
  if (path === '/admin/price-overrides' && req.method === 'GET') {
    expire()
    const list = q.get('in_force') === 'true' ? priceOverrides.filter((o) => o.in_force) : priceOverrides
    return ok(list.slice(0, Number(q.get('limit') ?? 100)))
  }
  if ((m = /^\/admin\/price-overrides\/([\w-]+)\/(end|approve)$/.exec(path)) && req.method === 'POST') {
    expire()
    const o = priceOverrides.find((x) => x.id === m![1])
    if (!o) return fail(404, 'price_override_not_found')
    if (m[2] === 'end') {
      if (o.ended_at || (!o.in_force && !o.pending)) return fail(409, 'price_override_ended')
      o.in_force = false; o.pending = false; o.ended_at = iso(); o.ended_by = ctx.email
      return ok(o)
    }
    if (o.created_by === ctx.email) return fail(403, 'second_approval_required')
    if (o.lapsed) return fail(409, 'price_override_lapsed')
    if (!o.pending) return fail(409, 'price_override_not_pending')
    o.pending = false; o.in_force = true; o.approved_by = ctx.email; o.approved_at = iso()
    return ok(o)
  }

  /* platform */
  if (path === '/admin/platform' && req.method === 'GET') {
    const active = controls.filter((c) => c.active)
    return ok({
      status: { mode: active.some((c) => c.kind === 'maintenance') ? 'maintenance' : 'open', lockdowns: active.filter((c) => c.kind === 'lockdown').map((c) => c.feature), active: [], scheduled: [] },
      controls: controls.filter((c) => !c.lifted_at),
    })
  }
  if (path === '/admin/platform/controls' && req.method === 'GET') return ok({ items: [...controls].reverse() })
  if (path === '/admin/platform/controls' && req.method === 'POST') {
    const errors: Record<string, string> = {}
    if (!['maintenance', 'lockdown'].includes(body.kind)) errors.kind = 'is not a kind'
    if (body.kind === 'lockdown' && !body.feature) errors.feature = 'is required'
    if (!body.reason?.trim()) errors.reason = 'is required'
    if (body.ends_at && Date.parse(body.ends_at) <= Date.parse(body.starts_at)) errors.ends_at = 'must be after the start'
    if (Object.keys(errors).length) return validation(errors)
    const start = Date.parse(body.starts_at)
    const c = { ...body, id: uuid(), active: start <= Date.now() + 60_000, version: 1, created_by: ctx.email, created_at: iso() } as PlatformControl
    controls.push(c)
    return ok(c, 201)
  }
  if ((m = /^\/admin\/platform\/controls\/([\w-]+)(?:\/(lift))?$/.exec(path))) {
    const c = controls.find((x) => x.id === m![1])
    if (!c) return fail(404, 'not_found')
    if (c.lifted_at) return fail(409, 'control_ended')
    if (conflict(c.version, q.get('version'))) return vconflict(c.version)
    if (req.method === 'PATCH') {
      if (!body.ends_at && !body.message) return validation({ body: 'at least one field is required' })
      if (body.ends_at) c.ends_at = body.ends_at
      if (body.message) c.message = body.message
      c.version++
      return ok(c)
    }
    if (req.method === 'POST' && m[2] === 'lift') {
      if (!body.note?.trim()) return validation({ note: 'is required' })
      const twoPerson = c.active && c.kind === 'lockdown' && (c.feature === 'withdrawals' || c.feature === 'trading')
      if (twoPerson && !c.lift_requested_by) { c.lift_requested_by = ctx.email; c.lift_requested_at = iso(); c.version++; return ok(c, 202) }
      if (twoPerson && c.lift_requested_by === ctx.email) return fail(409, 'second_approval_required')
      c.lifted_at = iso(); c.lifted_by = ctx.email; c.lift_note = body.note; c.active = false; c.version++
      return ok(c)
    }
  }
  return fail(404, 'not_found')
}

function expire() {
  const now = Date.now()
  for (const o of priceOverrides) {
    if (o.in_force && Date.parse(o.expires_at) <= now) o.in_force = false
    if (o.pending && o.approve_by && Date.parse(o.approve_by) <= now) { o.pending = false; o.lapsed = true }
  }
}
