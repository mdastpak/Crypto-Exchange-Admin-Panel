import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { IntegrityPage } from '@/features/integrity/integrity-page'

export const Route = createFileRoute('/_authenticated/integrity')({
  beforeLoad: requireLevel('integrity', 'view'),
  component: IntegrityPage,
})
