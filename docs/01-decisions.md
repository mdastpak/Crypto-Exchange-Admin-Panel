# 01 - Decisions

## Goals

1. **Security first.** The panel moves money and freezes accounts. Every choice below is judged by what a stolen token, an XSS bug, or a compromised insider could do.
2. **Speed of delivery.** Use a maintained template instead of designing a shell, tables, and forms from scratch.
3. **Faithful to the backend.** The panel never invents rules; it shows what the backend allows and calls what it exposes.

## Decisions

| # | Decision | Why | Alternatives rejected |
| --- | --- | --- | --- |
| D1 | React 19 + TypeScript (strict) + Vite | Chosen by the project owner; fastest build and test loop; no server runtime to secure | Next.js: adds a Node server and SSR surface that a private back-office does not need |
| D2 | Start from the open-source **shadcn-admin** template (MIT: Vite, Tailwind, shadcn/ui, TanStack Router and Table) | Gives a layout shell, sidebar, command palette, data table, and forms. The code is copied into the repository, so we own it and can harden it; there is no runtime UI framework to track | react-admin / Refine: faster CRUD but hide the HTTP layer, which we must control for step-up, sealing, and encryption. Material/Ant templates: heavier, harder to make RTL-correct |
| D3 | TanStack Query for server state, Zustand only for session and UI state | Cache, retries, and invalidation after mutations; a small store for the one thing that must live in memory (the token) | Redux: more code for no gain |
| D4 | Types generated from the backend `docs/swagger.json` | One source of truth; a backend change breaks the build instead of production | Hand-written types drift |
| D5 | i18next with Persian as the only locale for now; no hard-coded UI strings | The owner may add a language later | Adding i18n later means touching every file |
| D6 | Dynamic RBAC: groups, levels, and lookups stored as data and managed by the super admin; enforced by the **backend**; the panel only reads grants | A hidden button is not a control. Staff change, so access must be editable and reviewable without a release | Fixed roles in code; front-end-only checks |
| D9 | Three factors for every administrator (password, email code, TOTP), forced password rotation and reset delay, both configurable | Security is the first goal; a stolen password alone or a SIM/email takeover alone must not be enough | Optional factors |
| D10 | Short access tokens with rotating, session-bound refresh, idle and absolute limits set by the server | A balance between a stolen-token window and daily friction. See [05](05-security.md#sessions) | One long-lived token (the backend today) |
| D7 | Payload encryption is an application-layer envelope on sensitive routes, on top of TLS | See [06-api-contract.md](06-api-contract.md#encrypted-payloads) for its scope and its honest limits | Relying on TLS alone; encrypting everything (cost without matching benefit) |
| D8 | Modules without an API are built against mock data, behind an adapter, and tracked as backend issues | The owner wants the full panel designed now without waiting for the backend | Skipping those modules |

## What the panel is not

- It is not a source of truth. Balances, prices, and limits are always read from the API.
- It does not store secrets. No token, TOTP seed, or key is written to `localStorage`, `sessionStorage`, or IndexedDB.
- It does not implement business rules such as limits or fees. It displays results and validation errors from the backend.

## Open questions

| Question | Needed by |
| --- | --- |
| Is the admin API served on a separate host (`server.admin_listen_addr`) behind a VPN or an IP allow-list in production? The panel's CORS and CSP depend on it | Phase 1 |
| Which identity do ticket agents use: the same admin accounts, or a separate support directory? | Phase 4 |
| Hardware keys (WebAuthn) mandatory for super admin and money-approving groups? The backend has passkeys for users only | Phase 3 |
| "Forced time for password reset" is read as two settings: forced rotation every N days, and a delay before a reset completes. Confirm both are wanted | Phase 1 |
