import { createFileRoute, notFound } from '@tanstack/react-router'
import { canNow } from '@/auth/permissions'
import { AccessManager } from '@/features/access/access-manager'

export const Route = createFileRoute('/_authenticated/access')({
  // A route you cannot use looks the same as a route that does not exist.
  beforeLoad: () => {
    if (!canNow('access', 'view')) throw notFound()
  },
  component: AccessManager,
})
