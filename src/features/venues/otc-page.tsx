import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { RouteExplanation, RoutingRule, RoutingRulesView } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export function OtcPage() {
  const { t } = useTranslation('venues')
  const q = useQuery({ queryKey: ['admin', 'otc', 'rules'], queryFn: () => api.get<RoutingRulesView>('/admin/otc/routing/rules') })
  return (
    <>
      <PageHeader title={t('otc.title')} />
      <Main>
        {q.isPending && <Skeleton className='h-40 w-full' />}
        {q.isError && <p role='alert' className='text-destructive'>{describeError(t, q.error)}</p>}
        {q.data && (
          <div className='grid gap-4 lg:grid-cols-2'>
            <RulesEditor view={q.data} />
            <Explain />
          </div>
        )}
      </Main>
    </>
  )
}

function RulesEditor({ view }: { view: RoutingRulesView }) {
  const { t } = useTranslation('venues')
  const qc = useQueryClient()
  const canEdit = useCan('otc', 'edit')
  const current = JSON.stringify(view.version?.rules ?? [], null, 2)
  const [text, setText] = useState(current)
  const [reason, setReason] = useState('')
  const [parseError, setParseError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: (rules: RoutingRule[]) => api.put('/admin/otc/routing/rules', { rules, reason: reason.trim() }),
    onSuccess: () => { toast.success(t('otc.saved')); setReason(''); setErrors({}); void qc.invalidateQueries({ queryKey: ['admin', 'otc'] }) },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({}); setParseError('')
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('not a list')
      save.mutate(parsed as RoutingRule[])
    } catch {
      setParseError(t('otc.invalidJson'))
    }
  }
  const v = view.version
  return (
    <Card>
      <CardHeader className='flex-row flex-wrap items-center gap-2'>
        <CardTitle className='text-base'>{t('otc.rules')}</CardTitle>
        <StatusPill tone={view.enabled ? 'ok' : 'neutral'}>{view.enabled ? t('otc.enabled') : '—'}</StatusPill>
        {v && <StatusPill>{t('otc.version', { n: v.version })}</StatusPill>}
        <span className='text-xs text-muted-foreground'>{t('otc.cache', { s: view.cache_seconds })}</span>
      </CardHeader>
      <CardContent>
        {v && <p className='mb-2 text-xs text-muted-foreground'>{t('otc.by', { who: v.created_by })} · <DateTime value={v.created_at} /> · {v.reason}</p>}
        {!v && <p className='mb-2 text-sm text-muted-foreground'>{t('otc.noRules')}</p>}
        <form className='grid gap-3' onSubmit={submit} noValidate>
          <Field id='otc-rules' label={t('otc.rules')} hint={t('otc.rulesHint')} error={parseError || errors.rules}>
            <textarea id='otc-rules' dir='ltr' rows={16} spellCheck={false} readOnly={!canEdit} value={text} onChange={(e) => setText(e.target.value)} className='rounded-md border bg-transparent p-2 font-mono text-xs' />
          </Field>
          {Object.entries(errors).filter(([k]) => k.startsWith('rules[')).map(([k, m]) => <p key={k} role='alert' className='text-xs text-destructive' dir='ltr'>{k}: {m}</p>)}
          {canEdit && (
            <>
              <Field id='otc-reason' label={t('otc.reason')} error={errors.reason}><Input id='otc-reason' maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <div className='flex gap-2'>
                <Button type='submit' disabled={save.isPending || !reason.trim()}>{t('otc.save')}</Button>
                <Button type='button' variant='outline' onClick={() => { setText(current); setErrors({}); setParseError('') }}>{t('otc.reset')}</Button>
              </div>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function Explain() {
  const { t } = useTranslation('venues')
  const [f, setF] = useState({ market: 'BTC/USDT', side: 'buy', quantity: '0.5', price: '64000', level: '', network: '', region: '' })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const run = useMutation({
    mutationFn: () => api.post<RouteExplanation>('/admin/otc/routing/explain', { market: f.market.trim(), side: f.side, quantity: f.quantity, price: f.price, ...(f.level && { level: Number(f.level) }), ...(f.network && { network: f.network }), ...(f.region && { region: f.region }) }),
    onError: (e) => toast.error(describeError(t, e)),
  })
  const r = run.data
  return (
    <Card>
      <CardHeader><CardTitle className='text-base'>{t('otc.explain')}</CardTitle></CardHeader>
      <CardContent className='grid gap-3'>
        <form className='grid gap-3 sm:grid-cols-2' onSubmit={(e) => { e.preventDefault(); run.mutate() }}>
          <Field id='x-market' label={t('otc.market')}><Input id='x-market' dir='ltr' value={f.market} onChange={(e) => set('market', e.target.value)} /></Field>
          <Field id='x-side' label={t('otc.side')}>
            <Select value={f.side} onValueChange={(v) => set('side', v)}><SelectTrigger id='x-side'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='buy'>{t('otc.buy')}</SelectItem><SelectItem value='sell'>{t('otc.sell')}</SelectItem></SelectContent></Select>
          </Field>
          <Field id='x-qty' label={t('otc.quantity')}><Input id='x-qty' dir='ltr' inputMode='decimal' value={f.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
          <Field id='x-price' label={t('otc.price')}><Input id='x-price' dir='ltr' inputMode='decimal' value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
          <Field id='x-level' label={t('otc.level')}><Input id='x-level' dir='ltr' inputMode='numeric' value={f.level} onChange={(e) => set('level', e.target.value)} /></Field>
          <Field id='x-net' label={t('otc.network')}><Input id='x-net' dir='ltr' value={f.network} onChange={(e) => set('network', e.target.value)} /></Field>
          <div className='sm:col-span-2'><Button type='submit' disabled={run.isPending}>{t('otc.run')}</Button></div>
        </form>
        {r && (
          <div className='grid gap-2 text-sm' role='status'>
            {r.route ? (
              <div className='rounded-md border bg-emerald-50 p-3 dark:bg-emerald-950/30'>
                <div className='font-medium'>{t('otc.route')}: <bdi dir='ltr' className='font-mono'>{r.route.rule}</bdi> · {t('otc.cost')} <bdi dir='ltr'>{r.route.cost_bps} bps</bdi></div>
                <ul className='mt-1 grid gap-1'>{r.route.legs.map((l, i) => <li key={i} dir='ltr' className='font-mono text-xs'>{l.source}{l.venue ? `:${l.venue}` : ''} · {l.symbol} · {l.quantity} · {l.notional} · {l.cost_bps} bps</li>)}</ul>
              </div>
            ) : <div className='rounded-md border bg-amber-50 p-3 dark:bg-amber-950/30'>{t('otc.noRoute')}: <bdi dir='ltr'>{r.reason}</bdi></div>}
            <ul className='grid gap-1'>
              {r.rules.map((x) => (
                <li key={x.rule} className='flex flex-wrap items-center gap-2'>
                  <StatusPill tone={x.matched ? 'ok' : 'neutral'}>{x.matched ? t('otc.matched') : t('otc.skipped')}</StatusPill>
                  <bdi dir='ltr' className='font-mono text-xs'>{x.rule}</bdi>
                  {x.skipped && <span className='text-xs text-muted-foreground' dir='ltr'>{x.skipped.join(', ')}</span>}
                  {x.failure && <span className='text-xs text-destructive'>{x.failure}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
