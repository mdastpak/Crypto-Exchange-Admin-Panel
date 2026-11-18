import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { LedgerPage } from '@/features/ledger/ledger-page'

export const Route = createFileRoute('/_authenticated/ledger')({
  beforeLoad: requireLevel('ledger', 'view'),
  component: LedgerPage,
})
