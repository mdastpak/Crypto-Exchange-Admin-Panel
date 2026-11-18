import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { PageHeader } from '@/components/page-header'
import { Main } from '@/components/layout/main'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface SessionRow {
  id: string
  current: boolean
  device: string
  network: string
  last_active: number
}

export function SessionsPage() {
  const { t } = useTranslation('session')
  const { t: tn } = useTranslation('nav')
  const q = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => api.get<{ sessions: SessionRow[] }>('/admin/sessions'),
  })
  return (
    <>
      <PageHeader title={tn('sessions')} />
      <Main>
        <div className='grid max-w-2xl gap-3'>
          {q.data?.sessions.map((s) => (
            <Card key={s.id}>
              <CardContent className='flex flex-wrap items-center justify-between gap-2 pt-6 text-sm'>
                <div className='grid gap-1'>
                  <span>{t('device')}: <bdi dir='ltr'>{s.device}</bdi></span>
                  <span>{t('network')}: <bdi dir='ltr'>{s.network}</bdi></span>
                </div>
                {s.current && <Badge>{t('current')}</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      </Main>
    </>
  )
}
