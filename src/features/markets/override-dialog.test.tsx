import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { OverrideDialog } from './override-dialog'

function setup(referenceMid?: number) {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OverrideDialog market='BTC/USDT' referenceMid={referenceMid} onClose={onClose} />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe('price override dialog', () => {
  it('says the price applies at once when it is within the bound', async () => {
    const user = setup(64_000)
    await user.type(screen.getByLabelText('قیمت میانه'), '64100')
    expect(await screen.findByText('این قیمت بلافاصله اعمال می‌شود.')).toBeInTheDocument()
    expect(screen.getByText('انحراف از قیمت مرجع: 16 bps')).toBeInTheDocument()
  })

  it('warns that a second administrator is needed beyond the bound', async () => {
    const user = setup(64_000)
    await user.type(screen.getByLabelText('قیمت میانه'), '70000')
    expect(await screen.findByText(/تأیید یک ادمین دیگر/)).toBeInTheDocument()
  })

  it('needs a second administrator when there is no live price to bound it', async () => {
    const user = setup(undefined)
    await user.type(screen.getByLabelText('قیمت میانه'), '64000')
    expect(await screen.findByText(/تأیید ادمین دوم لازم است/)).toBeInTheDocument()
  })

  it('checks bid <= mid <= ask and the reason before sending', async () => {
    const user = setup(64_000)
    await user.type(screen.getByLabelText('قیمت میانه'), '64000')
    await user.type(screen.getByLabelText('قیمت خرید (اختیاری)'), '65000')
    await user.click(screen.getByRole('button', { name: 'ثبت قیمت دستی' }))
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
    expect(screen.getByText('دلیل لازم است.')).toBeInTheDocument()
    expect(screen.getAllByText('bid ≤ mid ≤ ask').length).toBeGreaterThan(0)
  })
})
