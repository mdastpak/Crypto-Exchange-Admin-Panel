# Crypto Exchange Admin Panel

The back-office web application for the [Crypto Exchange](https://github.com/mdastpak/Crypto-Exchange) backend.
Staff use it to run currencies and markets, review withdrawals, operate OTC routing, restrict users, lock the platform, and read the audit log.

**Status:** Phase 1 (foundation) and Phase 2 (dashboard, currencies and lifecycle, markets and prices, platform controls) are built. See [docs/08-roadmap.md](docs/08-roadmap.md).

| Area | Choice |
| --- | --- |
| Stack | React 19, TypeScript (strict), Vite, Tailwind 4, shadcn/ui, TanStack Router and Query |
| Template | [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT, see `LICENSE-shadcn-admin`), reduced to the layout shell and UI kit |
| Language | Persian (RTL). i18next is in place; adding a language is described in [docs/07-i18n.md](docs/07-i18n.md) |
| Security | Memory-only token, three-factor sign-in, step-up, honest idle timers, strict CSP. See [docs/05-security.md](docs/05-security.md) |

## Run

```bash
pnpm install
pnpm dev          # http://localhost:5173, mock API
pnpm test         # unit and component tests
pnpm lint && pnpm typecheck && pnpm build
```

### Mock mode (default)

`VITE_API_MODE=mock` runs an in-memory API that follows the contracts proposed for the backend ([requirements 01 and 07](docs/backend-requirements/)). Accounts, all with the password `correct horse battery staple`:

| Email | Group |
| --- | --- |
| `ali@exchange.example` | super admin |
| `sara@exchange.example` | support agent |
| `reza@exchange.example` | finance manager |
| `nima@exchange.example` | super admin (the second person for two-person actions) |

Any six digits work for the email code and the authenticator code (`000000` is refused for the authenticator, to try the error). Sessions use the real policy: 15 minutes idle, 8 hours absolute, 10 minute tokens.

### Real backend

Set `VITE_API_MODE=http` and `VITE_API_BASE` (see `.env.example`). The real backend does not have the password step, refresh, groups, or lookups yet; they are tracked in the backend issues linked from [docs/backend-requirements](docs/backend-requirements/).

## Layout

```text
src/
  access/       permission catalog, dependency rules (pure, tested)
  api/          client (envelope, step-up, session end), http transport, mock server
  auth/         session store (memory), step-up, session guard, tab sync
  components/   UI kit, layout, dialogs
  features/     auth, access manager, sessions, dashboard, errors
  i18n/         locales (fa) and setup
  routes/       file-based routes; a route you cannot use renders "not found"
deploy/         nginx example; public/_headers for static hosts
docs/           specification and backend requirements
preview/        the interactive design preview (single HTML file)
```

## Documents

| Document | What it covers |
| --- | --- |
| [docs/01-decisions.md](docs/01-decisions.md) | Why this stack and template |
| [docs/02-architecture.md](docs/02-architecture.md) | Structure, state, API layer, mock mode |
| [docs/03-modules-and-api-map.md](docs/03-modules-and-api-map.md) | Screens mapped to endpoints, and the gaps |
| [docs/04-rbac.md](docs/04-rbac.md) | Dynamic groups, levels, lookups |
| [docs/05-security.md](docs/05-security.md) | Credentials, sessions, browser hardening |
| [docs/06-api-contract.md](docs/06-api-contract.md) | Conventions and encrypted payloads |
| [docs/07-i18n.md](docs/07-i18n.md) | Localisation and RTL rules |
| [docs/08-roadmap.md](docs/08-roadmap.md) | Phases and definition of done |
| [docs/backend-requirements/](docs/backend-requirements/) | Backend work this panel needs |
