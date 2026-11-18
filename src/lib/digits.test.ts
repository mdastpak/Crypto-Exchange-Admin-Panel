import { describe, expect, it } from 'vitest'
import { isSixDigits, normalizeDigits } from './digits'

describe('digits', () => {
  it('normalizes Persian and Arabic-Indic digits', () => {
    expect(normalizeDigits('۱۲۳۴۵۶')).toBe('123456')
    expect(normalizeDigits('١٢٣٤٥٦')).toBe('123456')
    expect(normalizeDigits('12a۴')).toBe('12a4')
  })
  it('accepts exactly six digits', () => {
    expect(isSixDigits('۱۲۳۴۵۶')).toBe(true)
    expect(isSixDigits(' 123456 ')).toBe(true)
    expect(isSixDigits('12345')).toBe(false)
    expect(isSixDigits('1234567')).toBe(false)
    expect(isSixDigits('12345a')).toBe(false)
  })
})
