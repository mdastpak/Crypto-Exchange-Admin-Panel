import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { CurrencyDetail } from '@/features/currencies/currency-detail'

export const Route = createFileRoute('/_authenticated/currencies/$hk')({
  beforeLoad: requireLevel('currencies', 'view'),
  component: function Page() {
    const { hk } = Route.useParams()
    return <CurrencyDetail hk={hk} />
  },
})
