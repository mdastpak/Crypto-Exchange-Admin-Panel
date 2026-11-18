import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { SecurityPage } from '@/features/security/security-page'

export const Route = createFileRoute('/_authenticated/security')({
  beforeLoad: requireLevel('security', 'view'),
  component: SecurityPage,
})
