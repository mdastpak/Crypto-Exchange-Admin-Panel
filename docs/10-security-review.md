# 10 - Security review

What the panel does, what it does not do, and what an outside tester should look at. This is a self-assessment and the brief for a penetration test; it is not a substitute for one.

## Controls and where they are checked

| Control | Where | Checked by |
| --- | --- | --- |
| Token only in memory; nothing in storage or cookies | `src/auth/session-store.ts` | A test reads `localStorage`, `sessionStorage`, and `document.cookie` after sign-in |
| Three-factor sign-in with one failure message | `features/auth/sign-in.tsx` | Test: wrong password and unknown account give the same text |
| Short tokens, rotating refresh, honest idle timer, absolute limit | `auth/use-session-guard.ts` | Fake-clock tests of idle, absolute limit, heartbeat, refresh |
| Step-up shared by concurrent requests | `auth/step-up-store.ts`, `api/client.ts` | Client tests |
| Permissions hide what is unavailable; a direct URL looks like "not found" | `auth/guard.ts` | Route guards on every screen; backend enforcement is requirement 01 |
| Two-person approvals shown and enforced by the requester check | pending changes, price overrides, lifts, reseal | Mock tests (the backend must enforce them) |
| Sealed payloads, signed key agreement, replay and downgrade detection | `src/crypto/`, `api/client.ts` | OpenSSL known-answer vectors and 27 tests on tampering, replay, and downgrade |
| CSP without `unsafe-inline` for scripts or style elements | `public/_headers` | `pnpm e2e` runs every screen under it |
| Trusted Types with a one-string allow-list | `lib/trusted-types.ts` | `pnpm e2e` (any refusal fails the run) |
| No third-party script, font, or analytics | `index.html`, bundle | CSP `default-src 'none'`; fonts are bundled |
| Text from users is shown as text | tickets, reasons, names | React escaping; no `dangerouslySetInnerHTML` in our code |
| PII masked by default; reveal needs a permission, a step-up, and a reason; values vanish after 30 s | `features/users/reveal-dialog.tsx` | Mock tests and the dialog |
| Payout destination only on explicit open, not cached | `features/withdrawals/payouts-page.tsx` | `gcTime: 0`; backend audits the read |
| Cached data dropped when the session ends | `main.tsx` | `queryClient.clear()` on sign-out |
| Accessibility, phone width, performance budget | `e2e/`, `scripts/` | CI |

## Residual risks

1. **A script that runs in the page can use the session.** The CSP, Trusted Types, and the dependency policy make that hard; they do not make it impossible. Sealed payloads do not help here, because the page holds the key. The controls that limit the damage are step-up, two-person approval, short sessions, and the backend's own checks.
2. **A compromised dependency.** Lockfile, no install scripts, reviewed updates, audit in CI, and a CSP that blocks outbound connections to any host not listed. A malicious package could still misuse the connection to the admin API.
3. **A malicious browser extension** can read the page. Use a dedicated browser profile for administrators.
4. **The mock build.** It accepts any six digits. It must never be deployed publicly (see the runbook).
5. **Not run against the real backend.** Shapes follow its documentation; differences are likely and are tracked as work, not as accepted risk.
6. **`style-src-attr 'unsafe-inline'`.** Style attributes are allowed because the UI library sets them. They cannot run script.

## <a id="webauthn"></a>WebAuthn for administrators (not built)

Wanted for the super admin and every group with an `approve` level on money. It is not in the panel because a browser-only version would verify nothing: the signature check, the stored credentials, and the binding to the session are the backend's. What the backend needs:

1. Registration: `POST /admin/webauthn/register/options` and `/verify`, requiring a step-up and a second administrator's approval for the first key.
2. Sign-in: an assertion as a fourth factor (or a replacement for TOTP in the strictest groups) in `POST /admin/auth/verify`, with `userVerification: required` and the origin and RP id pinned.
3. Policy: "a hardware key is mandatory" per group, and a recovery path that needs two super admins.

The panel side is small once those exist: `navigator.credentials.create` and `get`, base64url conversion, and one screen to manage keys. It will be built against the backend's contract.

## Scope for a penetration test

In scope, against a staging backend with the panel built with `VITE_API_MODE=http` and `VITE_SEALING=required`:

- Sign-in, lockout, password reset and its delay, password expiry, and session handling (idle, absolute, refresh reuse, concurrent sessions, tab behaviour).
- Step-up bypass attempts on every sensitive route; two-person bypass (same person, two sessions, two accounts of one person).
- Authorisation: every route with every group, direct object access by id, and the lookup blocks (does a group ever receive data its grants do not allow).
- Sealed payloads: replay, reordering, downgrade, key substitution, error oracles, and behaviour across instances.
- Front-end: XSS through ticket text, reasons, names, audit values, and URLs; CSP and Trusted Types bypass; clickjacking; open redirects; storage leaks; source maps and debug output.
- Data exposure: PII in URLs, logs, caches, error screens, and the browser history; the reveal dialog and the payout detail.
- Supply chain: lockfile integrity and the build pipeline.

Out of scope: the exchange's user-facing application, the infrastructure of the host, and denial of service.

## Report template

| Id | Title | Area | Severity | Steps to reproduce | Evidence | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
