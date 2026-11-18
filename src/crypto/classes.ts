/**
 * Which admin routes are sealed. It mirrors the `Sealed` marks of the backend's
 * `adminRoutes` table (requirement 06). A sealed route seals its request body (when
 * it has one) and its response. Transport-level failures stay plain so that
 * intermediaries and the client can act on them.
 */
const SEALED = [
  /^\/admin\/(withdrawals|payouts|users|kyc|tickets|ledger|reports|staff|security|otc|notifications)(\/|$)/,
  /^\/admin\/access\/(groups|changes)/,
  /^\/admin\/platform\/controls/,
  /^\/admin\/markets\/[^/]+\/[^/]+\/price-override/,
  /^\/admin\/price-overrides/,
]

export const isSealedRoute = (path: string) => SEALED.some((r) => r.test(path.split('?')[0]))

/** Failures that stay plain on a sealed route. A `403` stays plain because the client acts on `step_up_required`. */
export const staysPlain = (status: number) => status === 401 || status === 403 || status === 404 || status === 415 || status === 429 || status >= 500
