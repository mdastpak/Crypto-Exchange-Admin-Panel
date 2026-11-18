import { createFileRoute, redirect } from '@tanstack/react-router'
import { isSignedIn } from '@/auth/session-store'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    if (!isSignedIn()) throw redirect({ to: '/sign-in' })
  },
  component: AuthenticatedLayout,
})
