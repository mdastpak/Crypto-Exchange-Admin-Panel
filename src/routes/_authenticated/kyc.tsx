import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { KycPage } from '@/features/kyc/kyc-page'

export const Route = createFileRoute('/_authenticated/kyc')({
  beforeLoad: requireLevel('kyc', 'view'),
  component: KycPage,
})
