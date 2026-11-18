export const API_MODE: 'mock' | 'http' =
  import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1'
