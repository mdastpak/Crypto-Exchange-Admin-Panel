import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { Currency, CurrencyNetwork } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { DataTable, type Column } from '@/components/data-table'
import { Field } from '@/components/field'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NETWORKS = ['bitcoin', 'ethereum', 'tron', 'internal']

export function NetworksTab({ currency }: { currency: Currency }) {
  const { t } = useTranslation('currencies')
  const canManage = useCan('currencies', 'manage')
  const [editing, setEditing] = useState<CurrencyNetwork | 'new' | null>(null)
  const q = useQuery({ queryKey: ['admin', 'currencies', currency.hk, 'networks'], queryFn: () => api.get<CurrencyNetwork[]>(`/admin/currencies/${currency.hk}/networks`) })
  const columns: Column<CurrencyNetwork>[] = [
    { key: 'n', header: t('networks.network'), cell: (n) => <bdi dir='ltr' className='font-mono'>{n.network}</bdi> },
    { key: 'c', header: t('networks.contract'), cell: (n) => <bdi dir='ltr' className='font-mono text-xs break-all'>{n.contract_address ?? '—'}</bdi> },
    { key: 'd', header: t('networks.decimals'), cell: (n) => <span className='tabular-nums'>{n.decimals}</span> },
    { key: 'dep', header: t('networks.deposit'), cell: (n) => <StatusPill tone={n.deposit_enabled ? 'ok' : 'neutral'}>{t(n.deposit_enabled ? 'networks.open' : 'networks.closed')}</StatusPill> },
    { key: 'wd', header: t('networks.withdrawal'), cell: (n) => <StatusPill tone={n.withdrawal_enabled ? 'ok' : 'neutral'}>{t(n.withdrawal_enabled ? 'networks.open' : 'networks.closed')}</StatusPill> },
    { key: 'min', header: t('networks.minWithdrawal'), cell: (n) => <bdi dir='ltr'>{n.min_withdrawal}</bdi> },
    { key: 'fee', header: t('networks.fee'), cell: (n) => <bdi dir='ltr'>{n.withdrawal_fee}</bdi> },
    { key: 'act', header: '', cell: (n) => canManage && <Button size='sm' variant='outline' onClick={() => setEditing(n)}>{t('common:edit')}</Button> },
  ]
  return (
    <div className='grid gap-3'>
      <div className='flex items-center justify-between gap-3'>
        <p className='max-w-2xl text-sm text-muted-foreground'>{t('networks.fixedNote')}</p>
        {canManage && <Button onClick={() => setEditing('new')}>{t('networks.add')}</Button>}
      </div>
      <DataTable columns={columns} rows={q.data ?? []} rowKey={(n) => n.network} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} empty={t('networks.empty')} />
      {editing && <NetworkDialog currency={currency} network={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function NetworkDialog({ currency, network, onClose }: { currency: Currency; network?: CurrencyNetwork; onClose: () => void }) {
  const { t } = useTranslation('currencies')
  const qc = useQueryClient()
  const [name, setName] = useState(network?.network ?? (currency.info.if_fiat ? 'internal' : 'ethereum'))
  const [f, setF] = useState({
    contract_address: network?.contract_address ?? '', decimals: String(network?.decimals ?? 18),
    deposit_enabled: network?.deposit_enabled ?? true, withdrawal_enabled: network?.withdrawal_enabled ?? true,
    min_deposit: network?.min_deposit ?? '0', min_withdrawal: network?.min_withdrawal ?? '0', max_withdrawal: network?.max_withdrawal ?? '0',
    withdrawal_fee: network?.withdrawal_fee ?? '0', fee_currency: network?.fee_currency ?? '', requires_tag: network?.requires_tag ?? false,
    explorer_url: network?.explorer_url ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const fixed = !!network // contract and decimals never change once the network exists

  const save = useMutation({
    // The backend writes the whole row: a field left out becomes empty, false, or 0.
    mutationFn: () => api.put(`/admin/currencies/${currency.hk}/networks/${name}`, {
      ...f, decimals: Number(f.decimals), contract_address: f.contract_address.trim() || undefined,
      custody_mode: name === 'internal' ? 'OFF_CHAIN' : 'ON_CHAIN',
    }),
    onSuccess: () => {
      toast.success(t('networks.saved'))
      void qc.invalidateQueries({ queryKey: ['admin', 'currencies', currency.hk, 'networks'] })
      onClose()
    },
    onError: (e) => {
      const fe = fieldErrors(e)
      if (Object.keys(fe).length) setErrors(fe)
      else toast.error(describeError(t, e))
    },
  })
  const text = (k: keyof typeof f, label: string, opts: { dir?: 'ltr'; disabled?: boolean } = {}) => (
    <Field id={`n-${k}`} label={label} error={errors[k]}>
      <Input id={`n-${k}`} dir={opts.dir ?? 'ltr'} disabled={opts.disabled} value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{network ? t('networks.editTitle', { network: name }) : t('networks.newTitle')}</DialogTitle></DialogHeader>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field id='n-network' label={t('networks.network')} error={errors.network}>
              <Select value={name} onValueChange={setName} disabled={!!network}>
                <SelectTrigger id='n-network'><SelectValue /></SelectTrigger>
                <SelectContent>{NETWORKS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {text('decimals', t('networks.decimals'), { disabled: fixed })}
            <div className='sm:col-span-2'>{text('contract_address', t('networks.contract'), { disabled: fixed })}</div>
            {text('min_deposit', t('networks.minDeposit'))}
            {text('min_withdrawal', t('networks.minWithdrawal'))}
            {text('max_withdrawal', t('networks.maxWithdrawal'))}
            {text('withdrawal_fee', t('networks.fee'))}
            {text('fee_currency', t('networks.feeCurrency'))}
            {text('explorer_url', t('networks.explorer'))}
          </div>
          <div className='flex flex-wrap gap-6'>
            {([['deposit_enabled', 'networks.deposit'], ['withdrawal_enabled', 'networks.withdrawal'], ['requires_tag', 'networks.requiresTag']] as const).map(([k, label]) => (
              <div key={k} className='flex items-center gap-2'><Checkbox id={`n-${k}`} checked={f[k]} onCheckedChange={(v) => set(k, v === true)} /><Label htmlFor={`n-${k}`}>{t(label)}</Label></div>
            ))}
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
