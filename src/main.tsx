import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { ApiError } from '@/api/types'
import { useSession } from '@/auth/session-store'
import { DirectionProvider } from './context/direction-provider'
import { ThemeProvider } from './context/theme-provider'
import './i18n'
import { installTrustedTypes } from './lib/trusted-types'
import { routeTree } from './routeTree.gen'
import './styles/index.css'

installTrustedTypes()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error instanceof ApiError && [401, 403, 404, 409, 422].includes(error.status)) && count < 2,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      gcTime: 60_000,
    },
  },
  queryCache: new QueryCache(),
})

// Cached data of a finished session must not outlive it.
useSession.subscribe((s, prev) => {
  if (prev.token && !s.token) queryClient.clear()
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <DirectionProvider>
            <RouterProvider router={router} />
          </DirectionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
