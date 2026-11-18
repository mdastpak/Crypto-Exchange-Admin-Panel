import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { PricesPage } from '@/features/markets/prices-page'

export const Route = createFileRoute('/_authenticated/prices')({
  beforeLoad: requireLevel('prices', 'view'),
  component: PricesPage,
})
