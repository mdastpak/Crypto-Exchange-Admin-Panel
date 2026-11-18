import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { StaffPage } from '@/features/staff/staff-page'

export const Route = createFileRoute('/_authenticated/staff')({
  beforeLoad: requireLevel('staff', 'view'),
  component: StaffPage,
})
