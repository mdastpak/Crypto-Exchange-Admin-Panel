import type { Tone } from '@/components/status-pill'
import type { CurrencyStatus, LifecycleState } from '@/api/models'

export const statusTone = (s: CurrencyStatus): Tone =>
  s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : s === 'deleted' ? 'bad' : 'neutral'

export const lifecycleTone = (s?: LifecycleState): Tone =>
  !s || s === 'active' ? 'ok' : s === 'delisted' || s === 'frozen' ? 'bad' : 'warn'
