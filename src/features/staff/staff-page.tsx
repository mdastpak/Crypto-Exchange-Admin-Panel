import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { AccessGroup, StaffGroupRef, StaffRow } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { useSession } from '@/auth/session-store'
import { describeError, fieldErrors } from '@/lib/errors'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { DataTable, type Column } from '@/components/data-table'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Action = { kind: 'disable' | 'enable' | 'reset-totp'; row: StaffRow }

export function StaffPage() {
  const { t } = useTranslation('staff')
  const qc = useQueryClient()
  const me = useSession((s) => s.me?.email)
  const canManage = useCan('staff', 'manage')
  const canAccess = useCan('access', 'view')
  const [creating, setCreating] = useState(false)
  const [groupsFor, setGroupsFor] = useState<StaffRow | null>(null)
  const [effective, setEffective] = useState<StaffRow | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const q = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => api.get<{ items: StaffRow[] }>('/admin/staff') })
  const act = useMutation({
    mutationFn: ({ a, reason }: { a: Action; reason: string }) => api.post(`/admin/staff/${a.row.hk}/${a.kind}`, { reason }),
    onSuccess: (_r, v) => { toast.success(v.a.kind === 'reset-totp' ? t('confirm.submitted') : t('confirm.done')); setAction(null); void qc.invalidateQueries({ queryKey: ['admin'] }) },
    onError: (e) => { setAction(null); toast.error(describeError(t, e)) },
  })
  const columns: Column<StaffRow>[] = [
    { key: 'e', header: t('cols.email'), cell: (s) => <div><bdi dir='ltr'>{s.email}</bdi>{s.email === me && <span className='ms-2 text-xs text-muted-foreground'>({t('self')})</span>}</div> },
    { key: 's', header: t('cols.status'), cell: (s) => <StatusPill tone={s.status === 'active' ? 'ok' : 'neutral'}>{t(`status.${s.status}`)}</StatusPill> },
    { key: 'g', header: t('cols.groups'), cell: (s) => <div className='flex flex-wrap gap-1'>{s.groups.map((g) => <StatusPill key={g.id}>{t(`access:groups.${g.id}`, { defaultValue: g.id })}{g.expires_at && <> · {t('expires', { date: new Date(g.expires_at).toLocaleDateString('fa-IR-u-ca-persian') })}</>}</StatusPill>)}</div> },
    { key: 'ls', header: t('cols.lastSignIn'), cell: (s) => <DateTime value={s.last_sign_in_at} /> },
    { key: 'pw', header: t('cols.password'), cell: (s) => (s.must_change_password ? <StatusPill tone='warn'>{t('mustChange')}</StatusPill> : <DateTime value={s.password_expires_at} />) },
    { key: 't', header: t('cols.totp'), cell: (s) => <StatusPill tone={s.totp_enabled ? 'ok' : 'warn'}>{s.totp_enabled ? t('totpOn') : t('totpOff')}</StatusPill> },
    {
      key: 'a', header: '', cell: (s) => (
        <div className='flex gap-1'>
          {canAccess && <Button size='sm' variant='ghost' onClick={() => setEffective(s)}>{t('actions.effective')}</Button>}
          {canManage && s.email !== me && (
            <>
              <Button size='sm' variant='outline' onClick={() => setGroupsFor(s)}>{t('actions.groups')}</Button>
              {s.status === 'active'
                ? <Button size='sm' variant='outline' onClick={() => setAction({ kind: 'disable', row: s })}>{t('actions.disable')}</Button>
                : <Button size='sm' variant='outline' onClick={() => setAction({ kind: 'enable', row: s })}>{t('actions.enable')}</Button>}
              <Button size='sm' variant='ghost' onClick={() => setAction({ kind: 'reset-totp', row: s })}>{t('actions.resetTotp')}</Button>
            </>
          )}
        </div>
      ),
    },
  ]
  return (
    <>
      <PageHeader title={t('title')} />
      <Main>
        {canManage && <div className='mb-4 flex'><Button className='ms-auto' onClick={() => setCreating(true)}>{t('new')}</Button></div>}
        <DataTable columns={columns} rows={q.data?.items ?? []} rowKey={(s) => s.hk} loading={q.isPending} error={q.isError ? describeError(t, q.error) : undefined} />
      </Main>
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {groupsFor && <GroupsDialog row={groupsFor} onClose={() => setGroupsFor(null)} />}
      {effective && <EffectiveDialog row={effective} onClose={() => setEffective(null)} />}
      {action && (
        <ReasonDialog
          open destructive={action.kind !== 'enable'}
          title={action.kind === 'disable' ? t('confirm.disableTitle', { email: action.row.email }) : action.kind === 'enable' ? t('confirm.enableTitle', { email: action.row.email }) : t('confirm.resetTitle', { email: action.row.email })}
          description={action.kind === 'disable' ? t('confirm.disableBody') : action.kind === 'reset-totp' ? t('confirm.resetBody') : undefined}
          confirmLabel={t(`actions.${action.kind === 'reset-totp' ? 'resetTotp' : action.kind}`)} busy={act.isPending} onCancel={() => setAction(null)} onConfirm={(reason) => act.mutate({ a: action, reason })}
        />
      )}
    </>
  )
}

function useGroups() {
  return useQuery({ queryKey: ['admin', 'access', 'groups'], queryFn: () => api.get<{ items: AccessGroup[] }>('/admin/access/groups') })
}

function GroupPicker({ value, onChange }: { value: StaffGroupRef[]; onChange: (v: StaffGroupRef[]) => void }) {
  const { t } = useTranslation('staff')
  const groups = useGroups().data?.items.filter((g) => g.status === 'active') ?? []
  const has = (id: string) => value.find((v) => v.id === id)
  return (
    <ul className='grid gap-2'>
      {groups.map((g) => {
        const cur = has(g.id)
        return (
          <li key={g.id} className='flex flex-wrap items-center gap-3 rounded-md border p-2'>
            <Checkbox id={`pg-${g.id}`} checked={!!cur} onCheckedChange={(v) => onChange(v === true ? [...value, { id: g.id }] : value.filter((x) => x.id !== g.id))} />
            <Label htmlFor={`pg-${g.id}`}>{t(`access:groups.${g.id}`, { defaultValue: g.id })}</Label>
            {cur && !g.system && (
              <Input type='datetime-local' dir='ltr' className='ms-auto w-56' aria-label={t('groupsDialog.expiry')} title={t('groupsDialog.expiry')} value={toLocalInput(cur.expires_at)} onChange={(e) => onChange(value.map((x) => (x.id === g.id ? { ...x, expires_at: fromLocalInput(e.target.value) } : x)))} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('staff')
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [groups, setGroups] = useState<StaffGroupRef[]>([])
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api.post('/admin/staff', { email: email.trim(), groups, reason: reason.trim() }),
    onSuccess: () => { toast.success(t('create.submitted')); void qc.invalidateQueries({ queryKey: ['admin'] }); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{t('create.title')}</DialogTitle><DialogDescription>{t('create.note')}</DialogDescription></DialogHeader>
          <Field id='s-email' label={t('create.email')} error={errors.email}><Input id='s-email' type='email' dir='ltr' value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <div className='grid gap-2'><span className='text-sm font-medium'>{t('create.groups')}</span><GroupPicker value={groups} onChange={setGroups} />{errors.groups && <p role='alert' className='text-xs text-destructive'>{errors.groups}</p>}</div>
          <Field id='s-reason' label={t('create.reason')} error={errors.reason}><Input id='s-reason' maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter className='gap-2'><Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button><Button type='submit' disabled={save.isPending}>{t('common:save')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GroupsDialog({ row, onClose }: { row: StaffRow; onClose: () => void }) {
  const { t } = useTranslation('staff')
  const qc = useQueryClient()
  const [groups, setGroups] = useState<StaffGroupRef[]>(row.groups)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api.put(`/admin/staff/${row.hk}/groups`, { groups, reason: reason.trim() }),
    onSuccess: () => { toast.success(t('groupsDialog.submitted')); void qc.invalidateQueries({ queryKey: ['admin'] }); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{t('groupsDialog.title', { email: row.email })}</DialogTitle><DialogDescription>{t('groupsDialog.note')}</DialogDescription></DialogHeader>
          <GroupPicker value={groups} onChange={setGroups} />
          {errors.groups && <p role='alert' className='text-xs text-destructive'>{errors.groups}</p>}
          <Field id='sg-reason' label={t('groupsDialog.reason')} error={errors.reason}><Input id='sg-reason' maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter className='gap-2'><Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button><Button type='submit' disabled={save.isPending}>{t('common:save')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EffectiveDialog({ row, onClose }: { row: StaffRow; onClose: () => void }) {
  const { t } = useTranslation('staff')
  const q = useQuery({ queryKey: ['admin', 'access', 'effective', row.hk], queryFn: () => api.get<{ grants: { resource: string; level: string; by: string[] }[] }>(`/admin/access/effective/${row.hk}`) })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader className='text-start'><DialogTitle>{t('effective.title', { email: row.email })}</DialogTitle></DialogHeader>
        {q.data?.grants.length === 0 && <p className='text-sm text-muted-foreground'>{t('effective.none')}</p>}
        <ul className='grid gap-1 text-sm'>
          {q.data?.grants.map((g) => (
            <li key={g.resource} className='flex flex-wrap items-center gap-2'>
              <span>{t(`access:resources.${g.resource}`, { defaultValue: g.resource })}</span><StatusPill>{t(`access:levels.${g.level}`, { defaultValue: g.level })}</StatusPill>
              <span className='ms-auto text-xs text-muted-foreground'>{t('effective.by', { groups: g.by.map((b) => t(`access:groups.${b}`, { defaultValue: b })).join('، ') })}</span>
            </li>
          ))}
        </ul>
        <DialogFooter><Button variant='outline' onClick={onClose}>{t('common:close')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
