import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { SmsPage } from '@/features/notifications/sms-page'

export const Route = createFileRoute('/_authenticated/notifications')({
  beforeLoad: requireLevel('notifications', 'view'),
  component: SmsPage,
})
