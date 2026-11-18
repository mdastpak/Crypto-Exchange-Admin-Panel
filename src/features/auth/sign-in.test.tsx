import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { setTransport } from '@/api/client'
import { mockTransport, resetMock } from '@/api/mock/server'
import { useSession } from '@/auth/session-store'
import { routeTree } from '@/routeTree.gen'

const PASSWORD = 'correct horse battery staple'

function setup() {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ['/sign-in'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

beforeEach(() => {
  resetMock()
  useSession.setState({ token: null, me: null, endReason: null })
  setTransport(mockTransport)
})

describe('sign-in', () => {
  it('shows the same message for a wrong password and for an unknown account', async () => {
    const attempt = async (email: string) => {
      const user = userEvent.setup()
      setup()
      await user.type(await screen.findByLabelText('ایمیل'), email)
      await user.type(screen.getByLabelText('رمز عبور'), 'wrong password but long enough')
      await user.click(screen.getByRole('button', { name: 'ادامه' }))
      await user.type(await screen.findByLabelText('کد ارسال‌شده به ایمیل'), '123456')
      await user.type(screen.getByLabelText('کد برنامهٔ احراز هویت (TOTP)'), '654321')
      await user.click(screen.getByRole('button', { name: 'ورود' }))
      let text = ''
      await waitFor(() => {
        text = screen.getByRole('alert').textContent ?? ''
        expect(text).not.toBe('')
      })
      cleanup()
      resetMock()
      return text
    }
    const wrong = await attempt('ali@exchange.example')
    const unknown = await attempt('nobody@exchange.example')
    expect(wrong).toBe('ورود ممکن نیست. اطلاعات را بررسی کنید.')
    expect(unknown).toBe(wrong)
    expect(useSession.getState().token).toBeNull()
  })

  it('signs in with password, email code, and authenticator code', async () => {
    const user = userEvent.setup()
    const router = setup()
    await user.type(await screen.findByLabelText('ایمیل'), 'ali@exchange.example')
    await user.type(screen.getByLabelText('رمز عبور'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await user.type(await screen.findByLabelText('کد ارسال‌شده به ایمیل'), '۱۲۳۴۵۶')
    await user.type(screen.getByLabelText('کد برنامهٔ احراز هویت (TOTP)'), '654321')
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() => expect(useSession.getState().token).not.toBeNull())
    expect(useSession.getState().me?.groups).toEqual(['super_admin'])
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('keeps the token only in memory', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(await screen.findByLabelText('ایمیل'), 'ali@exchange.example')
    await user.type(screen.getByLabelText('رمز عبور'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await user.type(await screen.findByLabelText('کد ارسال‌شده به ایمیل'), '123456')
    await user.type(screen.getByLabelText('کد برنامهٔ احراز هویت (TOTP)'), '654321')
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() => expect(useSession.getState().token).not.toBeNull())
    const token = useSession.getState().token!
    expect(JSON.stringify({ ...localStorage })).not.toContain(token)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(token)
    expect(document.cookie).not.toContain(token)
  })
})
