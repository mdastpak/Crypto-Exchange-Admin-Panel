import Decimal from 'decimal.js'

/** Amounts are decimal strings. Never parse them to `number`. */
export const isDecimal = (s: string) => /^\d+(\.\d+)?$/.test(s.trim())
export const isPositiveDecimal = (s: string) => isDecimal(s) && new Decimal(s).gt(0)
export const lte = (a: string, b: string) => new Decimal(a).lte(b)

/** Basis points between two prices, rounded up, as the backend computes the override deviation. */
export function deviationBps(price: string, reference: string): number {
  const ref = new Decimal(reference)
  if (ref.isZero()) return Number.POSITIVE_INFINITY
  return new Decimal(price).minus(ref).abs().div(ref).mul(10_000).ceil().toNumber()
}
