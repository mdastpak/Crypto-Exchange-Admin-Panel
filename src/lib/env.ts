export const API_MODE: 'mock' | 'http' =
  import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1'

/**
 * Sealed payloads (docs/06-api-contract.md). `off`: never; `optional`: negotiate and use
 * when the server agrees; `required`: refuse to sign in without them.
 * Mock mode exercises the whole path; against the real backend it stays off until the
 * backend implements requirement 06.
 */
export type SealingMode = 'off' | 'optional' | 'required'
const envMode = import.meta.env.VITE_SEALING
export const SEALING: SealingMode = envMode === 'required' || envMode === 'optional' || envMode === 'off' ? envMode : API_MODE === 'mock' ? 'optional' : 'off'
/** The server's long-term signing key (a JWK), pinned at build time. Mock mode uses the mock's own key. */
export const SEALING_PUBKEY: string | undefined = import.meta.env.VITE_SEALING_PUBKEY
