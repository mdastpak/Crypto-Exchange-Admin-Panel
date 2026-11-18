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

## Phase 2 status

Built against the backend's documented admin API (shapes from `swagger.json`), run in mock mode with the same rules, and covered by 37 tests plus a browser run of the main flows:

- **Dashboard:** tiles for platform state, currencies waiting for approval, price overrides, and markets that are not active; each tile exists only if the administrator may read its source.
- **Currencies:** filtered cursor list, create and edit with the optimistic `version` (a conflict offers a reload), status changes, delete and restore, networks (the contract and decimals of an existing network are locked, as the backend refuses to change them), capability overrides with a note, delisting schedule and cancel, migrations list.
- **Markets and prices:** list, whole-market edit, live reference price (5 s refresh), price override with the 300 bps bound shown before sending, and the override list with approve (never your own) and end.
- **Platform:** status, maintenance and lockdown creation, extend or change the message, and lift, with the two-person flow for withdrawals and trading.

Not verified here: calls against a running backend. The `http` transport and the real shapes follow the documentation, but this session had no backend instance. Run the panel against `docker compose` of the backend and fix any difference before relying on it.

Not in Phase 2: scheduling a migration, delisting settlement and notices views, forms for the less common market fields (`price_band_bps`, `max_leverage`), and the audit link on each detail page (Phase 3 with the audit log).

## Phase 3 status

Built against the documented backend API, run in mock mode with the same rules, and covered by 49 tests plus a browser run of the main flows:

- **Withdrawals:** review queue with status filter, approve (confirmation that repeats amount and destination) and reject (reason).
- **Payouts:** list by status, a detail dialog that shows the destination in the clear (the read is audited), record as paid with a tracking id, or as failed with a reason; a payout is never recorded twice.
- **Restrictions:** per user, create (operation, asset, or account freeze with the warning that sessions end) and lift with a note and version check.
- **Audit log:** filters, cursor paging, and an event dialog with before and after values and the integrity status. Currency and market pages link to it.
- **Integrity:** open or all findings, reseal request and second-administrator approval; the approver sees what the first one pinned, and cannot approve their own request.
- **Venues:** state, snapshot freshness, balances with routability, and reconciliation holds with clear.
- **OTC routing:** rules as versioned JSON with backend field errors, and route explanation.
- **SMS routing:** provider health, auto or manual mode, and an editable order.
- **Dashboard:** tiles for withdrawals in review, submitted payouts, and open integrity findings.

Not verified here: calls against a running backend, as in Phase 2.

Not in Phase 3: the market-data catalog screens (assets, conflicts, jobs, pairs, sources, venues of `/admin/market-data/*`), the delisting settlement and notices views, a structured OTC rule editor, and the user-facing details of a withdrawal (its payouts, history). They move to Phase 4 with the modules that need new backend work.

## Definition of done for any screen

- Permission declared and tested (visible and hidden).
- Strings in `fa` only through `t()`; layout checked in RTL.
- Loading, empty, error, and conflict states exist.
- Sensitive actions: step-up, reason, confirm dialog, audit link.
- Unit and component tests; one end-to-end test of the main flow.
- No `any`, no console output, no new dependency without review.

## Dependencies on the backend

The requirements in [backend-requirements](backend-requirements/) are ordered by what blocks the panel: 01 (roles) blocks Phase 4 and the production use of every earlier phase; 06 (sealed payloads) blocks Phase 5 only.
