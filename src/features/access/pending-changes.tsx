import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { PendingChange } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { useSession } from '@/auth/session-store'
import { describeError } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'

/** Changes to access, staff, and policy wait here for a second administrator. The requester cannot approve. */
export function PendingChanges() {
  const { t } = useTranslation('access')
  const qc = useQueryClient()
  const me = useSession((s) => s.me?.email)
  const canManage = useCan('access', 'manage')
  const q = useQuery({ queryKey: ['admin', 'access', 'changes'], queryFn: () => api.get<{ items: PendingChange[] }>('/admin/access/changes'), refetchInterval: 15_000, staleTime: 0, refetchOnMount: 'always' })
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => api.post(`/admin/access/changes/${id}/${action}`),
    onSuccess: (_r, v) => { toast.success(v.action === 'approve' ? t('pending.approved') : t('pending.rejected')); void qc.invalidateQueries({ queryKey: ['admin'] }) },
    onError: (e) => { toast.error(describeError(t, e)); void qc.invalidateQueries({ queryKey: ['admin', 'access', 'changes'] }) },
  })
  const columns: Column<PendingChange>[] = [
    { key: 'k', header: '', cell: (c) => <div><div>{t(`pending.kind.${c.kind}`)}</div><bdi dir='ltr' className='font-mono text-xs text-muted-foreground'>{c.summary}</bdi></div> },
    { key: 'by', header: t('pending.requestedBy'), cell: (c) => <bdi dir='ltr' className='text-xs'>{c.requested_by}</bdi> },
    { key: 'at', header: '', cell: (c) => <DateTime value={c.requested_at} /> },
    { key: 'r', header: t('pending.reason'), cell: (c) => <span className='whitespace-normal'>{c.reason}</span>, className: 'max-w-xs' },
    { key: 's', header: '', cell: (c) => <StatusPill tone={c.status === 'pending' ? 'warn' : c.status === 'approved' ? 'ok' : 'neutral'}>{t(`pending.status.${c.status}`)}</StatusPill> },
    {
      key: 'a', header: '', cell: (c) => c.status === 'pending' && canManage && (
        <div className='flex gap-2'>
          <Button size='sm' disabled={c.requested_by === me || decide.isPending} title={c.requested_by === me ? t('pending.own') : undefined} onClick={() => decide.mutate({ id: c.id, action: 'approve' })}>{t('pending.approve')}</Button>
          <Button size='sm' variant='outline' disabled={c.requested_by === me || decide.isPending} onClick={() => decide.mutate({ id: c.id, action: 'reject' })}>{t('pending.reject')}</Button>
        </div>
      ),
    },
  ]
  return <DataTable columns={columns} rows={q.data?.items ?? []} rowKey={(c) => c.id} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} empty={t('pending.empty')} />
}
