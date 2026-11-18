import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function NotFound() {
  const { t } = useTranslation('errors')
  return (
    <div className='grid min-h-svh place-items-center p-6 text-center'>
      <div className='grid gap-3'>
        <h1 className='text-2xl font-semibold'>{t('notFoundTitle')}</h1>
        <p className='text-muted-foreground'>{t('notFoundBody')}</p>
        <Button asChild><Link to='/'>{t('home')}</Link></Button>
      </div>
    </div>
  )
}
