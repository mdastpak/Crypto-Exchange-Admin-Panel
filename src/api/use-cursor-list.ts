import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Page } from './models'

/** A cursor-paged list (`{items, next_cursor}`). The cursor is opaque: never built here. */
export function useCursorList<T>(key: unknown[], path: string, params: Record<string, string | undefined> = {}) {
  return useInfiniteQuery({
    queryKey: [...key, path, params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
      if (pageParam) qs.set('cursor', pageParam)
      const s = qs.toString()
      return api.get<Page<T>>(`${path}${s ? `?${s}` : ''}`)
    },
    getNextPageParam: (last) => last.next_cursor,
  })
}
