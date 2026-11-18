# 05 - Security

## Threat model

| Threat | Example | Primary control |
| --- | --- | --- |
| Stolen admin token | Malware, shared screen, logs | Short token life, refresh rotation with reuse detection, sender binding, two sessions at most, memory-only storage, step-up for sensitive routes, session list with remote end |
| XSS in the panel | A malicious string in a ticket or a currency name | Strict CSP, no `dangerouslySetInnerHTML`, output encoding, no third-party scripts, token in memory (a script can still use it while the page is open: see limits) |
| Phishing of an administrator | Fake panel | Dedicated host, HSTS preload, WebAuthn (planned), "this was not me" style alerts on sign-in |
| Insider abuse | A finance user approves their own withdrawal | RBAC in the backend, two-person rules, reasons required, append-only audit |
| Compromised intermediary | Reverse proxy or WAF that logs bodies | Payload encryption on sensitive routes, log redaction |
| Supply chain | A malicious npm package | Lockfile, pinned versions, bot updates with review, `npm audit` in CI, no install scripts, SBOM |
| Network exposure | The admin API open to the internet | Separate listener and CIDR allow-list on the backend; the panel host is also IP-restricted or behind a VPN |

## Administrator credentials

Every administrator signs in with **three** factors, always, with no per-user opt-out:

1. **Password** (hard policy below).
2. **Email code** (one-time, short-lived, bound to the sign-in attempt).
3. **Authenticator code (TOTP)**.

A hardware security key (WebAuthn) is the planned fourth option and becomes **mandatory for groups that hold `access:manage`, `staff:manage`, or any `approve` level on money** once the backend supports it (open decision in [01](01-decisions.md)).

### Password policy (configurable by the super admin)

| Setting | Default | Notes |
| --- | --- | --- |
| Minimum length | 14 | Hashed with Argon2id; no composition rules, but a strength estimate and a blocklist (common, breached, containing the email or name) |
| History | last 12 passwords cannot be reused | |
| **Forced rotation** `max_age_days` | 90 | Configurable globally and per group (for example 60 for finance). Warning from 14 days before. After expiry the only possible action is changing the password |
| **Forced reset delay** `reset_delay_hours` | 24 | See the reset flow. Configurable, from 0 (off) to 168 |
| Lockout | 5 wrong passwords: 15 minutes, then doubling up to 24 hours; alerts the administrator and the super admins | The answer never says which factor failed |
| Rate limit | Per address and per IP, with the same timing for known and unknown addresses (as the backend does today) | |

### Reset and recovery flow

A password is reset only with all of: a link or code sent to the verified email, a current **TOTP code**, and the **forced delay**:

1. The administrator requests a reset. All sessions of that administrator end at once, and the super admins and the administrator's other channel are notified.
2. After the delay (`reset_delay_hours`), the reset can be completed with the email proof and a TOTP code. During the delay the old password still works only if the request is cancelled; a cancellation link is in the notice.
3. After the reset: every session is ended, **sensitive routes are blocked for `post_reset_hold_hours`** (default 12, configurable), and the event is audited.
4. A lost TOTP is reset only by another super admin through a two-person flow, followed by the same hold. There is no self-service TOTP reset.
5. If the delay is set to 0 by the super admin, the panel shows a persistent warning that resets are immediate.

## Sessions

The goal is a session that is long enough for a working shift and short enough that a stolen or abandoned token is useless quickly. The **server decides**; the browser timers only show the state.

| Control | Default | Range | Notes |
| --- | --- | --- | --- |
| Access token lifetime | 10 min | 5-15 | Short; renewed by a refresh that is bound to the session |
| Idle timeout | 15 min | 5-60, per group | Counted by the server from real requests and from user-input heartbeats (see below). Money groups default to 10, support to 20 |
| Absolute lifetime | 8 h | 1-12 | A shift; never extended. After it the administrator signs in again with all factors |
| Concurrent sessions | 2 | 1-3 | A new sign-in past the limit ends the oldest and notifies |
| Step-up window | 5 min | 1-15, per permission | Critical actions (platform lockdown, reseal, access change) default to 2 min and are single use |
| Re-auth by password | before access changes and PII reveal | | Password plus TOTP, not TOTP alone |
| Warning before expiry | 2 min | | A countdown with "Stay signed in", which needs one real click or key press |
| Post-reset or new-device hold | 12 h | | Sensitive routes closed |

How it works:

- **Refresh with rotation.** The access token is short. A refresh token (HTTP-only, secure, `SameSite=Strict`, scoped to the refresh path, **bound to the session and to a client key**) issues a new access token and a new refresh token on each use. Reuse of an old refresh token ends the session and alerts the super admins. This needs backend requirement 07.
- **Sender binding.** Tokens are bound to the per-session key pair created at sign-in (the same key agreement used for sealed payloads, or DPoP), so a copied token does not work from another browser.
- **Idle is measured honestly.** The panel sends a heartbeat only while the user is really active (pointer, keyboard, or touch in the last minute) and the tab is visible. A background tab, a running timer, or a script does not keep a session alive.
- **Multi-tab.** Tabs share one session state through `BroadcastChannel`: activity in one tab counts for all; a sign-out or expiry closes all. Opening the panel in a second window of the same browser reuses the session; a second browser takes the second session slot.
- **Context change.** A change of IP network or user agent during a session requires a step-up before the next sensitive action, and is alerted.
- **Where it can be used.** Per group, the super admin may restrict sign-in to allowed networks and working hours. Outside them, sign-in is refused with the same generic answer.
- **Visible state.** The header shows the remaining idle time and the step-up time. The sessions page shows device, network, last activity, and a "sign out" for each, and a "sign out everywhere" action.
- **Sign-out clears everything.** In-memory token, cached query data for sensitive routes, and the sealed keys.

The defaults sit in the middle on purpose: 15 minutes of idleness is short enough to limit an unattended screen, an 8-hour shift matches the workday, and the warning plus one-click extension means nobody loses a half-filled form to a surprise logout. Forms keep their draft in memory during the warning window.

## Step-up

Routes that the backend classifies as sensitive answer `403 step_up_required`. The panel opens one dialog asking for a fresh authenticator code (a password too for access changes and PII reveal), calls `POST /admin/step-up`, and retries the original request once. `elevated_until` is shown in the header. After five wrong codes the backend ends the session and the panel returns to sign-in.

## Browser hardening

Served by the web host, not by the application:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; font-src 'self'; connect-src 'self' https://<admin-api-host>;
  manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), clipboard-read=()
Cache-Control: no-store            (on index.html and every API response)
```

Notes on the policy (see `public/_headers` and `deploy/nginx.conf`):

- `script-src 'self'` has no `unsafe-inline` and no `unsafe-eval`: the Phase 1 build was run under this exact policy in a browser with no violations.
- `style-src` still allows inline styles, because the UI library sets style attributes and injects one style element. Moving to nonces is a Phase 5 task. Script execution, the dangerous part, is not affected.
- `require-trusted-types-for 'script'` is not enabled yet; it needs a check of every dependency and is a Phase 5 task.
- Tabs of one browser share the session over a same-origin `BroadcastChannel`: a new tab asks the open tabs for the in-memory token. Nothing is written to disk, but any script of the same origin could ask too, which is one more reason the CSP must stay strict.

Application rules:

- No inline scripts or styles, no `eval`, no CDN, no analytics or third-party widgets.
- User-generated text (ticket bodies, names, reasons) is rendered as text. Rich text, if ever needed, goes through a sanitiser with an allow-list, under Trusted Types.
- External links use `rel="noopener noreferrer"`. Links to explorers are built from a fixed allow-list by network.
- Lists show sensitive values masked (emails, phones, addresses, national ID). Unmasking needs `users:read_pii`, a step-up, and writes an audit event with the reason.
- Copy-to-clipboard of secrets is disabled; addresses can be copied.
- The panel never asks for a TOTP seed after enrolment.
- Dangerous actions use a confirm dialog that repeats the target (for example the currency symbol) and requires a reason.
- Double-submit protection: the submit button is disabled while a mutation is pending, and every mutation carries an `Idempotency-Key` where the backend supports one.

## Logging and errors

- The panel sends no telemetry that contains request bodies, tokens, or user data. Optional error reports contain only the route, the error `code`, and `request_id`.
- Error screens show `code` and `request_id` so support can find the request in the backend log.

## Limits

Encryption in the browser and a memory-only token reduce exposure, but a script running in the page can still call the API with the page's own keys. The controls that actually contain that case are the CSP, Trusted Types, the dependency policy, step-up, two-person rules, and the backend's checks. None of them replaces the others.
