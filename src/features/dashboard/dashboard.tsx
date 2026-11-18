import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/page-header'
import { Main } from '@/components/layout/main'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Phase 1 placeholder. Real tiles arrive with the operations modules (Phase 2). */
export function Dashboard() {
  const { t } = useTranslation()
  const { t: tn } = useTranslation('nav')
  return (
    <>
      <PageHeader title={tn('dashboard')} />
      <Main>
        <Card className='max-w-xl'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              {t('appName')}
              <Badge variant='outline'>{t('mockBadge')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            {t('foundationReady')}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
