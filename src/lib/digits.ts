const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC = '٠١٢٣٤٥٦٧٨٩'

/** Turn Persian and Arabic-Indic digits into Latin ones. The backend accepts them too; this keeps the UI check simple. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const p = PERSIAN.indexOf(d)
    return String(p >= 0 ? p : ARABIC.indexOf(d))
  })
}

export const isSixDigits = (input: string) => /^\d{6}$/.test(normalizeDigits(input).trim())
