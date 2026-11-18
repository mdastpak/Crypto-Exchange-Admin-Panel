import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { Currency, CurrencyStatus } from '@/api/models'
import { ApiError } from '@/api/types'
import { conflictVersion, describeError, fieldErrors } from '@/lib/errors'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  open: boolean
  /** Present: edit with the version that was read. Absent: create. */
  currency?: Currency
  onClose: () => void
  onDone?: () => void
}

export function CurrencyFormDialog({ open, currency, onClose, onDone }: Props) {
  const { t } = useTranslation('currencies')
  const qc = useQueryClient()
  const editing = !!currency
  const [f, setF] = useState(() => ({
    en_name: currency?.info.en_name ?? '', fa_name: currency?.info.fa_name ?? '', symbol: currency?.info.symbol ?? '',
    is_token: currency?.info.is_token ?? false, if_fiat: currency?.info.if_fiat ?? false,
    contract: currency?.info.contract ?? '', logo_url: currency?.info.logo_url ?? '', status: 'pending' as CurrencyStatus,
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<number | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  const save = useMutation({
    mutationFn: () => {
      const info = {
        en_name: f.en_name.trim(), fa_name: f.fa_name.trim(), symbol: f.symbol.trim(),
        is_token: f.is_token, if_fiat: f.if_fiat, contract: f.contract.trim() || undefined, logo_url: f.logo_url.trim() || undefined,
      }
      return editing
        ? api.put(`/admin/currencies/${currency!.hk}`, { info, version: currency!.version })
        : api.post('/admin/currencies', { status: f.status, info })
    },
    onSuccess: () => {
      toast.success(editing ? t('common:saved') : t('form.created'))
      void qc.invalidateQueries({ queryKey: ['admin', 'currencies'] })
      onDone?.()
      onClose()
    },
    onError: (e) => {
      const fields = fieldErrors(e)
      const v = conflictVersion(e)
      setConflict(v)
      if (e instanceof ApiError && ['duplicate_symbol', 'duplicate_contract', 'symbol_reserved'].includes(e.code)) {
        const field = (e.info as { field?: string } | undefined)?.field ?? 'info.symbol'
        setErrors({ [field]: describeError(t, e) })
      } else if (Object.keys(fields).length) {
        setErrors(fields)
      } else if (v === null) {
        toast.error(describeError(t, e))
      }
    },
  })

  const err = (k: string) => errors[`info.${k}`]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); setConflict(null); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{editing ? t('form.editTitle') : t('form.createTitle')}</DialogTitle></DialogHeader>
          {conflict !== null && (
            <p role='alert' className='rounded-md bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200'>
              {t('form.conflict', { version: conflict })}{' '}
              <button type='button' className='underline' onClick={() => { void qc.invalidateQueries({ queryKey: ['admin', 'currencies'] }); onClose() }}>{t('common:reloadLatest')}</button>
            </p>
          )}
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field id='c-en' label={t('form.enName')} error={err('en_name')}><Input id='c-en' dir='ltr' value={f.en_name} onChange={(e) => set('en_name', e.target.value)} maxLength={100} /></Field>
            <Field id='c-fa' label={t('form.faName')} error={err('fa_name')}><Input id='c-fa' value={f.fa_name} onChange={(e) => set('fa_name', e.target.value)} maxLength={100} /></Field>
            <Field id='c-sym' label={t('form.symbol')} error={err('symbol')}><Input id='c-sym' dir='ltr' value={f.symbol} onChange={(e) => set('symbol', e.target.value)} maxLength={15} /></Field>
            {!editing && (
              <Field id='c-status' label={t('form.status')}>
                <Select value={f.status} onValueChange={(v) => set('status', v as CurrencyStatus)}>
                  <SelectTrigger id='c-status'><SelectValue /></SelectTrigger>
                  <SelectContent>{(['pending', 'approved', 'suspend'] as const).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <div className='flex flex-wrap gap-6'>
            <div className='flex items-center gap-2'><Checkbox id='c-token' checked={f.is_token} onCheckedChange={(v) => set('is_token', v === true)} /><Label htmlFor='c-token'>{t('form.isToken')}</Label></div>
            <div className='flex items-center gap-2'><Checkbox id='c-fiat' checked={f.if_fiat} onCheckedChange={(v) => set('if_fiat', v === true)} /><Label htmlFor='c-fiat'>{t('form.isFiat')}</Label></div>
          </div>
          {err('is_token') && <p role='alert' className='text-xs text-destructive'>{err('is_token')}</p>}
          <Field id='c-contract' label={t('form.contract')} error={err('contract')}><Input id='c-contract' dir='ltr' value={f.contract} onChange={(e) => set('contract', e.target.value)} disabled={!f.is_token} /></Field>
          <Field id='c-logo' label={t('form.logo')} error={err('logo_url')}><Input id='c-logo' dir='ltr' value={f.logo_url} onChange={(e) => set('logo_url', e.target.value)} /></Field>
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' disabled={save.isPending}>{t('common:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
