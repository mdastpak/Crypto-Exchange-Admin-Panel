// End-to-end checks of the production build, in a real browser, under the production headers.
//   pnpm build && pnpm e2e
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { startServer } from './server.mjs'
import { BASE, go, signIn, watch } from './lib.mjs'

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const failures = []
const fail = (name, detail) => { failures.push(`${name}: ${detail}`); console.log(`  FAIL ${name}\n       ${detail}`) }
const pass = (name) => console.log(`  ok   ${name}`)

const server = await startServer(5198)
const browser = await chromium.launch()
try {
  /* 1. CSP and Trusted Types: walk the app and expect not one refusal. */
  console.log('CSP and Trusted Types')
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
    const found = watch(page)
    await signIn(page, 'ali@exchange.example')
    for (const h of ['/currencies', '/markets', '/prices', '/venues', '/otc', '/ledger', '/withdrawals', '/payouts', '/restrictions', '/users', '/kyc', '/tickets', '/platform', '/integrity', '/notifications', '/audit', '/staff', '/security', '/access', '/sessions']) await go(page, h)
    await go(page, '/access'); await page.click('[aria-label="تراکنش‌ها"]'); await page.waitForTimeout(300); await page.keyboard.press('Escape')
    await go(page, '/currencies'); await page.click('tr:has-text("USDT")'); await page.click('role=tab[name="شبکه‌ها"]')
    await page.click('button:has-text("ویرایش") >> nth=1'); await page.waitForTimeout(300); await page.keyboard.press('Escape')
    const lock = await page.locator('[title="رمزنگاری payload فعال است"]').count()
    found.length ? fail('no CSP or Trusted Types refusal', [...new Set(found)].join('\n       ')) : pass('no CSP or Trusted Types refusal')
    lock ? pass('sealed payloads are active in the session') : fail('sealed payloads are active in the session', 'no lock indicator')
  }

  /* 2. Accessibility: axe on the main screens, light and dark. Any finding fails. */
  console.log('Accessibility (axe)')
  for (const scheme of ['light', 'dark']) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme })).newPage()
    await signIn(page, 'ali@exchange.example')
    const scenes = [
      ['dashboard', async () => {}],
      ['currencies', async () => go(page, '/currencies')],
      ['currency detail', async () => { await page.click('tr:has-text("USDT")'); await page.waitForSelector('role=tab[name="شبکه‌ها"]') }],
      ['withdrawals', async () => go(page, '/withdrawals')],
      ['users search', async () => go(page, '/users')],
      ['tickets', async () => go(page, '/tickets')],
      ['ledger', async () => go(page, '/ledger')],
      ['staff', async () => go(page, '/staff')],
      ['access manager', async () => go(page, '/access')],
      ['security policy', async () => go(page, '/security')],
      ['audit log', async () => go(page, '/audit')],
    ]
    for (const [name, step] of scenes) {
      await step()
      await page.waitForTimeout(300)
      await page.evaluate(axeSource)
      const result = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }))
      // Every finding fails the run: the screens are clean today and should stay that way.
      const bad = result.violations
      if (bad.length) fail(`${scheme}: ${name}`, bad.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(' ')}`).join('\n       '))
      else pass(`${scheme}: ${name}`)
    }
    await page.close()
  }
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
    await page.goto(`${BASE}/sign-in`)
    await page.waitForSelector('#email')
    await page.evaluate(axeSource)
    const r = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }))
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    bad.length ? fail('sign-in', bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join('\n       ')) : pass('sign-in')
  }

  /* 3. Phone width: the page body must never scroll sideways. */
  console.log('Phone width (390 px)')
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage()
    await signIn(page, 'ali@exchange.example')
    for (const h of ['/', '/currencies', '/withdrawals', '/tickets', '/staff']) {
      if (h !== '/') await page.goto(`${BASE}${h}`).catch(() => {})
      if (h !== '/') await signIn(page, 'ali@exchange.example') // a reload signs out: the token is in memory
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      over > 1 ? fail(`no horizontal scroll at ${h}`, `${over}px wider than the screen`) : pass(`no horizontal scroll at ${h}`)
    }
  }
} finally {
  await browser.close()
  server.close()
}
if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1) }
console.log('\nall e2e checks passed')
