import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { VenuesPage } from '@/features/venues/venues-page'

export const Route = createFileRoute('/_authenticated/venues')({
  beforeLoad: requireLevel('venues', 'view'),
  component: VenuesPage,
})
