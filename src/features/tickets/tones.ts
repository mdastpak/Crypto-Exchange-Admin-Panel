import type { Ticket } from '@/api/models'
import type { Tone } from '@/components/status-pill'

export const priorityTone = (p: Ticket['priority']): Tone => (p === 'urgent' ? 'bad' : p === 'high' ? 'warn' : 'neutral')
export const statusTone = (s: Ticket['status']): Tone => (s === 'open' ? 'warn' : s === 'solved' || s === 'closed' ? 'ok' : 'neutral')
export const slaTone = (s: Ticket['sla_state']): Tone => (s === 'breached' ? 'bad' : s === 'at_risk' ? 'warn' : 'ok')
