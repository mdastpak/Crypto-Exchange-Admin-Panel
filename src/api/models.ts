/**
 * Shapes of the admin API that Phase 2 screens use, written from the backend's
 * `docs/swagger.json`. Amounts are decimal strings; times are RFC 3339 UTC.
 * They will be replaced by generated types once the backend publishes OpenAPI 3.
 */

export type CurrencyStatus = 'approved' | 'pending' | 'suspend' | 'deleted'

export interface CurrencyInfo {
  en_name: string
  fa_name: string
  symbol: string
  if_fiat: boolean // sic: the backend keeps this name
  is_token: boolean
  contract?: string
  logo_url?: string
}

export type LifecycleState =
  | 'active' | 'delist_announced' | 'deposits_disabled' | 'sell_only'
  | 'trading_halted' | 'withdrawal_only' | 'frozen' | 'delisted'

export interface Lifecycle {
  state: LifecycleState
  capabilities?: Partial<Record<Capability, boolean>>
  next?: { state: string; at: string }
}

export type Capability = 'deposit' | 'withdraw' | 'buy' | 'sell' | 'convert_into' | 'convert_from' | 'listed'
export const CAPABILITIES: Capability[] = ['deposit', 'withdraw', 'buy', 'sell', 'convert_into', 'convert_from', 'listed']

export interface Currency {
  id: number
  hk: string
  status: CurrencyStatus
  version: number
  info: CurrencyInfo
  lifecycle?: Lifecycle
  previous_symbols?: string[]
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Page<T> {
  items: T[]
  next_cursor?: string
}

export interface CurrencyNetwork {
  network: string
  currency_hk: string
  contract_address?: string
  decimals: number
  custody_mode: 'ON_CHAIN' | 'OFF_CHAIN'
  deposit_enabled: boolean
  withdrawal_enabled: boolean
  min_deposit: string
  min_withdrawal: string
  max_withdrawal: string
  withdrawal_fee: string
  fee_currency_hk?: string
  fee_currency?: string
  requires_tag: boolean
  explorer_url?: string
}

export type MarketStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'SUSPENDED' | 'DELISTED'
export const MARKET_STATUSES: MarketStatus[] = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'SUSPENDED', 'DELISTED']

export interface Market {
  id: string
  base_symbol: string
  quote_symbol: string
  base_currency_hk: string
  quote_currency_hk: string
  status: MarketStatus
  min_order_size: string
  max_order_size: string
  min_notional: string
  tick_size: string
  lot_size: string
  maker_fee_bps: number
  taker_fee_bps: number
  market_maker_fee_bps?: number
  max_leverage?: number
  max_position_size?: string
  price_band_bps?: number
  updated_at: string
}

export interface ReferencePrice {
  market: string
  status: 'live' | 'override'
  bid: number
  ask: number
  mid: number
  vwap?: Record<string, number>
  twap?: Record<string, number>
  sources?: string[]
  at: string
  updated: string
}

export interface PriceOverride {
  id: string
  market: string
  mid: string
  bid: string
  ask: string
  reason: string
  reference_mid?: string
  deviation_bps?: number
  in_force: boolean
  pending: boolean
  lapsed: boolean
  approve_by?: string
  approved_by?: string
  approved_at?: string
  created_by: string
  created_at: string
  expires_at: string
  ended_at?: string
  ended_by?: string
}

export type PlatformFeature =
  | 'sign_up' | 'sign_in' | 'profile_changes' | 'deposits' | 'withdrawals' | 'trading'
  | 'api_keys' | 'websocket' | 'read_only' | 'scheduler' | 'outbox' | 'market_data' | 'otc_routing'
export const PLATFORM_FEATURES: PlatformFeature[] = [
  'sign_up', 'sign_in', 'profile_changes', 'deposits', 'withdrawals', 'trading',
  'api_keys', 'websocket', 'read_only', 'scheduler', 'outbox', 'market_data', 'otc_routing',
]

export interface PlatformControl {
  id: string
  kind: 'maintenance' | 'lockdown'
  feature?: PlatformFeature
  starts_at: string
  ends_at?: string
  announce_at?: string
  message?: { fa?: string; en?: string }
  reason: string
  allow_networks?: string[]
  allow_users?: string[]
  active: boolean
  version: number
  created_by: string
  created_at: string
  lift_requested_by?: string
  lift_requested_at?: string
  lifted_at?: string
  lifted_by?: string
  lift_note?: string
}

export interface PlatformOverview {
  status: { mode: 'open' | 'maintenance'; lockdowns: PlatformFeature[]; active: unknown[]; scheduled: unknown[] }
  controls: PlatformControl[]
}

export type DelistingStepState =
  | 'delist_announced' | 'deposits_disabled' | 'sell_only' | 'trading_halted'
  | 'withdrawal_only' | 'frozen' | 'delisted'
export const DELISTING_STATES: DelistingStepState[] = [
  'delist_announced', 'deposits_disabled', 'sell_only', 'trading_halted', 'withdrawal_only', 'frozen', 'delisted',
]

export interface Delisting {
  id: string
  currency_hk: string
  kind: 'standard' | 'emergency'
  status: 'scheduled' | 'completed' | 'cancelled'
  steps: { state: DelistingStepState; at: string; applied_at?: string }[]
  settlement: 'convert' | 'claim'
  settlement_currency_hk?: string
  price_source?: 'last_trade' | 'twap' | 'fixed'
  fixed_price?: string
  claim_days?: number
  announcement_url?: string
  version: number
  created_at: string
}

export interface Migration {
  id: string
  target_hk: string
  forced: boolean
  phase: string
  sources: { currency_hk: string; ratio: string }[]
  steps: { phase: string; at: string; applied_at?: string }[]
  version: number
  created_at: string
}

/* ---------- Phase 3: money flow ---------- */

export type WithdrawalStatus = 'review' | 'queued' | 'processing' | 'partially_paid' | 'completed' | 'cancelled' | 'rejected' | 'failed'
export type PayoutStatus = 'planned' | 'submitted' | 'completed' | 'failed' | 'released'

export interface Payout {
  id: string
  withdrawal_id: string
  user_hk: string
  seq: number
  rail: 'card' | 'paya' | 'satna' | 'pol' | 'account' | 'chain'
  currency: string
  network?: string
  amount: string
  fee: string
  status: PayoutStatus
  destination: string // masked
  destination_kind: 'card' | 'iban' | 'account' | 'crypto'
  scheduled_for?: string
  tracking_id?: string
  last_error?: string
  attempts: number
  submitted_at?: string
  completed_at?: string
  failed_at?: string
}
/** The detail shows the destination in the clear; reading it is audited by the backend. */
export interface PayoutDetail extends Payout {
  destination_value?: string
  destination_memo?: string
}

export interface Withdrawal {
  id: string
  user_hk: string
  currency_hk: string
  currency: string
  network: string
  destination_id: string
  destination: string // masked
  amount: string
  fee: string
  total: string
  status: WithdrawalStatus
  review_reason?: 'amount' | 'no_threshold'
  reviewed_at?: string
  reason?: string
  payouts?: Payout[]
  created_at: string
  updated_at: string
}

export type RestrictionScope = 'account' | 'operation' | 'asset'
export type RestrictionOperation = 'deposit' | 'withdraw' | 'convert' | 'buy' | 'sell' | 'trade'
export const RESTRICTION_OPERATIONS: RestrictionOperation[] = ['deposit', 'withdraw', 'convert', 'buy', 'sell', 'trade']
export type RestrictionReason = 'court_order' | 'aml_review' | 'sanctions' | 'fraud' | 'security' | 'user_request' | 'other'
export const RESTRICTION_REASONS: RestrictionReason[] = ['court_order', 'aml_review', 'sanctions', 'fraud', 'security', 'user_request', 'other']

export interface Restriction {
  id: string
  user_hk: string
  scope: RestrictionScope
  currency_hk?: string
  operations?: RestrictionOperation[]
  reason: RestrictionReason
  case_ref?: string
  note?: string
  ends_at?: string
  active: boolean
  version: number
  created_by: string
  created_at: string
  lifted_at?: string
  lifted_by?: string
  lift_note?: string
}

export interface AuditEntry {
  hk: string
  occurred_at: string
  actor_type: string
  actor_id: string
  action: string
  target_type?: string
  target_id?: string
  outcome: 'success' | 'failure' | 'denied'
  reason?: string
  request_id?: string
  ip?: string
  user_agent?: string
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
  integrity: 'verified' | 'mismatch' | 'unsealed' | 'unchecked'
}

export interface IntegrityFinding {
  id: number
  table: string
  row_key: string
  check: 'missing' | 'mismatch' | 'unknown_key' | 'row_missing'
  detected_by: 'read' | 'verifier'
  detected_at: string
  last_seen_at: string
  seen_count: number
  resolution?: 'resealed' | 'report_mode' | 'row_gone'
  resolved_at?: string
  resolved_by?: string
  reason?: string
  reseal_requested_by?: string
  reseal_requested_at?: string
  reseal_request_reason?: string
  reseal_row_version?: number
  reseal_values?: Record<string, unknown>
}

export interface VenueHold {
  id: string
  venue: string
  asset: string
  currency_hk: string
  booked: number
  reported: number
  difference: number
  detected_at: string
  cleared_at?: string
  cleared_by?: string
  clear_reason?: string
}
export interface VenueBalance {
  asset: string
  currency: string
  free: number
  locked: number
  reserved: number
  available: number
  booked: number
  difference: number
  mismatch_runs: number
  taken_at: string
  routability: 'routable' | 'held' | 'stale' | 'unverified'
  reasons?: string[]
}
export interface VenueState {
  venue: string
  snapshots: { kind: string; taken_at: string; fresh: boolean; failed_at?: string; failure?: string }[]
  balances: VenueBalance[]
  instruments: number
  trading: number
  holds: VenueHold[]
}

export interface RoutingVenueRule { venue: string; priority?: number; weight?: number; max_balance_share_bps?: number; reserve?: string; max_daily_notional?: string }
export interface RoutingRule {
  name: string
  priority?: number
  markets?: string[]
  sides?: string[]
  networks?: string[]
  regions?: string[]
  min_notional?: string
  max_notional?: string
  min_level?: number
  strategy?: string
  use_inventory?: boolean
  max_cost_bps?: number
  venues?: RoutingVenueRule[]
}
export interface RoutingRulesView {
  enabled: boolean
  cache_seconds: number
  version?: { version: number; rules: RoutingRule[]; reason: string; created_by: string; created_at: string }
}
export interface RouteExplanation {
  rule_version: number
  rules: { rule: string; matched: boolean; skipped?: string[]; failure?: string; sources?: { source: string; venue?: string; capacity: number; cost_bps: number; skipped?: string[] }[] }[]
  route?: { rule: string; network?: string; cost_bps: number; legs: { source: string; venue?: string; symbol: string; quantity: number; notional: number; cost_bps: number }[] }
  reason?: string
}

export interface SmsStatus {
  mode: 'auto' | 'manual'
  order?: string[]
  effective_order: string[]
  delivery_reports: boolean
  window_minutes: number
  providers: { name: string; templates: string[]; healthy: boolean; breaker_open_until?: string; accepted: number; provider_errors: number; delivered: number; failed: number }[]
}
