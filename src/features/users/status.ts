import type { KycState, UserStatus } from '@/api/models'
import type { Tone } from '@/components/status-pill'

export const userTone = (s: UserStatus): Tone => (s === 'ACTIVE' ? 'ok' : s === 'SUSPENDED' ? 'warn' : 'bad')
export const kycTone = (s: KycState): Tone => (s === 'approved' ? 'ok' : s === 'rejected' ? 'bad' : s === 'none' ? 'neutral' : 'warn')
