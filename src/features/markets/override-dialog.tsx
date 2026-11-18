import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { PriceOverride } from '@/api/models'
import { deviationBps, isPositiveDecimal, lte } from '@/lib/decimal'
import { describeError, fieldErrors } from '@/lib/errors'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/** Mirrors the backend bound (300 bps by default) so the administrator knows whether a second approval will be needed. */
const MAX_DEVIATION_BPS = 300

export function OverrideDialog({ market, referenceMid, onClose }: { market: string; referenceMid?: number; onClose: () => void }) {
  const { t } = useTranslation('markets')
  const qc = useQueryClient()
  const [f, setF] = useState({ mid: '', bid: '', ask: '', expires: '900', reason: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const [base, quote] = market.split('/')

  const midOk = isPositiveDecimal(f.mid)
  const bps = midOk && referenceMid ? deviationBps(f.mid, String(referenceMid)) : null
  const needsApproval = !referenceMid || (bps !== null && bps > MAX_DEVIATION_BPS)

  const save = useMutation({
    mutationFn: () => api.post<PriceOverride>(`/admin/markets/${base}/${quote}/price-override`, {
      mid: f.mid, ...(f.bid && { bid: f.bid }), ...(f.ask && { ask: f.ask }), expires_in_seconds: Number(f.expires), reason: f.reason.trim(),
    }),
    onSuccess: (o) => {
      toast.success(o.pending ? t('override.waiting') : t('override.appliedNow'))
      void qc.invalidateQueries({ queryKey: ['admin', 'price-overrides'] })
      void qc.invalidateQueries({ queryKey: ['admin', 'markets', market] })
      onClose()
    },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const local: Record<string, string> = {}
    if (!midOk) local.mid = t('errors:codes.validation_failed')
    else {
      if (f.bid && !lte(f.bid, f.mid)) local.bid = 'bid ≤ mid ≤ ask'
      if (f.ask && !lte(f.mid, f.ask)) local.ask = 'bid ≤ mid ≤ ask'
    }
    if (!f.reason.trim()) local.reason = t('common:reasonRequired')
    setErrors(local)
    if (!Object.keys(local).length) save.mutate()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='grid gap-4' onSubmit={submit} noValidate>
          <DialogHeader className='text-start'><DialogTitle>{t('override.title', { market })}</DialogTitle></DialogHeader>
          <div className='grid gap-4 sm:grid-cols-3'>
            <Field id='o-mid' label={t('override.mid')} error={errors.mid}><Input id='o-mid' dir='ltr' inputMode='decimal' value={f.mid} onChange={(e) => set('mid', e.target.value)} autoFocus /></Field>
            <Field id='o-bid' label={t('override.bid')} error={errors.bid}><Input id='o-bid' dir='ltr' inputMode='decimal' value={f.bid} onChange={(e) => set('bid', e.target.value)} /></Field>
            <Field id='o-ask' label={t('override.ask')} error={errors.ask}><Input id='o-ask' dir='ltr' inputMode='decimal' value={f.ask} onChange={(e) => set('ask', e.target.value)} /></Field>
          </div>
          <Field id='o-exp' label={t('override.expires')} error={errors.expires_in_seconds}><Input id='o-exp' dir='ltr' inputMode='numeric' value={f.expires} onChange={(e) => set('expires', e.target.value)} /></Field>
          <Field id='o-reason' label={t('override.reason')} error={errors.reason}><Input id='o-reason' maxLength={500} value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
          {midOk && (
            <div role='status' className={`rounded-md p-2 text-sm ${needsApproval ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'}`}>
              {bps !== null && <div>{t('override.deviation', { bps })}</div>}
              <div>{!referenceMid ? t('override.noReference') : needsApproval ? t('override.needsApproval', { max: MAX_DEVIATION_BPS }) : t('override.applies')}</div>
            </div>
          )}
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' disabled={save.isPending}>{t('override.submit')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
