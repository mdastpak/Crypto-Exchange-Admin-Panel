import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { RESOURCES, type Grants } from '@/access/catalog'
import { applyDependencies, compact, levelIndex, requiredFor } from '@/access/dependencies'
import { api } from '@/api/client'
import type { AccessGroup, GroupVersion, PendingChange } from '@/api/models'
import { useCan } from '@/auth/permissions'
import { describeError, fieldErrors } from '@/lib/errors'
import { DateTime } from '@/components/date-time'
import { Field } from '@/components/field'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PendingChanges } from './pending-changes'

/**
 * Groups, levels per area, and the lookups each level needs from other areas.
 * The backend validates and enforces everything; this screen shows the cost of
 * a grant before it is sent and refuses to lower a level that another grant needs.
 */
export function AccessManager() {
  const { t } = useTranslation('access')
  const { t: tn } = useTranslation('nav')
  const qc = useQueryClient()
  const canManage = useCan('access', 'manage')
  const groupsQ = useQuery({ queryKey: ['admin', 'access', 'groups'], queryFn: () => api.get<{ items: AccessGroup[] }>('/admin/access/groups') })
  const pending = useQuery({ queryKey: ['admin', 'access', 'changes'], queryFn: () => api.get<{ items: PendingChange[] }>('/admin/access/changes'), refetchInterval: 15_000, staleTime: 0, refetchOnMount: 'always' })
  const [groupId, setGroupId] = useState('support_agent')
  const [drafts, setDrafts] = useState<Record<string, Grants>>({})
  const [asking, setAsking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [retiring, setRetiring] = useState(false)
  const [versions, setVersions] = useState(false)

  const items = groupsQ.data?.items ?? []
  const group = items.find((g) => g.id === groupId)
  const editable = !!group && !group.system && group.status === 'active'
  const grants: Grants = drafts[groupId] ?? group?.grants ?? {}
  const required = requiredFor(grants)

  const save = useMutation({
    mutationFn: ({ reason }: { reason: string }) => api.put(`/admin/access/groups/${groupId}`, { grants: compact(grants), reason }),
    onSuccess: () => { toast.success(t('submitted')); setAsking(false); setDrafts((d) => { const n = { ...d }; delete n[groupId]; return n }); void qc.invalidateQueries({ queryKey: ['admin', 'access'] }) },
    onError: (e) => { setAsking(false); toast.error(describeError(t, e)) },
  })
  const retire = useMutation({
    mutationFn: ({ reason }: { reason: string }) => api.post(`/admin/access/groups/${groupId}/retire`, { reason }),
    onSuccess: () => { toast.success(t('submitted')); setRetiring(false); void qc.invalidateQueries({ queryKey: ['admin', 'access'] }) },
    onError: (e) => { setRetiring(false); toast.error(describeError(t, e)) },
  })

  const change = (resource: string, level: string) => {
    const { grants: withDeps } = applyDependencies({ ...grants, [resource]: level })
    setDrafts({ ...drafts, [groupId]: withDeps })
  }
  const waiting = pending.data?.items.filter((c) => c.status === 'pending').length ?? 0

  return (
    <>
      <PageHeader title={tn('access')} />
      <Main>
        <p className='mb-4 max-w-2xl text-sm text-muted-foreground'>{t('subtitle')}</p>
        <Tabs defaultValue='groups'>
          <TabsList>
            <TabsTrigger value='groups'>{t('tabs.groups')}</TabsTrigger>
            <TabsTrigger value='pending'>{t('tabs.pending')}{waiting > 0 && <Badge className='ms-2'>{waiting}</Badge>}</TabsTrigger>
          </TabsList>
          <TabsContent value='groups' className='pt-3'>
            <div className='mb-4 flex flex-wrap items-center gap-3'>
              <span className='text-sm'>{t('group')}</span>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger className='w-60' aria-label={t('group')}><SelectValue /></SelectTrigger>
                <SelectContent>{items.map((g) => <SelectItem key={g.id} value={g.id}>{t(`groups.${g.id}`, { defaultValue: g.id })}{g.status === 'retired' ? ` (${t('retired')})` : ''}</SelectItem>)}</SelectContent>
              </Select>
              {group && <Badge variant='secondary'>{t('version', { n: group.version })}</Badge>}
              {group && <Badge variant='outline'>{t('members', { n: group.members })}</Badge>}
              {group && <Button size='sm' variant='ghost' onClick={() => setVersions(true)}>{t('versions')}</Button>}
              {!canManage && <Badge variant='outline'>{t('readOnly')}</Badge>}
              {canManage && <Button size='sm' className='ms-auto' onClick={() => setCreating(true)}>{t('newGroup')}</Button>}
            </div>
            {group?.description && <p className='mb-3 text-sm text-muted-foreground'>{group.description}</p>}
            {group?.system && <p className='mb-3 text-sm'>{t('systemGroup')}</p>}
            <Card>
              <CardContent className='p-0'>
                <Table>
                  <TableHeader><TableRow><TableHead>{t('section')}</TableHead><TableHead>{t('level')}</TableHead><TableHead>{t('dependency')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {RESOURCES.map((r) => {
                      const current = grants[r.key] ?? 'none'
                      const req = required[r.key]
                      const min = req?.level ?? 'none'
                      return (
                        <TableRow key={r.key}>
                          <TableCell>{t(`resources.${r.key}`, { defaultValue: r.key })}<div className='font-mono text-xs text-muted-foreground' dir='ltr'>{r.key}</div></TableCell>
                          <TableCell>
                            <Select disabled={!canManage || !editable} value={current} onValueChange={(v) => change(r.key, v)}>
                              <SelectTrigger className='w-48' aria-label={t(`resources.${r.key}`, { defaultValue: r.key })}><SelectValue /></SelectTrigger>
                              <SelectContent>{r.levels.map((l) => <SelectItem key={l} value={l} disabled={levelIndex(r.key, l) < levelIndex(r.key, min)}>{t(`levels.${l}`)}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {req && <Badge variant='outline'>{t('requiredFor', { items: req.by.map((b) => { const [a, l] = b.split(':'); return `${t(`resources.${a}`, { defaultValue: a })}: ${t(`levels.${l}`)}` }).join('، ') })}</Badge>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <div className='mt-4 flex flex-wrap gap-2'>
              <Button disabled={!canManage || !editable || !drafts[groupId]} onClick={() => setAsking(true)}>{t('submit')}</Button>
              {canManage && editable && <Button variant='outline' onClick={() => setRetiring(true)}>{t('retire')}</Button>}
            </div>
            <p className='mt-4 max-w-2xl text-sm text-muted-foreground'>{t('note')}</p>
          </TabsContent>
          <TabsContent value='pending' className='pt-3'><PendingChanges /></TabsContent>
        </Tabs>
      </Main>
      {asking && <ReasonDialog open title={t('submitTitle', { name: t(`groups.${groupId}`, { defaultValue: groupId }) })} confirmLabel={t('common:confirm')} busy={save.isPending} onCancel={() => setAsking(false)} onConfirm={(reason) => save.mutate({ reason })} />}
      {retiring && <ReasonDialog open title={t('retire')} confirmLabel={t('retire')} destructive busy={retire.isPending} onCancel={() => setRetiring(false)} onConfirm={(reason) => retire.mutate({ reason })} />}
      {creating && <NewGroupDialog onClose={() => setCreating(false)} />}
      {versions && group && <VersionsDialog group={group} onClose={() => setVersions(false)} />}
    </>
  )
}

function NewGroupDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('access')
  const qc = useQueryClient()
  const [f, setF] = useState({ name: '', description: '', reason: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api.post('/admin/access/groups', { name: f.name.trim(), description: f.description.trim(), grants: { }, reason: f.reason.trim() }),
    onSuccess: () => { toast.success(t('newGroupDialog.submitted')); void qc.invalidateQueries({ queryKey: ['admin', 'access'] }); onClose() },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else toast.error(describeError(t, e)) },
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate() }}>
          <DialogHeader className='text-start'><DialogTitle>{t('newGroupDialog.title')}</DialogTitle></DialogHeader>
          <Field id='g-name' label={t('newGroupDialog.name')} error={errors.name}><Input id='g-name' dir='ltr' value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field id='g-desc' label={t('newGroupDialog.description')}><Input id='g-desc' maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field id='g-reason' label={t('newGroupDialog.reason')} error={errors.reason}><Input id='g-reason' maxLength={1000} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
            <Button type='submit' disabled={save.isPending}>{t('common:save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function VersionsDialog({ group, onClose }: { group: AccessGroup; onClose: () => void }) {
  const { t } = useTranslation('access')
  const q = useQuery({ queryKey: ['admin', 'access', 'versions', group.id], queryFn: () => api.get<{ items: GroupVersion[] }>(`/admin/access/groups/${group.id}/versions`) })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-md'>
        <DialogHeader className='text-start'><DialogTitle>{t('versionsDialog.title', { name: group.name })}</DialogTitle></DialogHeader>
        <ol className='grid gap-3 text-sm'>
          {q.data?.items.map((v) => (
            <li key={v.version} className='rounded-md border p-3'>
              <div className='flex flex-wrap items-center gap-2'><Badge variant='secondary'>{t('version', { n: v.version })}</Badge><span className='text-xs text-muted-foreground'>{t('versionsDialog.grants', { n: Object.keys(v.grants).length })}</span><span className='ms-auto text-xs'><DateTime value={v.at} /></span></div>
              <p className='mt-1'>{v.reason}</p>
              <p className='text-xs text-muted-foreground' dir='ltr'>{t('versionsDialog.author', { who: v.author })}{v.approved_by ? ` · ${t('versionsDialog.approvedBy', { who: v.approved_by })}` : ''}</p>
            </li>
          ))}
        </ol>
        <DialogFooter><Button variant='outline' onClick={onClose}>{t('common:close')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
