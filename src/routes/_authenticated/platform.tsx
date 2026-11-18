import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { PlatformPage } from '@/features/platform/platform-page'

export const Route = createFileRoute('/_authenticated/platform')({
  beforeLoad: requireLevel('platform', 'view'),
  component: PlatformPage,
})
