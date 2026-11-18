import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { AuditPage } from '@/features/audit/audit-page'

export const Route = createFileRoute('/_authenticated/audit')({
  beforeLoad: requireLevel('audit', 'view'),
  validateSearch: (s: Record<string, unknown>) => ({
    target_type: typeof s.target_type === 'string' ? s.target_type : undefined,
    target_id: typeof s.target_id === 'string' ? s.target_id : undefined,
  }),
  component: function Page() {
    const search = Route.useSearch()
    return <AuditPage key={`${search.target_type}:${search.target_id}`} initial={search} />
  },
})
