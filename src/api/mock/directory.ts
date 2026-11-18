import type { Grants } from '@/access/catalog'
import { applyDependencies, levelIndex } from '@/access/dependencies'

/**
 * Administrators, groups, group versions, pending two-person changes, and the
 * security policy: the data behind requirements 01 and 07. Shared by the sign-in
 * mock and the access mock.
 */

export interface GroupVersion { version: number; grants: Grants; reason: string; author: string; approved_by?: string; at: string }
export interface GroupRec {
  id: string
  name: string
  description: string
  status: 'active' | 'retired'
  system: boolean
  version: number
  grants: Grants
  versions: GroupVersion[]
}
export interface Assignment { id: string; expires_at?: string }
export interface AdminRec {
  hk: string
  email: string
  password: string
  status: 'active' | 'disabled'
  groups: Assignment[]
  totp_enabled: boolean
  password_changed_at: string
  last_sign_in_at?: string
  mustChangePassword?: boolean
}
export interface Change {
  id: string
  kind: 'group_change' | 'group_create' | 'staff_create' | 'staff_groups' | 'staff_reset_totp' | 'policy_change'
  summary: string
  requested_by: string
  requested_at: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  decided_by?: string
  decided_at?: string
  payload: unknown
  apply: (approver: string) => void
}
export interface PolicyRec {
  password: { min_length: number; max_age_days: number; reset_delay_hours: number; post_reset_hold_hours: number; history: number }
  session: { idle_minutes: number; absolute_hours: number; access_token_minutes: number; max_per_admin: number; step_up_minutes: number }
  version: number
}

const T = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
const ALL: Grants = {
  tickets: 'edit', users: 'view', kyc: 'approve', withdrawals: 'approve', transactions: 'view', requests: 'view', system_health: 'view',
  restrictions: 'edit', currencies: 'manage', platform: 'manage', audit: 'view', access: 'manage', markets: 'edit', prices: 'approve',
  payouts: 'edit', integrity: 'approve', venues: 'approve', otc: 'edit', notifications: 'edit',
  ledger: 'edit', staff: 'manage', security: 'manage', reveal_pii: 'allow', kyc_documents: 'allow',
}

const mk = (id: string, description: string, grants: Grants, version = 1, system = false): GroupRec => ({
  id, name: id, description, status: 'active', system, version, grants,
  versions: Array.from({ length: version }, (_, i) => ({ version: i + 1, grants, reason: i === 0 ? 'Initial template' : `Review ${i}`, author: 'ali@exchange.example', approved_by: i ? 'nima@exchange.example' : undefined, at: T(60 - i * 10) })),
})

export let groups: Record<string, GroupRec> = {}
export let admins: Record<string, AdminRec> = {}
export let changes: Change[] = []
export let policy: PolicyRec

const PW = 'correct horse battery staple'

export function resetDirectory() {
  groups = {
    super_admin: mk('super_admin', 'Everything, including access and staff', ALL, 1, true),
    support_agent: mk('support_agent', 'Answers tickets; sees users in masked form', applyDependencies({ tickets: 'edit', restrictions: 'request', transactions: 'status' }).grants, 3),
    finance_analyst: mk('finance_analyst', 'Reads withdrawals, payouts, and the ledger', applyDependencies({ withdrawals: 'view', transactions: 'view', currencies: 'view', markets: 'view', prices: 'view', payouts: 'view', audit: 'view', ledger: 'view' }).grants, 2),
    finance_manager: mk('finance_manager', 'Decides withdrawals and records payouts', applyDependencies({ withdrawals: 'approve', currencies: 'view', audit: 'view', payouts: 'edit', venues: 'approve', ledger: 'view' }).grants, 2),
    compliance_officer: mk('compliance_officer', 'Reviews KYC and reveals identity data', applyDependencies({ kyc: 'approve', users: 'view', withdrawals: 'view', restrictions: 'edit', reveal_pii: 'allow', kyc_documents: 'allow', audit: 'view' }).grants, 1),
  }
  const a = (email: string, gs: Assignment[], extra: Partial<AdminRec> = {}): AdminRec => ({
    hk: crypto.randomUUID(), email, password: PW, status: 'active', groups: gs, totp_enabled: true, password_changed_at: T(20), last_sign_in_at: T(0.2), ...extra,
  })
  admins = {}
  for (const r of [
    a('ali@exchange.example', [{ id: 'super_admin' }], { password_changed_at: T(60) }),
    a('nima@exchange.example', [{ id: 'super_admin' }], { password_changed_at: T(75) }),
    a('sara@exchange.example', [{ id: 'support_agent' }]),
    a('reza@exchange.example', [{ id: 'finance_manager' }], { password_changed_at: T(80) }),
    a('mina@exchange.example', [{ id: 'compliance_officer' }]),
    a('omid@exchange.example', [{ id: 'finance_analyst', expires_at: new Date(Date.now() + 12 * 86_400_000).toISOString() }]),
    a('expired@exchange.example', [{ id: 'support_agent' }], { password_changed_at: T(120), mustChangePassword: true }),
    a('former@exchange.example', [{ id: 'support_agent' }], { status: 'disabled', last_sign_in_at: T(40) }),
  ]) admins[r.email] = r
  changes = []
  policy = {
    version: 2,
    password: { min_length: 14, max_age_days: 90, reset_delay_hours: 24, post_reset_hold_hours: 12, history: 12 },
    session: { idle_minutes: 15, absolute_hours: 8, access_token_minutes: 10, max_per_admin: 2, step_up_minutes: 5 },
  }
}
resetDirectory()

/** Effective grants: the highest level per resource over the active, unexpired groups. */
export function grantsOf(email: string): Grants {
  const out: Grants = {}
  const rec = admins[email]
  if (!rec || rec.status !== 'active') return out
  for (const asg of rec.groups) {
    if (asg.expires_at && Date.parse(asg.expires_at) <= Date.now()) continue
    const g = groups[asg.id]
    if (!g || g.status !== 'active') continue
    for (const [r, l] of Object.entries(g.grants)) if (levelIndex(r, l) > levelIndex(r, out[r] ?? 'none')) out[r] = l
  }
  return out
}

export function addChange(c: Omit<Change, 'id' | 'status' | 'requested_at'>): Change {
  const ch: Change = { ...c, id: crypto.randomUUID(), status: 'pending', requested_at: new Date().toISOString() }
  changes.unshift(ch)
  return ch
}
export const publicChange = ({ apply: _a, ...rest }: Change) => rest
