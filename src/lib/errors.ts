import type { TFunction } from 'i18next'
import { ApiError } from '@/api/types'

/** A human sentence for an error, by code; falls back to the generic one. */
export function describeError(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors:codes.${err.code}`
    const translated = t(key, { defaultValue: '' })
    if (translated) return translated
    return t(`errors:codes.${err.status >= 500 ? 'internal_error' : 'forbidden'}`, { defaultValue: t('errors:generalBody') })
  }
  return t('errors:codes.network')
}

/** Field errors of `400 validation_failed`: `info.errors` maps a field to a problem. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.code === 'validation_failed') {
    const e = (err.info as { errors?: Record<string, string> } | undefined)?.errors
    if (e) return e
  }
  return {}
}

/** The current version the backend reports in a `version_conflict`. */
export function conflictVersion(err: unknown): number | null {
  if (err instanceof ApiError && err.code === 'version_conflict') {
    const v = (err.info as { version?: number } | undefined)?.version
    return typeof v === 'number' ? v : null
  }
  return null
}
