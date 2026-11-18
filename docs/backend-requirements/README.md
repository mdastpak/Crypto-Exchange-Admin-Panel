# Backend requirements of the admin panel

Each file is written as an issue for [`mdastpak/Crypto-Exchange`](https://github.com/mdastpak/Crypto-Exchange): a title, the evidence from the backend code and docs, the contract, and acceptance criteria. They are in English because backend agents implement them.

| # | Title | Blocks |
| --- | --- | --- |
| 01 | [Dynamic access control: catalog, groups, lookups, `GET /admin/me`](01-rbac.md) | Production use of the panel, staff and access manager |
| 02 | [Admin user directory and KYC review](02-users-kyc.md) | Users and KYC module |
| 03 | [Admin ledger and finance read API](03-ledger-finance.md) | Ledger and finance module |
| 04 | [Support ticketing service](04-ticketing.md) | Tickets module |
| 05 | [Admin dashboard aggregates](05-dashboard.md) | Dashboard KPIs |
| 06 | [Sealed (encrypted) admin payloads](06-sealed-payloads.md) | Phase 5 hardening |
| 07 | [Admin password, rotation, reset delay, and session policy](07-admin-credentials-sessions.md) | Phase 1 sign-in |

Common rules for all of them are in [06-api-contract.md](../06-api-contract.md#contract-rules-for-the-new-endpoints).

Contract choices that the panel made beyond the issues are in [08-phase4-contract-notes.md](08-phase4-contract-notes.md).
