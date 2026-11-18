/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `mock` (default) or `http`. */
  readonly VITE_API_MODE?: 'mock' | 'http'
  /** Base URL of the admin API, for example `https://admin-api.example.com/api/v1`. */
  readonly VITE_API_BASE?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
