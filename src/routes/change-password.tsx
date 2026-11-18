import { createFileRoute, redirect } from '@tanstack/react-router'
import { isSignedIn } from '@/auth/session-store'
import { ChangePassword } from '@/features/security/change-password'

export const Route = createFileRoute('/change-password')({
  beforeLoad: () => {
    if (!isSignedIn()) throw redirect({ to: '/sign-in' })
  },
  component: ChangePassword,
})
