import type { Market } from '@/api/models'
import type { Tone } from '@/components/status-pill'

export const marketTone = (s: Market['status']): Tone =>
  s === 'ACTIVE' ? 'ok' : s === 'MAINTENANCE' || s === 'SUSPENDED' ? 'warn' : 'neutral'
