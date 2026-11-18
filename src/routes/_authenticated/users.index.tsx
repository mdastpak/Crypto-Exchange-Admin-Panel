import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { UsersPage } from '@/features/users/users-page'

export const Route = createFileRoute('/_authenticated/users/')({
  beforeLoad: requireLevel('users', 'lookup'),
  component: UsersPage,
})
