# 09 - Runbook

How to build, deploy, configure, and operate the panel. Everything here is static: there is no server of ours to patch.

## Build and release

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm lint && pnpm typecheck && pnpm test
pnpm build
pnpm check:bundle        # fails if a size budget is exceeded
pnpm e2e                 # CSP, Trusted Types, accessibility, phone width
```

Release the contents of `dist/`. The build has no source maps. Keep the commit hash and the lockfile with the release.

## Hosting

- Serve `dist/` from a dedicated host name, over TLS 1.3 only. Do not share the origin with any other application: the token and the keys live in this origin's memory.
- Send the headers of `public/_headers` (or `deploy/nginx.conf`) on **every** response, and keep the two files equal. The end-to-end test runs under `public/_headers`.
- Restrict the host by network (VPN or allow-list) as well as the backend's `admin.allowed_cidrs` and `server.admin_listen_addr`.
- `index.html` and API answers are never cached (`Cache-Control: no-store`); `/assets/*` is immutable.
- Add the admin API host to `connect-src`, and the panel's host to the backend's `server.cors.allowed_origins` (an `https://` origin, never `*`).

## Configuration (build time)

| Variable | Meaning |
| --- | --- |
| `VITE_API_MODE` | `mock` (sample data, in-tab) or `http` (the backend) |
| `VITE_API_BASE` | Base URL of the admin API, such as `https://admin-api.example.com/api/v1` |
| `VITE_SEALING` | `off`, `optional`, or `required`. Use `required` once the backend implements sealed payloads |
| `VITE_SEALING_PUBKEY` | JWK (JSON) of the server's long-term signing key; the panel refuses a key agreement not signed by it |

A production build must set `VITE_API_MODE=http`. A build with `mock` shows sample data and accepts any six digits as a code: never deploy it to a public host.

## Rotating the server's signing key (sealed payloads)

1. The backend publishes the new public key alongside the old one.
2. Build the panel with the new `VITE_SEALING_PUBKEY` and release it.
3. The backend switches signing to the new key once the old panel build is out of use (sessions last at most 12 hours, so after that window).

A panel with the wrong pinned key cannot sign in at all; that is the intended failure.

## Dependency updates

- A bot proposes updates; each is reviewed, and CI runs the full set above.
- The CSP lists the **hashes** of four stylesheets that dependencies inject. After an update of the UI libraries, if the e2e job reports a refused stylesheet, check what changed, then update the hash in both header files. If it reports an `Untrusted HTML refused` string, review it before adding it to `src/lib/trusted-types.ts`.
- `pnpm audit --prod` must be clean. Build-only tooling is in `devDependencies`.

## Incidents

| Situation | Action |
| --- | --- |
| An administrator's laptop or token may be stolen | A super admin disables the administrator (ends every session at once) and checks the audit log for that actor. If no super admin is reachable, an operator runs `cmd/admin end-sessions` and `disable` on the backend |
| A super admin is locked out | Another super admin resets their TOTP (two-person). If none can, an operator uses `cmd/admin reset-totp` |
| A malicious script is suspected in the panel | Take the host out of service, redeploy the last good build, rotate the sealing key, end all admin sessions, and review the audit log |
| The CSP report or the e2e job shows a refusal | Do not loosen the policy. Find the source first; it is either a dependency change (see above) or an injection |
| The backend is down | The panel shows errors with the request id and keeps no data. Nothing is lost by waiting |
| Wrong data in a two-person change | Reject it; the requester cannot approve their own change |

## What to monitor

- Failed sign-ins and lockouts (`admin.lockout`), refresh reuse (`admin.refresh_reuse`), and `seal_invalid` or `replay_detected` counts. Several in a row from one session end it.
- Admin actions outside working hours, and access changes (`access.*`).
- Integrity findings and venue holds (they appear on the dashboard).
