import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Landmark, LogOut } from 'lucide-react'
import { signOut } from '@/auth/auth-api'
import { useSession } from '@/auth/session-store'
import { hasLevel } from '@/access/dependencies'
import { NAV } from '@/config/nav'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavGroup } from './nav-group'
import { type NavGroup as NavGroupType } from './types'

/** Built from the grants of `/admin/me`: what you cannot use is not drawn. */
export function AppSidebar() {
  const { t } = useTranslation()
  const { t: tn } = useTranslation('nav')
  const me = useSession((s) => s.me)
  const groups = useMemo(() => {
    const grants = me?.grants ?? {}
    const out = new Map<string, NavGroupType>()
    for (const n of NAV) {
      if (n.needs && !hasLevel(grants, n.needs[0], n.needs[1])) continue
      const g = out.get(n.group) ?? { title: tn(`groups.${n.group}`), items: [] }
      g.items.push({
        title: tn(n.key),
        url: n.to,
        icon: n.icon,
        badge: n.mock ? t('mockBadge') : undefined,
      })
      out.set(n.group, g)
    }
    return [...out.values()]
  }, [me, t, tn])

  return (
    <Sidebar collapsible='icon' variant='inset' role='navigation' aria-label={t('mainNav')}>
      <SidebarHeader>
        <div className='flex items-center gap-2 px-2 py-1.5 font-semibold'>
          <Landmark className='size-5' />
          <span className='truncate'>{t('appName')}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <NavGroup key={g.title} {...g} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className='flex items-center justify-between gap-2 px-2 text-xs'>
          <span className='truncate' dir='ltr'>{me?.email}</span>
          <Button size='icon' variant='ghost' aria-label={t('signOut')} onClick={() => void signOut()}>
            <LogOut className='size-4' />
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
