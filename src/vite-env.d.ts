/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `mock` (default) or `http`. */
  readonly VITE_API_MODE?: 'mock' | 'http'
  /** Base URL of the admin API, for example `https://admin-api.example.com/api/v1`. */
  readonly VITE_API_BASE?: string
  /** `off`, `optional`, or `required`. */
  readonly VITE_SEALING?: string
  /** JWK (JSON) of the server's long-term signing key, to verify the key agreement. */
  readonly VITE_SEALING_PUBKEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
