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
