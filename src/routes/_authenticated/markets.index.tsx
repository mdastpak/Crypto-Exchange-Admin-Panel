import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { MarketsPage } from '@/features/markets/markets-page'

export const Route = createFileRoute('/_authenticated/markets/')({
  beforeLoad: requireLevel('markets', 'view'),
  component: MarketsPage,
})
