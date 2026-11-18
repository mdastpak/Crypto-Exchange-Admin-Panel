import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import access from './locales/fa/access.json'
import currencies from './locales/fa/currencies.json'
import dashboard from './locales/fa/dashboard.json'
import markets from './locales/fa/markets.json'
import platform from './locales/fa/platform.json'
import audit from './locales/fa/audit.json'
import integrity from './locales/fa/integrity.json'
import restrictions from './locales/fa/restrictions.json'
import sms from './locales/fa/sms.json'
import venues from './locales/fa/venues.json'
import withdrawals from './locales/fa/withdrawals.json'
import security from './locales/fa/security.json'
import staff from './locales/fa/staff.json'
import ledger from './locales/fa/ledger.json'
import tickets from './locales/fa/tickets.json'
import kyc from './locales/fa/kyc.json'
import users from './locales/fa/users.json'
import auth from './locales/fa/auth.json'
import common from './locales/fa/common.json'
import errors from './locales/fa/errors.json'
import nav from './locales/fa/nav.json'
import session from './locales/fa/session.json'

/**
 * Supported locales. Only Persian ships now; adding a language is a new folder
 * under ./locales, an entry here, and the language switcher (see docs/07-i18n.md).
 */
export const SUPPORTED_LOCALES = [
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', dir: 'rtl' as const },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']
export const DEFAULT_LOCALE: LocaleCode = 'fa'
export const NAMESPACES = ['common', 'auth', 'nav', 'errors', 'access', 'session', 'currencies', 'markets', 'platform', 'dashboard', 'withdrawals', 'restrictions', 'audit', 'integrity', 'venues', 'sms', 'users', 'kyc', 'tickets', 'ledger', 'staff', 'security'] as const

export function dirOf(code: string): 'rtl' | 'ltr' {
  return SUPPORTED_LOCALES.find((l) => l.code === code)?.dir ?? 'ltr'
}

export function applyLocale(code: string) {
  document.documentElement.lang = code
  document.documentElement.dir = dirOf(code)
}

void i18n.use(initReactI18next).init({
  resources: { fa: { common, auth, nav, errors, access, session, currencies, markets, platform, dashboard, withdrawals, restrictions, audit, integrity, venues, sms, users, kyc, tickets, ledger, staff, security } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
