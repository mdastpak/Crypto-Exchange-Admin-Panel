/**
 * Display helpers. Stored and sent values stay UTC and decimal strings; only
 * the display changes. The Jalali calendar is the default for Persian, with the
 * exact UTC time available as a tooltip (see `utcTitle`).
 */
const locale = () => (document.documentElement.lang === 'fa' ? 'fa-IR-u-ca-persian' : document.documentElement.lang || 'fa-IR-u-ca-persian')

export function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export const utcTitle = (iso?: string) => (iso ? new Date(iso).toISOString() : undefined)

/** `datetime-local` value (local time) from an ISO string, and back to UTC. */
export function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}
export function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Basis points as a percentage: 10 -> "0.10%". */
export const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(2)}%`

/** Number of a price from the engine, shown without float noise. */
export const price = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(2) : n.toPrecision(6))
