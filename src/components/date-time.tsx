import { formatDateTime, utcTitle } from '@/lib/format'

/** Local Jalali display; the tooltip shows the exact UTC instant. */
export function DateTime({ value }: { value?: string }) {
  if (!value) return <span>—</span>
  return <time dateTime={value} title={utcTitle(value)} className='tabular-nums'>{formatDateTime(value)}</time>
}
