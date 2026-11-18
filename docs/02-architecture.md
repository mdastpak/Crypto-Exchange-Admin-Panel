# 02 - Architecture

## Layout

```text
src/
  app/                 shell: providers, router, error boundary, idle timer
  api/
    client.ts          the only place that calls fetch (envelope, errors, step-up, encryption)
    generated/         types generated from the backend swagger.json (do not edit)
    adapters/          one adapter per module: real (HTTP) and mock
  auth/                sign-in flow, in-memory session, step-up dialog, permission hooks
  features/
    dashboard/ currencies/ markets/ prices/ withdrawals/ payouts/
    users/ restrictions/ platform/ otc/ venues/ market-data/
    integrity/ audit/ notifications/ ledger/ kyc/ tickets/ staff/
  components/          shared UI (data table, confirm dialog, reason dialog, money, address)
  i18n/                i18next setup, locale files, formatters
  lib/                 money (decimal strings), dates, masking, crypto helpers
```

Each feature folder holds its routes, queries, forms, and tests. Features import from `components`, `lib`, `api`, and `auth`; never from each other.

## State

| Kind | Where | Notes |
| --- | --- | --- |
| Server data | TanStack Query | Keys are `[module, resource, params]`. A mutation invalidates its module |
| Session (access token, admin identity, permissions, `elevated_until`) | Memory only (Zustand, not persisted) | A page reload signs the administrator out. This is intended |
| UI (theme, table density, sidebar) | `localStorage`, per user, no sensitive values | Reads and writes are wrapped in try/catch |

## The API layer

`api/client.ts` is the single choke point:

1. Adds `Authorization: Bearer`, `X-Request-ID`, `X-Locale`, and a request sequence number.
2. For sealed routes, encrypts the body and decrypts the answer ([06](06-api-contract.md#encrypted-payloads)).
3. Unwraps the envelope `{status, message, code, request_id, info}` into typed data or a typed `ApiError`.
4. On `403 step_up_required`, opens the step-up dialog, calls `POST /admin/step-up`, and retries the request once.
5. On `401` (`token_revoked`, `session_inactive`, `admin_inactive`), clears the session and goes to sign-in.
6. On `409 version_conflict`, surfaces the current version so the form can reload and show the difference.
7. Never logs bodies or tokens; error reports carry only `code` and `request_id`.

Money and quantities are **decimal strings**. They are never parsed to `number`. `lib/money` wraps `decimal.js` for display and comparison.

## Mock mode

`VITE_API_MODE=mock` swaps every adapter for an in-memory implementation with realistic data and the same errors (`step_up_required`, `second_approval_required`, `version_conflict`). Modules whose backend does not exist yet always use the mock adapter and show a visible "Mock data" badge. Switching a module to the real adapter must need no change outside `api/adapters`.

## Routing and permissions

Routes declare the permission they need. A route guard checks it against the permissions returned by `GET /admin/me` (proposed in [backend-requirements](backend-requirements/01-rbac.md)). The sidebar is built from the same table, so a screen that is hidden is also unreachable. Unknown routes and forbidden routes render the same "not found" page.

## Build and delivery

- Static files only, served by a dedicated host with security headers ([05](05-security.md#browser-hardening)).
- Lint, type-check, unit tests (Vitest), component tests (Testing Library), end-to-end tests (Playwright, against mock mode and against the backend's docker compose), and `npm audit` run in CI.
- Dependencies are pinned by lockfile, updated by a bot, and reviewed. No runtime CDN: fonts and scripts are bundled.
