# 05 - Security

## Threat model

| Threat | Example | Primary control |
| --- | --- | --- |
| Stolen admin token | Malware, shared screen, logs | Short token life, two sessions at most, memory-only storage, step-up for sensitive routes, session list with remote end |
| XSS in the panel | A malicious string in a ticket or a currency name | Strict CSP, no `dangerouslySetInnerHTML`, output encoding, no third-party scripts, token in memory (a script can still use it while the page is open: see limits) |
| Phishing of an administrator | Fake panel | Dedicated host, HSTS preload, WebAuthn (planned), "this was not me" style alerts on sign-in |
| Insider abuse | A finance user approves their own withdrawal | RBAC in the backend, two-person rules, reasons required, append-only audit |
| Compromised intermediary | Reverse proxy or WAF that logs bodies | Payload encryption on sensitive routes, log redaction |
| Supply chain | A malicious npm package | Lockfile, pinned versions, bot updates with review, `npm audit` in CI, no install scripts, SBOM |
| Network exposure | The admin API open to the internet | Separate listener and CIDR allow-list on the backend; the panel host is also IP-restricted or behind a VPN |

## Sign-in (matches the backend)

1. Email -> `POST /admin/auth`. The answer is identical for known and unknown addresses; the UI must not hint otherwise.
2. Email code and authenticator code -> `POST /admin/auth/{uuid}` -> access token. Persian and Arabic-Indic digits are accepted by the backend; the field accepts them too.
3. The token lives in memory. **There is no refresh token.** When it expires the administrator signs in again. The panel warns two minutes before expiry and offers a re-sign-in without losing the page state.
4. Idle timeout: the panel calls `POST /admin/logout` after the configured idle time (default 15 minutes) and clears memory. A page reload also signs out.
5. The sessions page lists the administrator's sessions and ends any of them.

## Step-up

Routes that the backend classifies as sensitive answer `403 step_up_required`. The panel opens one dialog asking for a fresh authenticator code, calls `POST /admin/step-up`, and retries the original request once. `elevated_until` is shown in the header so the administrator knows when the elevation ends. After five wrong codes the backend ends the session and the panel returns to sign-in.

## Browser hardening

Served by the web host, not by the application:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self' https://<admin-api-host>;
  frame-ancestors 'none'; base-uri 'none'; form-action 'self'; require-trusted-types-for 'script'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), clipboard-read=()
Cache-Control: no-store            (on index.html and every API response)
```

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
