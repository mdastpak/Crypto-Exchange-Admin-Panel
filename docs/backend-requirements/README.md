# Backend requirements of the admin panel

Each file is written as an issue for [`mdastpak/Crypto-Exchange`](https://github.com/mdastpak/Crypto-Exchange): a title, the evidence from the backend code and docs, the contract, and acceptance criteria. They are in English because backend agents implement them.

| # | Title | Blocks |
| --- | --- | --- |
| 01 | [Admin roles, permissions, and `GET /admin/me`](01-rbac.md) | Production use of the panel, staff module |
| 02 | [Admin user directory and KYC review](02-users-kyc.md) | Users and KYC module |
| 03 | [Admin ledger and finance read API](03-ledger-finance.md) | Ledger and finance module |
| 04 | [Support ticketing service](04-ticketing.md) | Tickets module |
| 05 | [Admin dashboard aggregates](05-dashboard.md) | Dashboard KPIs |
| 06 | [Sealed (encrypted) admin payloads](06-sealed-payloads.md) | Phase 5 hardening |

Common rules for all of them are in [06-api-contract.md](../06-api-contract.md#contract-rules-for-the-new-endpoints).
