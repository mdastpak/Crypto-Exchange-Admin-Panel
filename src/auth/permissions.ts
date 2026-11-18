import { hasLevel } from '@/access/dependencies'
import { useSession } from './session-store'

/** Does the signed-in administrator hold at least `level` on `resource`? */
export function useCan(resource: string, level: string): boolean {
  const grants = useSession((s) => s.me?.grants)
  return !!grants && hasLevel(grants, resource, level)
}

export function canNow(resource: string, level: string): boolean {
  const grants = useSession.getState().me?.grants
  return !!grants && hasLevel(grants, resource, level)
}
