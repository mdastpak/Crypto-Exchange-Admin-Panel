import { createFileRoute } from '@tanstack/react-router'
import { requireLevel } from '@/auth/guard'
import { UserDetail } from '@/features/users/user-detail'

export const Route = createFileRoute('/_authenticated/users/$hk')({
  beforeLoad: requireLevel('users', 'lookup'),
  component: function Page() {
    const { hk } = Route.useParams()
    return <UserDetail hk={hk} />
  },
})
