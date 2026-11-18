import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { MARKET_STATUSES, type Market, type MarketStatus } from '@/api/models'
import { describeError, fieldErrors } from '@/lib/errors'
import { bpsToPercent } from '@/lib/format'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** The backend writes a market whole, so every field is sent; the form never leaves one out. */
export function MarketFormDialog({ market, onClose }: { market?: Market; onClose: () => void }) {
  const { t } = useTranslation('markets')
  const qc = useQueryClient()
  const [base, setBase] = useState(market?.base_symbol ?? '')
  const [quote, setQuote] = useState(market?.quote_symbol ?? '')
  const [f, setF] = useState({
    status: (market?.status ?? 'INACTIVE') as MarketStatus,
    min_order_size: market?.min_order_size ?? '0.0001', max_order_size: market?.max_order_size ?? '0',
    min_notional: market?.min_notional ?? '10', tick_size: market?.tick_size ?? '0.01', lot_size: market?.lot_size ?? '0.0001',
    maker_fee_bps: String(market?.maker_fee_bps ?? 10), taker_fee_bps: String(market?.taker_fee_bps ?? 20),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const save = useMutation({
    mutationFn: () => api.put(`/admin/markets/${base.trim().toUpperCase()}/${quote.trim().toUpperCase()}`, {
      ...f, maker_fee_bps: Number(f.maker_fee_bps), taker_fee_bps: Number(f.taker_fee_bps),
    }),
    onSuccess: () => { toast.success(t('form.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'markets'] }); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  const num = (k: 'min_order_size' | 'max_order_size' | 'min_notional' | 'tick_size' | 'lot_size' | 'maker_fee_bps' | 'taker_fee_bps', label: string, hint?: string) => (
    <Field id={`m-${k}`} label={label} error={errors[k]} hint={hint}>
      <Input id={`m-${k}`} dir='ltr' inputMode='decimal' value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'>
            <DialogTitle>{market ? t('form.editTitle', { market: `${base}/${quote}` }) : t('form.createTitle')}</DialogTitle>
          </DialogHeader>
          <p className='text-xs text-muted-foreground'>{t('form.wholeNote')}</p>
          <div className='grid gap-4 sm:grid-cols-3'>
            <Field id='m-base' label={t('form.base')} error={errors.base}><Input id='m-base' dir='ltr' disabled={!!market} value={base} onChange={(e) => setBase(e.target.value)} /></Field>
            <Field id='m-quote' label={t('form.quote')} error={errors.quote}><Input id='m-quote' dir='ltr' disabled={!!market} value={quote} onChange={(e) => setQuote(e.target.value)} /></Field>
            <Field id='m-status' label={t('form.status')} error={errors.status}>
              <Select value={f.status} onValueChange={(v) => set('status', v as MarketStatus)}>
                <SelectTrigger id='m-status'><SelectValue /></SelectTrigger>
                <SelectContent>{MARKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {num('min_order_size', t('form.minOrder'))}
            {num('max_order_size', t('form.maxOrder'))}
            {num('min_notional', t('form.minNotional'))}
            {num('tick_size', t('form.tick'))}
            {num('lot_size', t('form.lot'))}
            <span />
            {num('maker_fee_bps', t('form.maker'), `${t('form.feeHint')} ${bpsToPercent(Number(f.maker_fee_bps) || 0)}`)}
            {num('taker_fee_bps', t('form.taker'), bpsToPercent(Number(f.taker_fee_bps) || 0))}
          </div>
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' disabled={save.isPending}>{t('common:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
