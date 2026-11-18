import { createFileRoute, redirect } from '@tanstack/react-router'
import { isSignedIn } from '@/auth/session-store'
import { SignIn } from '@/features/auth/sign-in'

export const Route = createFileRoute('/sign-in')({
  beforeLoad: () => {
    if (isSignedIn()) throw redirect({ to: '/' })
  },
  component: SignIn,
})
