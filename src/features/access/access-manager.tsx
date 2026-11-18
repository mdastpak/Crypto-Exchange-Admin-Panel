import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { RESOURCES, type Grants } from '@/access/catalog'
import { applyDependencies, compact, levelIndex, requiredFor } from '@/access/dependencies'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import { useCan } from '@/auth/permissions'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ReasonDialog } from '@/components/reason-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface GroupRow {
  id: string
  version: number
  grants: Grants
}

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
  const groupsQ = useQuery({
    queryKey: ['admin', 'access', 'groups'],
    queryFn: () => api.get<{ groups: GroupRow[] }>('/admin/access/groups'),
  })
  const [groupId, setGroupId] = useState('support_agent')
  const [drafts, setDrafts] = useState<Record<string, Grants>>({})
  const [asking, setAsking] = useState(false)

  const group = groupsQ.data?.groups.find((g) => g.id === groupId)
  const grants: Grants = drafts[groupId] ?? group?.grants ?? {}
  const required = requiredFor(grants)

  const save = useMutation({
    mutationFn: ({ reason }: { reason: string }) =>
      api.put(`/admin/access/groups/${groupId}`, { grants: compact(grants), reason }),
    onSuccess: () => {
      toast.success(t('submitted'))
      setAsking(false)
      void qc.invalidateQueries({ queryKey: ['admin', 'access'] })
    },
    onError: (e) => {
      setAsking(false)
      if (e instanceof ApiError) toast.error(e.message)
    },
  })

  const change = (resource: string, level: string) => {
    const next = { ...grants, [resource]: level }
    const { grants: withDeps } = applyDependencies(next)
    setDrafts({ ...drafts, [groupId]: withDeps })
  }

  return (
    <>
      <PageHeader title={tn('access')} />
      <Main>
        <p className='mb-4 max-w-2xl text-sm text-muted-foreground'>{t('subtitle')}</p>
        <div className='mb-4 flex flex-wrap items-center gap-3'>
          <span className='text-sm'>{t('group')}</span>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger className='w-56' aria-label={t('group')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(groupsQ.data?.groups ?? []).filter((g) => g.id !== 'super_admin').map((g) => (
                <SelectItem key={g.id} value={g.id}>{t(`groups.${g.id}`, { defaultValue: g.id })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {group && <Badge variant='secondary'>{t('version', { n: group.version })}</Badge>}
          {!canManage && <Badge variant='outline'>{t('readOnly')}</Badge>}
        </div>

        <Card>
          <CardContent className='p-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('section')}</TableHead>
                  <TableHead>{t('level')}</TableHead>
                  <TableHead>{t('dependency')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RESOURCES.filter((r) => r.key !== 'access').map((r) => {
                  const current = grants[r.key] ?? 'none'
                  const req = required[r.key]
                  const min = req?.level ?? 'none'
                  return (
                    <TableRow key={r.key}>
                      <TableCell>
                        {t(`resources.${r.key}`)}
                        <div className='font-mono text-xs text-muted-foreground' dir='ltr'>{r.key}</div>
                      </TableCell>
                      <TableCell>
                        <Select disabled={!canManage} value={current} onValueChange={(v) => change(r.key, v)}>
                          <SelectTrigger className='w-48' aria-label={t(`resources.${r.key}`)}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {r.levels.map((l) => (
                              <SelectItem key={l} value={l} disabled={levelIndex(r.key, l) < levelIndex(r.key, min)}>
                                {t(`levels.${l}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {req && (
                          <Badge variant='outline'>
                            {t('requiredFor', { items: req.by.map((b) => { const [a, l] = b.split(':'); return `${t(`resources.${a}`)}: ${t(`levels.${l}`)}` }).join('، ') })}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className='mt-4 flex gap-2'>
          <Button disabled={!canManage || !drafts[groupId]} onClick={() => setAsking(true)}>{t('submit')}</Button>
        </div>
        <p className='mt-4 max-w-2xl text-sm text-muted-foreground'>{t('note')}</p>
      </Main>
      <ReasonDialog
        open={asking}
        title={t('submitTitle', { name: t(`groups.${groupId}`, { defaultValue: groupId }) })}
        confirmLabel={t('common:confirm')}
        busy={save.isPending}
        onCancel={() => setAsking(false)}
        onConfirm={(reason) => save.mutate({ reason })}
      />
    </>
  )
}
