import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { Currency, CurrencyStatus } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { conflictVersion, describeError } from '@/lib/errors'
import { AuditLink } from '@/components/audit-link'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CurrencyFormDialog } from './currency-form-dialog'
import { LifecycleTab } from './lifecycle-tab'
import { NetworksTab } from './networks-tab'
import { lifecycleTone, statusTone } from './status'

export function CurrencyDetail({ hk }: { hk: string }) {
  const { t } = useTranslation('currencies')
  const qc = useQueryClient()
  const canEdit = useCan('currencies', 'edit')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const q = useQuery({ queryKey: ['admin', 'currencies', hk], queryFn: () => api.get<Currency>(`/admin/currencies/${hk}`) })
  const c = q.data
  const done = (msg: string) => { toast.success(msg); void qc.invalidateQueries({ queryKey: ['admin', 'currencies'] }) }
  const fail = (e: unknown) => {
    const v = conflictVersion(e)
    toast.error(v !== null ? t('form.conflict', { version: v }) : describeError(t, e))
    void qc.invalidateQueries({ queryKey: ['admin', 'currencies'] })
  }
  const setStatus = useMutation({
    mutationFn: (status: CurrencyStatus) => api.put(`/admin/currencies/${hk}`, { status, version: c!.version }),
    onSuccess: () => done(t('detail.statusChanged')), onError: fail,
  })
  const del = useMutation({
    mutationFn: () => api.del(`/admin/currencies/${hk}?version=${c!.version}`),
    onSuccess: () => { setDeleting(false); done(t('detail.deleted')) }, onError: (e) => { setDeleting(false); fail(e) },
  })
  const restore = useMutation({
    mutationFn: () => api.post(`/admin/currencies/${hk}/restore?version=${c!.version}`),
    onSuccess: () => done(t('detail.restored')), onError: fail,
  })

  return (
    <>
      <PageHeader title={c ? c.info.symbol : t('title')} />
      <Main>
        <div className='mb-3'><Link to='/currencies' className='text-sm text-muted-foreground underline-offset-4 hover:underline'>← {t('title')}</Link></div>
        {q.isPending && <Skeleton className='h-40 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        {c && (
          <div className='grid gap-4'>
            <Card>
              <CardContent className='flex flex-wrap items-center gap-3 pt-6'>
                <h2 className='text-xl font-semibold' dir='ltr'>{c.info.symbol}</h2>
                <span>{c.info.fa_name}</span><span className='text-muted-foreground' dir='ltr'>{c.info.en_name}</span>
                <StatusPill tone={statusTone(c.status)}>{t(`status.${c.status}`)}</StatusPill>
                <StatusPill tone={lifecycleTone(c.lifecycle?.state)}>{t(`lifecycle.${c.lifecycle?.state ?? 'active'}`)}</StatusPill>
                <span className='text-xs text-muted-foreground'>{t('cols.version')} <span className='tabular-nums'>{c.version}</span></span>
                {canEdit && (
                  <div className='ms-auto flex flex-wrap gap-2'>
                    {c.deleted_at ? (
                      <Button variant='outline' disabled={restore.isPending} onClick={() => restore.mutate()}>{t('detail.restore')}</Button>
                    ) : (
                      <>
                        <Button variant='outline' onClick={() => setEditing(true)}>{t('common:edit')}</Button>
                        {c.status !== 'approved' && <Button disabled={setStatus.isPending} onClick={() => setStatus.mutate('approved')}>{t('detail.approve')}</Button>}
                        {c.status === 'approved' && <Button variant='outline' disabled={setStatus.isPending} onClick={() => setStatus.mutate('suspend')}>{t('detail.suspend')}</Button>}
                        {c.status === 'suspend' && <Button variant='outline' disabled={setStatus.isPending} onClick={() => setStatus.mutate('pending')}>{t('detail.moveToPending')}</Button>}
                        <Button variant='destructive' onClick={() => setDeleting(true)}>{t('detail.delete')}</Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Tabs defaultValue='info'>
              <TabsList>
                <TabsTrigger value='info'>{t('detail.tabs.info')}</TabsTrigger>
                <TabsTrigger value='networks'>{t('detail.tabs.networks')}</TabsTrigger>
                <TabsTrigger value='lifecycle'>{t('detail.tabs.lifecycle')}</TabsTrigger>
              </TabsList>
              <TabsContent value='info'>
                <Card><CardContent className='grid gap-2 pt-6 text-sm sm:grid-cols-2'>
                  <div><span className='text-muted-foreground'>{t('detail.hk')}: </span><bdi dir='ltr' className='font-mono text-xs'>{c.hk}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('form.contract')}: </span><bdi dir='ltr' className='font-mono text-xs break-all'>{c.info.contract || '—'}</bdi></div>
                  <div><span className='text-muted-foreground'>{t('detail.createdAt')}: </span><DateTime value={c.created_at} /></div>
                  <div><span className='text-muted-foreground'>{t('cols.updated')}: </span><DateTime value={c.updated_at} /></div>
                  <div><AuditLink targetType='currency' targetId={c.hk} /></div>
                  {!!c.previous_symbols?.length && <div><span className='text-muted-foreground'>{t('detail.previousSymbols')}: </span><bdi dir='ltr'>{c.previous_symbols.join(', ')}</bdi></div>}
                </CardContent></Card>
              </TabsContent>
              <TabsContent value='networks'><NetworksTab currency={c} /></TabsContent>
              <TabsContent value='lifecycle'><LifecycleTab currency={c} /></TabsContent>
            </Tabs>
          </div>
        )}
      </Main>
      {editing && c && <CurrencyFormDialog open currency={c} onClose={() => setEditing(false)} />}
      {c && (
        <ConfirmDialog
          open={deleting} onOpenChange={setDeleting} destructive isLoading={del.isPending}
          title={t('detail.deleteTitle', { symbol: c.info.symbol })} desc={t('detail.deleteBody')}
          confirmText={t('detail.delete')} cancelBtnText={t('common:cancel')} handleConfirm={() => del.mutate()}
        />
      )}
    </>
  )
}
