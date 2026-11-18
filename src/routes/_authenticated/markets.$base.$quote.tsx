import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { MarketDetail } from '@/features/markets/market-detail'

export const Route = createFileRoute('/_authenticated/markets/$base/$quote')({
  beforeLoad: requireLevel('markets', 'view'),
  component: function Page() {
    const { base, quote } = Route.useParams()
    return <MarketDetail base={base} quote={quote} />
  },
})
