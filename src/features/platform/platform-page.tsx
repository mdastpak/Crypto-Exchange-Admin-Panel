import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { PLATFORM_FEATURES, type PlatformControl, type PlatformFeature, type PlatformOverview } from '@/api/models'
import { useSession } from '@/auth/session-store'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ReasonDialog } from '@/components/reason-dialog'

const TWO_PERSON: PlatformFeature[] = ['withdrawals', 'trading']

const controlState = (c: PlatformControl) => (c.lifted_at ? 'lifted' : c.lift_requested_by ? 'lift_requested' : c.active ? 'active' : 'scheduled')

export function PlatformPage() {
  const { t } = useTranslation('platform')
  const qc = useQueryClient()
  const me = useSession((s) => s.me?.email)
  const canManage = useCan('platform', 'manage')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PlatformControl | null>(null)
  const [lifting, setLifting] = useState<PlatformControl | null>(null)
  const overview = useQuery({ queryKey: ['admin', 'platform'], queryFn: () => api.get<PlatformOverview>('/admin/platform'), refetchInterval: 10_000 })
  const list = useQuery({ queryKey: ['admin', 'platform', 'controls'], queryFn: () => api.get<{ items: PlatformControl[] }>('/admin/platform/controls') })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'platform'] })

  const lift = useMutation({
    mutationFn: ({ c, note }: { c: PlatformControl; note: string }) => api.post<PlatformControl>(`/admin/platform/controls/${c.id}/lift?version=${c.version}`, { note }),
    onSuccess: (r) => { toast.success(r.lifted_at ? t('lifted') : t('liftRequested')); setLifting(null); refresh() },
    onError: (e) => { setLifting(null); toast.error(describeError(t, e)); refresh() },
  })

  const status = overview.data?.status
  const columns: Column<PlatformControl>[] = [
    { key: 'c', header: t('cols.control'), cell: (c) => <div><div>{t(`kind.${c.kind}`)}</div>{c.feature && <div className='text-xs text-muted-foreground'>{t(`feature.${c.feature}`)}</div>}</div> },
    { key: 't', header: t('cols.schedule'), cell: (c) => <div className='text-xs'><div>{t('from')} <DateTime value={c.starts_at} /></div><div>{c.ends_at ? <>{t('until')} <DateTime value={c.ends_at} /></> : t('noEnd')}</div></div> },
    { key: 'r', header: t('cols.reason'), cell: (c) => <span className='whitespace-normal'>{c.reason}</span>, className: 'max-w-xs' },
    { key: 's', header: t('cols.state'), cell: (c) => { const s = controlState(c); return <StatusPill tone={s === 'active' ? 'bad' : s === 'lift_requested' ? 'warn' : 'neutral'}>{t(`state.${s}`)}</StatusPill> } },
    { key: 'b', header: t('cols.by'), cell: (c) => <bdi dir='ltr' className='text-xs'>{c.created_by}</bdi> },
    {
      key: 'a', header: '', cell: (c) => {
        if (!canManage || c.lifted_at) return null
        const own = c.lift_requested_by === me
        return (
          <div className='flex flex-wrap items-center gap-2'>
            <Button size='sm' variant='outline' onClick={() => setEditing(c)}>{t('extend')}</Button>
            <Button size='sm' disabled={own} title={own ? t('ownRequest') : undefined} onClick={() => setLifting(c)}>{c.lift_requested_by ? t('approveLift') : t('lift')}</Button>
            {c.lift_requested_by && <span className='text-xs text-muted-foreground'>{t('requestedBy', { who: c.lift_requested_by })}</span>}
          </div>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        <div className='mb-4 grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader><CardTitle className='text-base'>{status ? t(`mode.${status.mode}`) : '…'}</CardTitle></CardHeader>
            <CardContent className='flex flex-wrap items-center gap-2 text-sm'>
              <span className='text-muted-foreground'>{t('lockdowns')}:</span>
              {status?.lockdowns.length ? status.lockdowns.map((f) => <StatusPill key={f} tone='bad'>{t(`feature.${f}`)}</StatusPill>) : <span>{t('noLockdowns')}</span>}
            </CardContent>
          </Card>
          {canManage && <div className='flex items-start justify-end'><Button variant='destructive' onClick={() => setCreating(true)}>{t('new')}</Button></div>}
        </div>
        <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(c) => c.id} loading={list.isPending} error={list.isError ? describeError(t, list.error) : undefined} />
      </Main>
      {creating && <ControlDialog onClose={() => setCreating(false)} onDone={refresh} />}
      {editing && <EditControlDialog control={editing} onClose={() => setEditing(null)} onDone={refresh} />}
      {lifting && (
        <ReasonDialog
          open title={t('liftTitle')} description={lifting.kind === 'lockdown' && lifting.feature && TWO_PERSON.includes(lifting.feature) ? t('liftBody') : undefined}
          confirmLabel={lifting.lift_requested_by ? t('approveLift') : t('lift')} busy={lift.isPending} onCancel={() => setLifting(null)}
          onConfirm={(note) => lift.mutate({ c: lifting, note })}
        />
      )}
    </>
  )
}

function ControlDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation('platform')
  const [kind, setKind] = useState<'maintenance' | 'lockdown'>('lockdown')
  const [feature, setFeature] = useState<PlatformFeature>('withdrawals')
  const [f, setF] = useState({ starts: toLocalInput(new Date().toISOString()), ends: '', reason: '', fa: '', en: '', networks: '', users: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
  const save = useMutation({
    mutationFn: () => api.post('/admin/platform/controls', {
      kind, ...(kind === 'lockdown' && { feature }), starts_at: fromLocalInput(f.starts), ...(f.ends && { ends_at: fromLocalInput(f.ends) }),
      reason: f.reason.trim(), message: { fa: f.fa, en: f.en },
      ...(kind === 'maintenance' && { allow_networks: lines(f.networks), allow_users: lines(f.users) }),
    }),
    onSuccess: () => { toast.success(t('form.created')); onDone(); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{t('form.title')}</DialogTitle>{kind === 'maintenance' && <DialogDescription>{t('form.maintenanceNote')}</DialogDescription>}</DialogHeader>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field id='p-kind' label={t('form.kind')}>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger id='p-kind'><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value='lockdown'>{t('kind.lockdown')}</SelectItem><SelectItem value='maintenance'>{t('kind.maintenance')}</SelectItem></SelectContent>
              </Select>
            </Field>
            {kind === 'lockdown' && (
              <Field id='p-feature' label={t('form.feature')} error={errors.feature}>
                <Select value={feature} onValueChange={(v) => setFeature(v as PlatformFeature)}>
                  <SelectTrigger id='p-feature'><SelectValue /></SelectTrigger>
                  <SelectContent>{PLATFORM_FEATURES.map((x) => <SelectItem key={x} value={x}>{t(`feature.${x}`)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
            <Field id='p-start' label={t('form.starts')} error={errors.starts_at}><Input id='p-start' type='datetime-local' dir='ltr' value={f.starts} onChange={(e) => set('starts', e.target.value)} /></Field>
            <Field id='p-end' label={t('form.ends')} error={errors.ends_at}><Input id='p-end' type='datetime-local' dir='ltr' value={f.ends} onChange={(e) => set('ends', e.target.value)} /></Field>
          </div>
          <Field id='p-reason' label={t('form.reason')} error={errors.reason}><Input id='p-reason' maxLength={1000} value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
          <Field id='p-fa' label={t('form.messageFa')}><Input id='p-fa' maxLength={500} value={f.fa} onChange={(e) => set('fa', e.target.value)} /></Field>
          <Field id='p-en' label={t('form.messageEn')}><Input id='p-en' dir='ltr' maxLength={500} value={f.en} onChange={(e) => set('en', e.target.value)} /></Field>
          {kind === 'maintenance' && (
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field id='p-nets' label={t('form.allowNetworks')}><textarea id='p-nets' dir='ltr' rows={3} className='rounded-md border bg-transparent p-2 text-sm' value={f.networks} onChange={(e) => set('networks', e.target.value)} /></Field>
              <Field id='p-users' label={t('form.allowUsers')}><textarea id='p-users' dir='ltr' rows={3} className='rounded-md border bg-transparent p-2 text-sm' value={f.users} onChange={(e) => set('users', e.target.value)} /></Field>
            </div>
          )}
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' variant='destructive' disabled={save.isPending}>{t('common:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditControlDialog({ control, onClose, onDone }: { control: PlatformControl; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation('platform')
  const [ends, setEnds] = useState(toLocalInput(control.ends_at))
  const [fa, setFa] = useState(control.message?.fa ?? '')
  const [en, setEn] = useState(control.message?.en ?? '')
  const save = useMutation({
    mutationFn: () => api.patch(`/admin/platform/controls/${control.id}?version=${control.version}`, { ...(ends && { ends_at: fromLocalInput(ends) }), message: { fa, en } }),
    onSuccess: () => { toast.success(t('extended')); onDone(); onClose() },
    onError: (e) => { toast.error(describeError(t, e)); onDone(); onClose() },
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{t('extendTitle')}</DialogTitle></DialogHeader>
          <Field id='e-end' label={t('form.ends')}><Input id='e-end' type='datetime-local' dir='ltr' value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
          <Field id='e-fa' label={t('form.messageFa')}><Input id='e-fa' value={fa} onChange={(e) => setFa(e.target.value)} /></Field>
          <Field id='e-en' label={t('form.messageEn')}><Input id='e-en' dir='ltr' value={en} onChange={(e) => setEn(e.target.value)} /></Field>
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' disabled={save.isPending}>{t('common:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
