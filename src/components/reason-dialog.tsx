import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  onCancel: () => void
  /** Called with the trimmed reason. Sensitive calls ask for a step-up inside the API client. */
  onConfirm: (reason: string) => void
}

/** Every change that the backend audits needs a reason of up to 1000 characters. */
export function ReasonDialog(p: Props) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = reason.trim()
    if (!r) return setError(t('reasonRequired'))
    setError('')
    p.onConfirm(r)
  }
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && p.onCancel()}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={submit} className='grid gap-4'>
          <DialogHeader className='text-start'>
            <DialogTitle>{p.title}</DialogTitle>
            {p.description && <DialogDescription>{p.description}</DialogDescription>}
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='reason'>{t('reasonLabel')}</Label>
            <Input id='reason' maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <p role='alert' className='min-h-5 text-sm text-destructive'>{error}</p>
          </div>
          <DialogFooter className='gap-2'>
            <Button type='button' variant='outline' onClick={p.onCancel}>{t('cancel')}</Button>
            <Button type='submit' variant={p.destructive ? 'destructive' : 'default'} disabled={p.busy}>
              {p.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
