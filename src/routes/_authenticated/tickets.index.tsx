import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { TicketsPage } from '@/features/tickets/tickets-page'

export const Route = createFileRoute('/_authenticated/tickets/')({
  beforeLoad: requireLevel('tickets', 'view'),
  component: TicketsPage,
})
