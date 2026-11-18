import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { TicketDetail } from '@/features/tickets/ticket-detail'

export const Route = createFileRoute('/_authenticated/tickets/$id')({
  beforeLoad: requireLevel('tickets', 'view'),
  component: function Page() {
    const { id } = Route.useParams()
    return <TicketDetail id={id} />
  },
})
