import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { PayoutsPage } from '@/features/withdrawals/payouts-page'

export const Route = createFileRoute('/_authenticated/payouts')({
  beforeLoad: requireLevel('payouts', 'view'),
  component: PayoutsPage,
})
