export const BASE = 'http://localhost:5198'
export const PASSWORD = 'correct horse battery staple'

export async function signIn(page, email) {
  await page.goto(`${BASE}/sign-in`)
  await page.waitForSelector('#email')
  await page.fill('#email', email)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.fill('#email-code', '123456')
  await page.fill('#totp', '654321')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=خلاصهٔ عملیات')
}

/** Collects what a security review would care about: CSP and Trusted Types refusals and uncaught errors. */
export function watch(page) {
  const found = []
  page.on('console', (m) => {
    const t = m.text()
    if (/Content Security Policy|TrustedHTML|TrustedScript|violates the following|Untrusted HTML|Refused to/.test(t)) found.push(t.slice(0, 400))
  })
  page.on('pageerror', (e) => found.push(`pageerror: ${e.message.slice(0, 300)}`))
  return found
}

/** Navigate by the sidebar, as a person would. */
export async function go(page, href) {
  await page.click(`a[href="${href}"]`)
  await page.waitForTimeout(450)
}
