import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs'
import { extname, join } from 'node:path'

const root = new URL('../dist', import.meta.url).pathname
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }

/** The headers of the first block of public/_headers: the build runs under exactly what production sends. */
export function productionHeaders() {
  const text = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  const block = text.split(/\n(?=\/)/)[0]
  const out = {}
  for (const line of block.split('\n').slice(1)) {
    const m = /^\s+([\w-]+):\s*(.*)$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

export function startServer(port) {
  const headers = productionHeaders()
  const server = createServer((req, res) => {
    let f = join(root, decodeURIComponent(req.url.split('?')[0]))
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(root, 'index.html')
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(f)] ?? 'text/plain' })
    createReadStream(f).pipe(res)
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}
