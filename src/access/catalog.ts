/**
 * Default permission catalog. The backend owns the real one
 * (`GET /admin/access/catalog`, requirement 01); the panel builds its editor
 * from whatever the API returns and uses this copy in mock mode and in tests.
 */
export type Grants = Record<string, string>

export interface ResourceDef {
  key: string
  /** Ordered from the least to the most access. `none` is always first. */
  levels: string[]
}

export const RESOURCES: ResourceDef[] = [
  { key: 'tickets', levels: ['none', 'view', 'edit'] },
  { key: 'users', levels: ['none', 'lookup', 'view'] },
  { key: 'kyc', levels: ['none', 'status', 'view', 'approve'] },
  { key: 'withdrawals', levels: ['none', 'status', 'view', 'approve'] },
  { key: 'transactions', levels: ['none', 'status', 'view'] },
  { key: 'requests', levels: ['none', 'status', 'view'] },
  { key: 'system_health', levels: ['none', 'view'] },
  { key: 'restrictions', levels: ['none', 'request', 'edit'] },
  { key: 'currencies', levels: ['none', 'view', 'edit', 'manage'] },
  { key: 'markets', levels: ['none', 'view', 'edit'] },
  { key: 'prices', levels: ['none', 'view', 'edit', 'approve'] },
  { key: 'platform', levels: ['none', 'view', 'manage'] },
  { key: 'audit', levels: ['none', 'view'] },
  { key: 'access', levels: ['none', 'view', 'manage'] },
]

/**
 * Lookups each grant needs from other areas, keyed `resource:level`.
 * Granting the key adds the listed minimum levels automatically.
 */
export const REQUIREMENTS: Record<string, Record<string, string>> = {
  'tickets:edit': {
    users: 'lookup',
    kyc: 'status',
    withdrawals: 'status',
    requests: 'status',
    system_health: 'view',
  },
  'withdrawals:view': { users: 'lookup' },
  'withdrawals:approve': { users: 'lookup', kyc: 'status', system_health: 'view' },
  'kyc:approve': { users: 'lookup' },
  'restrictions:request': { users: 'lookup' },
}
