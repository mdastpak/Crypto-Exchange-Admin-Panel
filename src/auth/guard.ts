import { notFound } from '@tanstack/react-router'
import { canNow } from './permissions'

/** Route guard: a route you cannot use looks the same as a route that does not exist. */
export const requireLevel = (resource: string, level: string) => () => {
  if (!canNow(resource, level)) throw notFound()
}
