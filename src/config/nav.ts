import {
  Coins,
  Landmark,
  LineChart,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  ShieldCheck,
  Siren,
  Users,
  Wallet,
} from 'lucide-react'
import type { LinkProps } from '@tanstack/react-router'

export interface NavDef {
  key: string
  to: LinkProps['to'] | (string & {})
  icon: React.ElementType
  group: 'operations' | 'finance' | 'users' | 'system'
  /** Resource and the least level needed to see it. `null`: every administrator. */
  needs: [resource: string, level: string] | null
  /** The backend has no API for this area yet. */
  mock?: boolean
}

/** Single source for the sidebar and the route guards. */
export const NAV: NavDef[] = [
  { key: 'dashboard', to: '/', icon: LayoutDashboard, group: 'operations', needs: null },
  { key: 'currencies', to: '/currencies', icon: Coins, group: 'operations', needs: ['currencies', 'view'] },
  { key: 'markets', to: '/markets', icon: Landmark, group: 'operations', needs: ['markets', 'view'] },
  { key: 'prices', to: '/prices', icon: LineChart, group: 'operations', needs: ['prices', 'view'] },
  { key: 'withdrawals', to: '/section/withdrawals', icon: Wallet, group: 'finance', needs: ['withdrawals', 'status'] },
  { key: 'users', to: '/section/users', icon: Users, group: 'users', needs: ['users', 'lookup'], mock: true },
  { key: 'tickets', to: '/section/tickets', icon: LifeBuoy, group: 'users', needs: ['tickets', 'view'], mock: true },
  { key: 'platform', to: '/platform', icon: Siren, group: 'system', needs: ['platform', 'view'] },
  { key: 'audit', to: '/section/audit', icon: ScrollText, group: 'system', needs: ['audit', 'view'] },
  { key: 'access', to: '/access', icon: ShieldCheck, group: 'system', needs: ['access', 'view'], mock: true },
  { key: 'sessions', to: '/sessions', icon: KeyRound, group: 'system', needs: null },
]
