import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/page-header'
import { Main } from '@/components/layout/main'

export function SectionPlaceholder({ section }: { section: string }) {
  const { t } = useTranslation()
  const { t: tn } = useTranslation('nav')
  return (
    <>
      <PageHeader title={tn(section, { defaultValue: section })} />
      <Main>
        <p className='text-sm text-muted-foreground'>{t('sectionLater')}</p>
      </Main>
    </>
  )
}
