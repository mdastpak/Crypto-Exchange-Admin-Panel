import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { RestrictionsPage } from '@/features/restrictions/restrictions-page'

export const Route = createFileRoute('/_authenticated/restrictions')({
  beforeLoad: requireLevel('restrictions', 'request'),
  validateSearch: (s: Record<string, unknown>) => ({ hk: typeof s.hk === 'string' ? s.hk : undefined }),
  component: function Page() {
    const { hk } = Route.useSearch()
    return <RestrictionsPage key={hk} initialHk={hk} />
  },
})
