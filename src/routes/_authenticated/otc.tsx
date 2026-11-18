import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { OtcPage } from '@/features/venues/otc-page'

export const Route = createFileRoute('/_authenticated/otc')({
  beforeLoad: requireLevel('otc', 'view'),
  component: OtcPage,
})
