# 08 - Roadmap

Each phase ends in something that runs against the mock adapters and, where the backend exists, against the real API.

| Phase | Deliverable | Notes |
| --- | --- | --- |
| 0 | Specification and interactive preview (this repository) | Done when the owner approves the design |
| 1 | Foundation (including the three-factor sign-in, password rotation and reset screens, session timers, and the access-manager shell): template import, strict TypeScript, i18n and RTL, API client, generated types, mock adapters, CI, security headers | No feature screens yet. Includes the sign-in with TOTP and the step-up dialog |
| 2 | Core operations with real APIs: dashboard, currencies, lifecycle, markets, prices, platform controls | The highest-value, lowest-dependency screens |
| 3 | Money flow: withdrawals, payouts, restrictions, OTC routing, venues, integrity, audit log, SMS routing, market data | Two-person flows and reasons everywhere |
| 4 | Backend-dependent modules: users and KYC, ledger and finance, tickets, staff and roles | Built on mocks first; switched to real adapters as the backend requirements land |
| 5 | Hardening: sealed payloads, WebAuthn for administrators, accessibility pass, performance budget, penetration test, runbook | |

## Phase 1 status

Done and verified (22 unit and component tests, strict type-check, lint, production build, and a browser run under the strict CSP):

- Template imported (shadcn-admin, MIT) and reduced to the shell; Persian RTL with i18next and a bundled font; no hard-coded UI text outside `src/i18n`.
- API client with envelope handling, session-end handling, and a single step-up dialog shared by concurrent requests; real HTTP transport and a mock server that follows the proposed contracts (requirements 01 and 07).
- Three-factor sign-in with identical failure messages, password reset request with the forced-delay explanation, in-memory token, refresh before expiry, idle and absolute limits, honest heartbeat, warning dialog, and sign-out across tabs.
- Permission model with lookups and automatic dependencies; sidebar and routes built from `/admin/me` grants; the access manager screen (mock).
- CI workflow, security headers for static hosts and nginx.

Not in Phase 1, moved to later phases: the forced password-change screen (needs `403 password_expired` from the backend) and the staff, security-settings, and access-review screens. They need the backend requirements first.

## Definition of done for any screen

- Permission declared and tested (visible and hidden).
- Strings in `fa` only through `t()`; layout checked in RTL.
- Loading, empty, error, and conflict states exist.
- Sensitive actions: step-up, reason, confirm dialog, audit link.
- Unit and component tests; one end-to-end test of the main flow.
- No `any`, no console output, no new dependency without review.

## Dependencies on the backend

The requirements in [backend-requirements](backend-requirements/) are ordered by what blocks the panel: 01 (roles) blocks Phase 4 and the production use of every earlier phase; 06 (sealed payloads) blocks Phase 5 only.
