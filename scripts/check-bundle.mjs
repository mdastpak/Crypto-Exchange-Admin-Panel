// Performance budget for the production build. Fails when a budget is exceeded.
//   pnpm build && node scripts/check-bundle.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const dir = new URL('../dist/assets/', import.meta.url)
const KB = 1024
// Gzip sizes in bytes. The initial route must stay small; the largest lazy chunk is the access manager.
const budgets = { totalJs: 520 * KB, largestJs: 130 * KB, totalCss: 20 * KB, largestFont: 60 * KB }

const files = readdirSync(dir)
const size = (f) => gzipSync(readFileSync(new URL(f, dir))).length
const js = files.filter((f) => f.endsWith('.js')).map((f) => [f, size(f)])
const css = files.filter((f) => f.endsWith('.css')).map((f) => [f, size(f)])
const fonts = files.filter((f) => f.endsWith('.woff2')).map((f) => [f, readFileSync(new URL(f, dir)).length])
const sum = (a) => a.reduce((n, [, s]) => n + s, 0)
const max = (a) => a.reduce((m, x) => (x[1] > m[1] ? x : m), ['', 0])
const rows = [
  ['total JS (gzip)', sum(js), budgets.totalJs],
  [`largest JS chunk (gzip) ${max(js)[0]}`, max(js)[1], budgets.largestJs],
  ['total CSS (gzip)', sum(css), budgets.totalCss],
  [`largest font ${max(fonts)[0]}`, max(fonts)[1], budgets.largestFont],
]
let bad = 0
for (const [name, got, limit] of rows) {
  const over = got > limit
  if (over) bad++
  console.log(`${over ? 'FAIL' : 'ok  '} ${name}: ${(got / KB).toFixed(1)} KB of ${(limit / KB).toFixed(0)} KB`)
}
process.exit(bad ? 1 : 0)
