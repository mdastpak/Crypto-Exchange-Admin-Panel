import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useCan } from '@/auth/permissions'

/** Every detail page links to the audit log filtered by its target, for those who may read it. */
export function AuditLink({ targetType, targetId }: { targetType: string; targetId: string }) {
  const { t } = useTranslation('audit')
  const can = useCan('audit', 'view')
  if (!can) return null
  return (
    <Link to='/audit' search={{ target_type: targetType, target_id: targetId }} className='text-sm underline-offset-4 hover:underline'>
      {t('title')} →
    </Link>
  )
}
