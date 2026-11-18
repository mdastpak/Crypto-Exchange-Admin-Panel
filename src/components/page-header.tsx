import { Header } from '@/components/layout/header'
import { SessionStatus } from '@/components/session-status'
import { ThemeSwitch } from '@/components/theme-switch'

export function PageHeader({ title }: { title: string }) {
  return (
    <Header fixed>
      <h1 className='text-base font-semibold'>{title}</h1>
      <div className='ms-auto flex items-center gap-3'>
        <SessionStatus />
        <ThemeSwitch />
      </div>
    </Header>
  )
}
