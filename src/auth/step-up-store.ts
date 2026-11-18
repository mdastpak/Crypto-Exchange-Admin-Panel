import { create } from 'zustand'

interface StepUpState {
  open: boolean
  resolve: ((ok: boolean) => void) | null
  ask: () => Promise<boolean>
  settle: (ok: boolean) => void
}

/**
 * One dialog serves every sensitive action. The API client calls `ask()` when
 * the backend answers `403 step_up_required`; concurrent requests share the
 * same question.
 */
let pending: Promise<boolean> | null = null

export const useStepUp = create<StepUpState>()((set, get) => ({
  open: false,
  resolve: null,
  ask: () => {
    if (pending) return pending
    pending = new Promise<boolean>((resolve) => set({ open: true, resolve }))
    return pending
  },
  settle: (ok) => {
    get().resolve?.(ok)
    pending = null
    set({ open: false, resolve: null })
  },
}))

export const requestStepUp = () => useStepUp.getState().ask()
