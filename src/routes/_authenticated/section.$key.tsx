import { createFileRoute, notFound } from '@tanstack/react-router'
import { canNow } from '@/auth/permissions'
import { NAV } from '@/config/nav'
import { SectionPlaceholder } from '@/features/errors/section-placeholder'

export const Route = createFileRoute('/_authenticated/section/$key')({
  beforeLoad: ({ params }) => {
    const n = NAV.find((x) => x.key === params.key)
    if (!n || (n.needs && !canNow(n.needs[0], n.needs[1]))) throw notFound()
  },
  component: function Section() {
    const { key } = Route.useParams()
    return <SectionPlaceholder section={key} />
  },
})
