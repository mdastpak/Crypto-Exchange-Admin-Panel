import { type QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { StepUpDialog } from '@/components/step-up-dialog'
import { GeneralError } from '@/features/errors/general-error'
import { NotFound } from '@/features/errors/not-found'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      <StepUpDialog />
      <Toaster duration={5000} />
    </>
  ),
  notFoundComponent: NotFound,
  errorComponent: GeneralError,
})
