import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { RestrictionsPage } from '@/features/restrictions/restrictions-page'

export const Route = createFileRoute('/_authenticated/restrictions')({
  beforeLoad: requireLevel('restrictions', 'request'),
  component: RestrictionsPage,
})
