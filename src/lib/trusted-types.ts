/**
 * Trusted Types (CSP `require-trusted-types-for 'script'`, `trusted-types default`).
 *
 * The browser refuses every assignment to `innerHTML` and similar sinks unless a policy
 * allows it. This default policy allows exactly the strings that our dependencies inject
 * and refuses everything else, so an injected string can never reach a sink. It creates
 * no script and no script URL, so those stay blocked.
 *
 * Radix Select writes this stylesheet with `dangerouslySetInnerHTML`. If a dependency update
 * changes a string, the end-to-end CSP test fails and prints the new one; review it before adding it.
 */
const ALLOWED_HTML = new Set([
  '[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}',
])

export function installTrustedTypes() {
  const tt = (window as unknown as { trustedTypes?: { createPolicy: (name: string, rules: { createHTML?: (s: string) => string }) => unknown } }).trustedTypes
  if (!tt) return
  try {
    tt.createPolicy('default', {
      createHTML: (input: string) => {
        if (ALLOWED_HTML.has(input)) return input
        throw new TypeError('Untrusted HTML refused')
      },
    })
  } catch {
    // A policy named "default" exists already, or the page does not enforce Trusted Types.
  }
}
