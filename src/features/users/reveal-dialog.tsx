import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { describeError, fieldErrors } from '@/lib/errors'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const FIELDS = ['email', 'mobile', 'name', 'national_id'] as const
const SHOW_SECONDS = 30

/** Unmasks identity fields once, with a reason; the values disappear after 30 seconds and are never cached. */
export function RevealDialog({ hk, onClose }: { hk: string; onClose: () => void }) {
  const { t } = useTranslation('users')
  const [fields, setFields] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [values, setValues] = useState<Record<string, string> | null>(null)
  const [left, setLeft] = useState(SHOW_SECONDS)
  const reveal = useMutation({
    mutationFn: () => api.post<{ values: Record<string, string> }>(`/admin/users/${hk}/reveal`, { fields, reason: reason.trim() }),
    onSuccess: (r) => { setValues(r.values); setLeft(SHOW_SECONDS) },
    onError: (e) => { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else setErrors({ reason: describeError(t, e) }) },
  })
  useEffect(() => {
    if (!values) return
    const id = window.setInterval(() => setLeft((s) => s - 1), 1000)
    return () => window.clearInterval(id)
  }, [values])
  const visible = values && left > 0
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='text-start'>
          <DialogTitle>{t('reveal.title')}</DialogTitle>
          <DialogDescription>{t('reveal.audit')}</DialogDescription>
        </DialogHeader>
        {!values ? (
          <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); setErrors({}); if (!fields.length) return setErrors({ fields: t('reveal.selectOne') }); reveal.mutate() }}>
            <fieldset className='grid gap-2'>
              <legend className='mb-1 text-sm font-medium'>{t('reveal.fields')}</legend>
              <div className='flex flex-wrap gap-4'>
                {FIELDS.map((f) => (
                  <div key={f} className='flex items-center gap-2'>
                    <Checkbox id={`rv-${f}`} checked={fields.includes(f)} onCheckedChange={() => setFields((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]))} />
                    <Label htmlFor={`rv-${f}`}>{t(`reveal.${f}`)}</Label>
                  </div>
                ))}
              </div>
              {errors.fields && <p role='alert' className='text-xs text-destructive'>{errors.fields}</p>}
            </fieldset>
            <Field id='rv-reason' label={t('reveal.reason')} error={errors.reason}><Input id='rv-reason' maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
            <DialogFooter className='gap-2'>
              <Button type='button' variant='outline' onClick={onClose}>{t('common:cancel')}</Button>
              <Button type='submit' disabled={reveal.isPending}>{t('reveal.submit')}</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className='grid gap-3'>
            {visible ? (
              <>
                <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm'>
                  {Object.entries(values).map(([k, v]) => <div key={k} className='contents'><dt className='text-muted-foreground'>{t(`reveal.${k}`)}</dt><dd><bdi dir='auto' className='font-mono select-all'>{v}</bdi></dd></div>)}
                </dl>
                <p className='text-xs text-muted-foreground'>{t('reveal.hideIn', { s: left })}</p>
              </>
            ) : <p role='status' className='text-sm'>{t('reveal.hidden')}</p>}
            <DialogFooter><Button variant='outline' onClick={onClose}>{t('common:close')}</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
