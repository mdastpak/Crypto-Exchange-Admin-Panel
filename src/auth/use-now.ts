import { useEffect, useState } from 'react'

/** Re-renders every `ms` with the current time, for countdowns. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

export function formatClock(msLeft: number) {
  const s = Math.max(0, Math.round(msLeft / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
