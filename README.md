# Crypto Exchange Admin Panel

The back-office web application for the [Crypto Exchange](https://github.com/mdastpak/Crypto-Exchange) backend.
Staff use it to run currencies and markets, review withdrawals, operate OTC routing, restrict users, lock the platform, and read the audit log.

> **Status: design phase.** This repository holds the specification and an interactive preview. The application is built next, following the roadmap.

| Document | What it covers |
| --- | --- |
| [docs/01-decisions.md](docs/01-decisions.md) | Why this stack and this template, and the decisions behind them |
| [docs/02-architecture.md](docs/02-architecture.md) | Application structure, state, routing, the API layer, mock mode |
| [docs/03-modules-and-api-map.md](docs/03-modules-and-api-map.md) | Every screen mapped to the backend endpoints it uses, and the gaps |
| [docs/04-rbac.md](docs/04-rbac.md) | Roles, permissions, separation of duties |
| [docs/05-security.md](docs/05-security.md) | Threat model, sign-in, step-up, browser hardening |
| [docs/06-api-contract.md](docs/06-api-contract.md) | Envelope, errors, pagination, and encrypted payloads |
| [docs/07-i18n.md](docs/07-i18n.md) | Localisation and RTL rules |
| [docs/08-roadmap.md](docs/08-roadmap.md) | Phases, deliverables, and definition of done |
| [docs/backend-requirements/](docs/backend-requirements/) | The backend work this panel needs, written as issues |

Language of the UI: Persian (RTL) first, with i18n in place from day one so other locales can be switched on later.
