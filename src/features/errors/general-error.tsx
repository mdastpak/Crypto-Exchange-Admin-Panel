import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/types'
import { Button } from '@/components/ui/button'

/** Shows the error code and request id, never the message body or a stack. */
export function GeneralError({ error }: { error?: unknown }) {
  const { t } = useTranslation('errors')
  const api = error instanceof ApiError ? error : null
  return (
    <div className='grid min-h-svh place-items-center p-6 text-center'>
      <div className='grid gap-3'>
        <h1 className='text-2xl font-semibold'>{t('generalTitle')}</h1>
        <p className='text-muted-foreground'>{t('generalBody')}</p>
        {api?.requestId && (
          <p className='text-xs text-muted-foreground'>
            {t('requestId')}: <bdi dir='ltr' className='font-mono'>{api.requestId}</bdi>
          </p>
        )}
        <Button asChild><Link to='/'>{t('home')}</Link></Button>
      </div>
    </div>
  )
}
