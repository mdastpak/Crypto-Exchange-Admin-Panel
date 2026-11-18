import { useEffect } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { startTabSync } from '@/auth/tab-sync'
import { useSession } from '@/auth/session-store'
import { useSessionGuard } from '@/auth/use-session-guard'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { IdleWarning } from '@/components/session-status'
import { SkipToMain } from '@/components/skip-to-main'

/** Shell for every signed-in page. Also owns the session timers. */
export function AuthenticatedLayout() {
  const { t } = useTranslation('session')
  const navigate = useNavigate()
  const token = useSession((s) => s.token)
  const endReason = useSession((s) => s.endReason)
  const passwordExpired = useSession((s) => s.passwordExpired)
  useSessionGuard()

  useEffect(() => startTabSync(), [])

  useEffect(() => {
    if (token) return
    if (endReason && endReason !== 'signed_out') {
      toast.warning(
        endReason === 'idle' ? t('expiredIdle') : endReason === 'absolute' ? t('expiredAbsolute') : t('expiredRevoked')
      )
    }
    void navigate({ to: '/sign-in', replace: true })
  }, [token, endReason, navigate, t])

  useEffect(() => { if (token && passwordExpired) void navigate({ to: '/change-password', replace: true }) }, [token, passwordExpired, navigate])

  if (!token || passwordExpired) return null

  return (
    <LayoutProvider>
      <SidebarProvider>
        <SkipToMain />
        <AppSidebar />
        <SidebarInset className={cn('@container/content', 'has-data-[layout=fixed]:h-svh')}>
          <Outlet />
        </SidebarInset>
        <IdleWarning />
      </SidebarProvider>
    </LayoutProvider>
  )
}
