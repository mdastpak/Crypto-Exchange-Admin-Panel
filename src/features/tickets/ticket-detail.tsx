import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { Ticket, TicketPriority, TicketStatus } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError } from '@/lib/errors'
import { DateTime } from '@/components/date-time'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { UserLookupPanel } from '../users/lookup-panel'
import { priorityTone, slaTone, statusTone } from './tones'

export function TicketDetail({ id }: { id: string }) {
  const { t } = useTranslation('tickets')
  const qc = useQueryClient()
  const canEdit = useCan('tickets', 'edit')
  const canLookup = useCan('users', 'lookup')
  const canUser = useCan('users', 'view')
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const q = useQuery({ queryKey: ['admin', 'tickets', id], queryFn: () => api.get<Ticket>(`/admin/tickets/${id}`), refetchInterval: 20_000 })
  const done = (msg: string) => { toast.success(msg); void qc.invalidateQueries({ queryKey: ['admin', 'tickets'] }) }
  const fail = (e: unknown) => { toast.error(describeError(t, e)); void qc.invalidateQueries({ queryKey: ['admin', 'tickets'] }) }
  const claim = useMutation({ mutationFn: () => api.post(`/admin/tickets/${id}/claim`), onSuccess: () => done(t('claimed')), onError: fail })
  const send = useMutation({ mutationFn: () => api.post(`/admin/tickets/${id}/messages`, { body: body.trim(), internal }), onSuccess: () => { setBody(''); done(t('sent')) }, onError: fail })
  const status = useMutation({ mutationFn: (s: TicketStatus) => api.post(`/admin/tickets/${id}/status`, { status: s }), onSuccess: () => done(t('updated')), onError: fail })
  const priority = useMutation({ mutationFn: (p: TicketPriority) => api.put(`/admin/tickets/${id}/priority`, { priority: p }), onSuccess: () => done(t('updated')), onError: fail })
  const tk = q.data
  return (
    <>
      <PageHeader title={tk ? tk.id : t('title')} />
      <Main>
        <div className='mb-3'><Link to='/tickets' className='text-sm text-muted-foreground underline-offset-4 hover:underline'>← {t('back')}</Link></div>
        {q.isPending && <Skeleton className='h-48 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        {tk && (
          <div className='grid items-start gap-4 lg:grid-cols-[1fr_22rem]'>
            <div className='grid content-start gap-4'>
              <Card><CardContent className='grid gap-3 pt-6'>
                <h2 className='text-lg font-semibold'>{tk.subject}</h2>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusPill tone={statusTone(tk.status)}>{t(`status.${tk.status}`)}</StatusPill>
                  <StatusPill tone={priorityTone(tk.priority)}>{t(`priority.${tk.priority}`)}</StatusPill>
                  <StatusPill tone={slaTone(tk.sla_state)}>{t(`sla.${tk.sla_state}`)}</StatusPill>
                  <bdi dir='ltr' className='text-xs text-muted-foreground'>{tk.assignee ?? t('unassigned')}</bdi>
                  {canEdit && !tk.assignee && <Button size='sm' onClick={() => claim.mutate()} disabled={claim.isPending}>{t('claim')}</Button>}
                  {canUser && <Link to='/users/$hk' params={{ hk: tk.user_hk }} className='ms-auto text-sm underline-offset-4 hover:underline'>{t('viewUser')}</Link>}
                </div>
                {canEdit && (
                  <div className='flex flex-wrap gap-3'>
                    <Select value={tk.status} onValueChange={(v) => status.mutate(v as TicketStatus)}>
                      <SelectTrigger className='w-44' aria-label={t('changeStatus')}><SelectValue /></SelectTrigger>
                      <SelectContent>{(['open', 'pending_user', 'pending_internal', 'solved', 'closed'] as const).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={tk.priority} onValueChange={(v) => priority.mutate(v as TicketPriority)}>
                      <SelectTrigger className='w-36' aria-label={t('changePriority')}><SelectValue /></SelectTrigger>
                      <SelectContent>{(['low', 'normal', 'high', 'urgent'] as const).map((s) => <SelectItem key={s} value={s}>{t(`priority.${s}`)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent></Card>
              {/* Message text is plain text: React escapes it, and nothing renders HTML. */}
              <ol className='grid gap-3'>
                {tk.messages?.map((m) => (
                  <li key={m.id} className={`rounded-md border p-3 text-sm ${m.internal ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : m.author_type === 'agent' ? 'bg-muted/40' : ''}`}>
                    <div className='mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                      <span>{m.author_type === 'user' ? t('user') : t('agent')}</span>{m.author_type === 'agent' && <bdi dir='ltr'>{m.author}</bdi>}
                      {m.internal && <StatusPill tone='warn'>{t('internalTag')}</StatusPill>}<span className='ms-auto'><DateTime value={m.created_at} /></span>
                    </div>
                    <p className='whitespace-pre-wrap'>{m.body}</p>
                  </li>
                ))}
              </ol>
              <p className='text-xs text-muted-foreground'>{t('plainText')}</p>
              {canEdit && (
                <form className='grid gap-2' onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate() }}>
                  <Label htmlFor='reply'>{t('reply')}</Label>
                  <textarea id='reply' rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} className='rounded-md border bg-transparent p-2 text-sm' />
                  <div className='flex flex-wrap items-center gap-3'>
                    <div className='flex items-center gap-2'><Checkbox id='internal' checked={internal} onCheckedChange={(v) => setInternal(v === true)} /><Label htmlFor='internal'>{t('internal')}</Label></div>
                    <Button type='submit' className='ms-auto' disabled={send.isPending || !body.trim()}>{t('send')}</Button>
                  </div>
                </form>
              )}
            </div>
            {canLookup && <aside aria-label={t('related')}><h2 className='mb-2 text-sm font-semibold'>{t('related')}</h2><UserLookupPanel hk={tk.user_hk} /></aside>}
          </div>
        )}
      </Main>
    </>
  )
}
