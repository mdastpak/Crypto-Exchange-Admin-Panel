import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { WithdrawalsPage } from '@/features/withdrawals/withdrawals-page'

export const Route = createFileRoute('/_authenticated/withdrawals')({
  beforeLoad: requireLevel('withdrawals', 'view'),
  component: WithdrawalsPage,
})
