import { createContext, useContext, useEffect } from 'react'
import { DirectionProvider as RdxDirProvider } from '@radix-ui/react-direction'
import { DEFAULT_LOCALE, applyLocale, dirOf } from '@/i18n'

export type Direction = 'ltr' | 'rtl'

type DirectionContextType = { dir: Direction; locale: string }
const DirectionContext = createContext<DirectionContextType | null>(null)

/** Direction follows the locale. Only Persian (RTL) ships now. */
export function DirectionProvider({ children }: { children: React.ReactNode }) {
  const locale = DEFAULT_LOCALE
  const dir = dirOf(locale)
  useEffect(() => applyLocale(locale), [locale])
  return (
    <DirectionContext value={{ dir, locale }}>
      <RdxDirProvider dir={dir}>{children}</RdxDirProvider>
    </DirectionContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDirection() {
  const ctx = useContext(DirectionContext)
  if (!ctx) throw new Error('useDirection must be used within a DirectionProvider')
  return ctx
}
