import { describe, expect, it } from 'vitest'
import { deviationBps, isDecimal, isPositiveDecimal, lte } from './decimal'

describe('decimal helpers', () => {
  it('validates decimal strings without parsing to number', () => {
    expect(isDecimal('0.0001')).toBe(true)
    expect(isDecimal('1e5')).toBe(false)
    expect(isDecimal('-1')).toBe(false)
    expect(isDecimal('')).toBe(false)
    expect(isPositiveDecimal('0')).toBe(false)
    expect(isPositiveDecimal('0.000000000000000001')).toBe(true)
  })
  it('compares without float error', () => {
    expect(lte('0.1', '0.1')).toBe(true)
    expect(lte('0.30000000000000004', '0.3')).toBe(false)
  })
  it('rounds the deviation up, as the backend does', () => {
    expect(deviationBps('64100', '64000')).toBe(16) // 15.625 -> 16
    expect(deviationBps('70000', '64000')).toBe(938)
    expect(deviationBps('64000', '64000')).toBe(0)
  })
})
