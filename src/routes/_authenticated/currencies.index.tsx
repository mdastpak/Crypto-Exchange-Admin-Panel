import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { CurrenciesPage } from '@/features/currencies/currencies-page'

export const Route = createFileRoute('/_authenticated/currencies/')({
  beforeLoad: requireLevel('currencies', 'view'),
  component: CurrenciesPage,
})
