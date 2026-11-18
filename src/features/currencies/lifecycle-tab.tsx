import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { CAPABILITIES, DELISTING_STATES, type Capability, type Currency, type Delisting, type DelistingStepState, type Migration } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { fromLocalInput } from '@/lib/format'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ReasonDialog } from '@/components/reason-dialog'
import { lifecycleTone } from './status'

export function LifecycleTab({ currency }: { currency: Currency }) {
  const { t } = useTranslation('currencies')
  const canManage = useCan('currencies', 'manage')
  const lc = currency.lifecycle
  return (
    <div className='grid gap-4'>
      <Card>
        <CardHeader><CardTitle className='text-base'>{t('lifecycleTab.state')}</CardTitle></CardHeader>
        <CardContent className='flex flex-wrap items-center gap-3 text-sm'>
          <StatusPill tone={lifecycleTone(lc?.state)}>{t(`lifecycle.${lc?.state ?? 'active'}`)}</StatusPill>
          {lc?.next && <span>{t('lifecycleTab.next')}: {t(`lifecycle.${lc.next.state}`, { defaultValue: lc.next.state })} · <DateTime value={lc.next.at} /></span>}
        </CardContent>
      </Card>
      <Capabilities currency={currency} canManage={canManage} />
      <Delistings currency={currency} canManage={canManage} />
      <Migrations currency={currency} />
    </div>
  )
}

function Capabilities({ currency, canManage }: { currency: Currency; canManage: boolean }) {
  const { t } = useTranslation('currencies')
  const qc = useQueryClient()
  const [asking, setAsking] = useState<{ cap: Capability; allowed: boolean } | null>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'currencies'] })
  const put = useMutation({
    mutationFn: ({ cap, allowed, note }: { cap: Capability; allowed: boolean; note: string }) => api.put(`/admin/currencies/${currency.hk}/capabilities/${cap}`, { allowed, note }),
    onSuccess: () => { toast.success(t('lifecycleTab.capSaved')); setAsking(null); refresh() },
    onError: (e) => { setAsking(null); toast.error(describeError(t, e)) },
  })
  const clear = useMutation({
    mutationFn: (cap: Capability) => api.del(`/admin/currencies/${currency.hk}/capabilities/${cap}`),
    onSuccess: () => { toast.success(t('lifecycleTab.capSaved')); refresh() },
    onError: (e) => toast.error(describeError(t, e)),
  })
  return (
    <Card>
      <CardHeader><CardTitle className='text-base'>{t('lifecycleTab.capabilities')}</CardTitle></CardHeader>
      <CardContent className='grid gap-2'>
        {CAPABILITIES.map((cap) => {
          const effective = currency.lifecycle?.capabilities?.[cap]
          return (
            <div key={cap} className='flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0'>
              <span>{t(`caps.${cap}`)}</span>
              <div className='flex items-center gap-2'>
                {effective === undefined ? <StatusPill>—</StatusPill> : <StatusPill tone={effective ? 'ok' : 'bad'}>{effective ? t('lifecycleTab.allow') : t('lifecycleTab.deny')}</StatusPill>}
                {canManage && (
                  <>
                    <Button size='sm' variant='outline' onClick={() => setAsking({ cap, allowed: effective === undefined ? false : !effective })}>{effective === false ? t('lifecycleTab.allow') : t('lifecycleTab.deny')}</Button>
                    <Button size='sm' variant='ghost' onClick={() => clear.mutate(cap)}>{t('lifecycleTab.clear')}</Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
      {asking && (
        <ReasonDialog
          open title={`${t(`caps.${asking.cap}`)}: ${asking.allowed ? t('lifecycleTab.allow') : t('lifecycleTab.deny')}`}
          confirmLabel={t('common:confirm')} busy={put.isPending} onCancel={() => setAsking(null)}
          onConfirm={(note) => put.mutate({ cap: asking.cap, allowed: asking.allowed, note })}
        />
      )}
    </Card>
  )
}

function Delistings({ currency, canManage }: { currency: Currency; canManage: boolean }) {
  const { t } = useTranslation('currencies')
  const qc = useQueryClient()
  const [scheduling, setScheduling] = useState(false)
  const [cancelling, setCancelling] = useState<Delisting | null>(null)
  const q = useQuery({ queryKey: ['admin', 'currencies', currency.hk, 'delistings'], queryFn: () => api.get<{ items: Delisting[] }>(`/admin/currencies/${currency.hk}/delistings`) })
  const cancel = useMutation({
    mutationFn: (d: Delisting) => api.post(`/admin/currencies/${currency.hk}/delistings/${d.id}/cancel`, { version: d.version }),
    onSuccess: () => { toast.success(t('delisting.cancelled')); setCancelling(null); void qc.invalidateQueries({ queryKey: ['admin', 'currencies'] }) },
    onError: (e) => { setCancelling(null); toast.error(describeError(t, e)) },
  })
  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle className='text-base'>{t('lifecycleTab.delistings')}</CardTitle>
        {canManage && currency.status === 'approved' && <Button size='sm' onClick={() => setScheduling(true)}>{t('lifecycleTab.schedule')}</Button>}
      </CardHeader>
      <CardContent className='grid gap-3'>
        {q.data?.items.length === 0 && <p className='text-sm text-muted-foreground'>{t('lifecycleTab.noDelistings')}</p>}
        {q.data?.items.map((d) => (
          <div key={d.id} className='rounded-md border p-3 text-sm'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <StatusPill tone={d.status === 'scheduled' ? 'warn' : d.status === 'completed' ? 'ok' : 'neutral'}>{t(`delisting.status.${d.status}`)}</StatusPill>
              <span>{t(`delisting.${d.kind}`)}</span>
              <span className='text-muted-foreground'>· {t(`delisting.${d.settlement}`)}</span>
              {canManage && d.status === 'scheduled' && <Button size='sm' variant='outline' className='ms-auto' onClick={() => setCancelling(d)}>{t('lifecycleTab.cancel')}</Button>}
            </div>
            <ol className='grid gap-1'>
              {d.steps.map((s) => (
                <li key={s.state} className='flex flex-wrap items-center gap-2'>
                  <StatusPill tone={s.applied_at ? 'ok' : 'neutral'}>{s.applied_at ? t('lifecycleTab.applied') : t('lifecycleTab.pendingStep')}</StatusPill>
                  <span>{t(`lifecycle.${s.state}`)}</span><DateTime value={s.at} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </CardContent>
      {scheduling && <DelistingDialog currency={currency} onClose={() => setScheduling(false)} />}
      {cancelling && (
        <Dialog open onOpenChange={(o) => !o && setCancelling(null)}>
          <DialogContent className='sm:max-w-sm'>
            <DialogHeader className='text-start'><DialogTitle>{t('delisting.cancelTitle')}</DialogTitle></DialogHeader>
            <p className='text-sm text-muted-foreground'>{t('delisting.cancelBody')}</p>
            <DialogFooter className='gap-2'>
              <Button variant='outline' onClick={() => setCancelling(null)}>{t('common:cancel')}</Button>
              <Button variant='destructive' disabled={cancel.isPending} onClick={() => cancel.mutate(cancelling)}>{t('lifecycleTab.cancel')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

function DelistingDialog({ currency, onClose }: { currency: Currency; onClose: () => void }) {
  const { t } = useTranslation('currencies')
  const qc = useQueryClient()
  const [kind, setKind] = useState<'standard' | 'emergency'>('standard')
  const [steps, setSteps] = useState<{ state: DelistingStepState; at: string }[]>([{ state: 'delist_announced', at: '' }, { state: 'frozen', at: '' }, { state: 'delisted', at: '' }])
  const [settlement, setSettlement] = useState<'convert' | 'claim'>('claim')
  const [settleCur, setSettleCur] = useState('')
  const [claimDays, setClaimDays] = useState('30')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api.post(`/admin/currencies/${currency.hk}/delistings`, {
      kind, steps: steps.map((s) => ({ state: s.state, at: fromLocalInput(s.at) ?? '' })), settlement,
      ...(settlement === 'convert' ? { settlement_currency_hk: settleCur, price_source: 'twap' } : { claim_days: Number(claimDays) }),
    }),
    onSuccess: () => { toast.success(t('delisting.scheduled')); void qc.invalidateQueries({ queryKey: ['admin', 'currencies'] }); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  const setStep = (i: number, patch: Partial<{ state: DelistingStepState; at: string }>) => setSteps((p) => p.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{t('delisting.title')}</DialogTitle></DialogHeader>
          <Field id='d-kind' label={t('delisting.kind')}>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id='d-kind'><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value='standard'>{t('delisting.standard')}</SelectItem><SelectItem value='emergency'>{t('delisting.emergency')}</SelectItem></SelectContent>
            </Select>
          </Field>
          <fieldset className='grid gap-2'>
            <legend className='mb-1 text-sm font-medium'>{t('delisting.steps')}</legend>
            {steps.map((s, i) => (
              <div key={i} className='grid grid-cols-[1fr_1fr_auto] items-start gap-2'>
                <Select value={s.state} onValueChange={(v) => setStep(i, { state: v as DelistingStepState })}>
                  <SelectTrigger aria-label={t('delisting.state')}><SelectValue /></SelectTrigger>
                  <SelectContent>{DELISTING_STATES.map((x) => <SelectItem key={x} value={x}>{t(`lifecycle.${x}`)}</SelectItem>)}</SelectContent>
                </Select>
                <div>
                  <Input type='datetime-local' dir='ltr' aria-label={t('delisting.at')} value={s.at} onChange={(e) => setStep(i, { at: e.target.value })} />
                  {errors[`steps[${i}].at`] && <p role='alert' className='text-xs text-destructive'>{errors[`steps[${i}].at`]}</p>}
                </div>
                <Button type='button' variant='ghost' size='sm' onClick={() => setSteps((p) => p.filter((_, j) => j !== i))} aria-label={t('common:delete')}>×</Button>
              </div>
            ))}
            {errors.steps && <p role='alert' className='text-xs text-destructive'>{errors.steps}</p>}
            <Button type='button' variant='outline' size='sm' className='w-fit' onClick={() => setSteps((p) => [...p, { state: 'delisted', at: '' }])}>{t('delisting.addStep')}</Button>
          </fieldset>
          <Field id='d-settle' label={t('delisting.settlement')}>
            <Select value={settlement} onValueChange={(v) => setSettlement(v as typeof settlement)}>
              <SelectTrigger id='d-settle'><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value='claim'>{t('delisting.claim')}</SelectItem><SelectItem value='convert'>{t('delisting.convert')}</SelectItem></SelectContent>
            </Select>
          </Field>
          {settlement === 'claim'
            ? <Field id='d-days' label={t('delisting.claimDays')} error={errors.claim_days}><Input id='d-days' dir='ltr' inputMode='numeric' value={claimDays} onChange={(e) => setClaimDays(e.target.value)} /></Field>
            : <Field id='d-cur' label={t('delisting.settlementCurrency')} error={errors.settlement_currency_hk}><Input id='d-cur' dir='ltr' value={settleCur} onChange={(e) => setSettleCur(e.target.value)} placeholder='hk' /></Field>}
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' disabled={save.isPending}>{t('common:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Migrations({ currency }: { currency: Currency }) {
  const { t } = useTranslation('currencies')
  const q = useQuery({ queryKey: ['admin', 'currencies', currency.hk, 'migrations'], queryFn: () => api.get<{ items: Migration[] }>(`/admin/currencies/${currency.hk}/migrations`) })
  return (
    <Card>
      <CardHeader><CardTitle className='text-base'>{t('lifecycleTab.migrations')}</CardTitle></CardHeader>
      <CardContent className='grid gap-2 text-sm'>
        {q.data?.items.length === 0 && <p className='text-muted-foreground'>{t('lifecycleTab.noMigrations')}</p>}
        {q.data?.items.map((m) => <div key={m.id} className='flex flex-wrap items-center gap-2'><StatusPill>{m.phase}</StatusPill><bdi dir='ltr' className='font-mono text-xs'>{m.id}</bdi></div>)}
        <p className='text-xs text-muted-foreground'>{t('lifecycleTab.migrationLater')}</p>
      </CardContent>
    </Card>
  )
}
