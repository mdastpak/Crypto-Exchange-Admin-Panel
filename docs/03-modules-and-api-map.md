# 03 - Modules and API map

Source of the endpoint list: `docs/swagger.json` of the backend (`/api/v1/admin/*`). **Real** means the endpoint exists today. **Mock** means the backend has nothing yet and the panel uses mock data until the linked requirement is implemented.

| # | Module | Screens | Endpoints | Data |
| --- | --- | --- | --- | --- |
| 1 | Sign-in | email, email code, TOTP, sessions, step-up | `POST /admin/auth`, `POST /admin/auth/{uuid}`, `POST /admin/logout`, `GET/DELETE /admin/sessions`, `POST /admin/step-up` | Real |
| 2 | Dashboard | platform state, open integrity findings, pending withdrawals, price health, venue health | `GET /admin/platform`, `GET /admin/integrity/findings`, `GET /admin/withdrawals`, `GET /admin/venues`, `GET /admin/price-overrides` | Real (KPIs on volume and users: Mock, req. 05) |
| 3 | Currencies | list and filters, create, edit with version, delete, restore, release old symbol | `/admin/currencies`, `/{hk}`, `/restore`, `/symbols/{symbol}` | Real |
| 4 | Currency lifecycle | networks, capabilities, delistings (schedule, cancel, notices, settlement, retry), migrations (schedule, cancel, progress, retry) | `/admin/currencies/{hk}/networks`, `/capabilities`, `/delistings`, `/migrations` | Real |
| 5 | Markets and prices | list, edit, reference price, price override with second approval | `/admin/markets`, `/price`, `/price-override`, `/admin/price-overrides` | Real |
| 6 | Withdrawals and payouts | review queue, approve, reject, payouts, record paid or failed | `/admin/withdrawals`, `/admin/payouts` | Real |
| 7 | User restrictions | list, restrict (freeze), lift | `/admin/users/{hk}/restrictions` | Real |
| 8 | Users and KYC | search, profile, verification level, documents, review queue, decisions | none | Mock, req. 02 |
| 9 | Platform control | maintenance, feature lockdowns, schedule, lift with second approval | `/admin/platform`, `/admin/platform/controls` | Real |
| 10 | OTC routing | rules editor with versions, explain a route, venue state, clear holds | `/admin/otc/routing/*`, `/admin/venues` | Real |
| 11 | Market data | assets, conflicts, jobs, runs, pairs, sources, venues | `/admin/market-data/*` | Real |
| 12 | Integrity | findings, reseal request and approval | `/admin/integrity/findings` | Real |
| 13 | Audit log | filtered, paginated, with before/after diff and integrity badge | `GET /admin/audit` | Real |
| 14 | Notifications | SMS provider health, manual order | `/admin/notifications/sms` | Real |
| 15 | Ledger and finance | balances by user, entries, reconciliation, daily reports | none for admins | Mock, req. 03 |
| 16 | Tickets | queue, assignment, replies, internal notes, SLA | none | Mock, req. 04 |
| 17 | Staff | admins, group assignment with expiry, enable and disable, sessions of others, password policy | none (operators use `cmd/admin`) | Mock, req. 01 and 07 |
| 18 | Access manager | permission catalog, groups, matrix editor with dependencies, effective-access preview, versions, access review | none | Mock, req. 01 |
| 19 | Security settings | password and session policy, allowed networks and hours per group | none | Mock, req. 07 |

## Gaps the panel found in the backend

1. **No roles.** The backend has one `admin` role. Dynamic groups, lookups, and the catalog are requirement 01.
2. **No user directory or KYC for admins.** Requirement 02.
3. **No ledger query for admins.** Users read only their own balances. Requirement 03.
4. **No ticketing.** Requirement 04.
5. **No dashboard aggregates.** Requirement 05.
6. **No `GET /admin/me`.** The panel needs the administrator's identity and permissions. Requirement 01.
7. **Admin credentials.** The backend has TOTP and an email code, no password, no refresh, one long token. Requirement 07.
8. **Venue hold clear** should need two administrators (backend issue 521); the panel will follow the backend's `second_approval_required` behaviour.

## Patterns shared by all modules

- **Reason dialog.** Every sensitive change asks for a reason (the backend requires one, up to 1000 characters) and shows what will change before it is sent.
- **Two-person flow.** A request that needs a second administrator shows its state ("waiting for a second approver, requested by X, expires at T"). The requester sees the approve button disabled.
- **Optimistic versions.** Edits send `version`; on `409 version_conflict` the form offers to reload.
- **Unverified rows.** A `409 row_unverified` links to the matching integrity finding.
- **Audit link.** Every detail page links to the audit log filtered by its `target_type` and `target_id`.

## Required level per action (Phase 2)

The panel hides what a group cannot use; the backend must enforce the same table. Levels are from [04-rbac.md](04-rbac.md). Routes marked **S** need a step-up (the backend's `adminRoutes` classification).

| Screen and action | Endpoint | Level |
| --- | --- | --- |
| Currencies list, detail, networks list | `GET /admin/currencies`, `/{hk}`, `/{hk}/networks` | `currencies:view` |
| Create, edit, status, delete, restore | `POST/PUT/DELETE /admin/currencies`, `/restore` | `currencies:edit` |
| Network write | `PUT /admin/currencies/{hk}/networks/{network}` **S** | `currencies:manage` |
| Capability override | `PUT/DELETE /admin/currencies/{hk}/capabilities/{c}` **S** | `currencies:manage` |
| Delisting schedule, cancel | `POST .../delistings`, `.../cancel` **S** | `currencies:manage` |
| Migrations list | `GET .../migrations` | `currencies:view` |
| Markets list and detail | `GET /admin/markets`, `/{base}/{quote}` | `markets:view` |
| Market write | `PUT /admin/markets/{base}/{quote}` **S** | `markets:edit` |
| Reference price, overrides list | `GET .../price`, `GET /admin/price-overrides` | `prices:view` |
| Set or end an override | `POST .../price-override`, `/price-overrides/{id}/end` **S** | `prices:edit` |
| Approve an override (second administrator) | `POST /admin/price-overrides/{id}/approve` **S** | `prices:approve` |
| Platform status and controls | `GET /admin/platform`, `/controls` | `platform:view` |
| Create, change, lift a control | `POST/PATCH /admin/platform/controls`, `/lift` **S** | `platform:manage` |

`markets` and `prices` are resources the panel added to the catalog in Phase 2; requirement 01 lists them.

## Required level per action (Phase 3)

Same convention as above. **S** needs a step-up; **2P** needs a second administrator.

| Screen and action | Endpoint | Level |
| --- | --- | --- |
| Withdrawal review list | `GET /admin/withdrawals` | `withdrawals:view` |
| Approve or reject a withdrawal | `POST /admin/withdrawals/{id}/approve`, `/reject` **S** | `withdrawals:approve` |
| Payout list | `GET /admin/payouts` | `payouts:view` |
| Payout detail (destination in the clear, read is audited), complete, fail | `GET /admin/payouts/{id}`, `POST .../complete`, `.../fail` **S** | `payouts:edit` |
| Restrictions of a user (read) | `GET /admin/users/{hk}/restrictions` | `restrictions:request` |
| Restrict, lift | `POST /admin/users/{hk}/restrictions`, `/{id}/lift` **S** | `restrictions:edit` |
| Audit log | `GET /admin/audit` | `audit:view` |
| Integrity findings | `GET /admin/integrity/findings` | `integrity:view` |
| Reseal request and approval | `POST /admin/integrity/findings/{id}/reseal` **S 2P** | `integrity:approve` |
| Venue state | `GET /admin/venues` | `venues:view` |
| Clear a venue hold | `POST /admin/venues/holds/{id}/clear` **S** (2P planned, backend #521) | `venues:approve` |
| OTC rules read, explain a route | `GET /admin/otc/routing/rules`, `POST .../explain` | `otc:view` |
| OTC rules save | `PUT /admin/otc/routing/rules` **S** | `otc:edit` |
| SMS routing read, save | `GET`/`PUT /admin/notifications/sms` (**S** for PUT) | `notifications:view`, `notifications:edit` |

New resources the panel added to the catalog in Phase 3: `payouts`, `integrity`, `venues`, `otc`, `notifications`. Requirement 01 must list them.

### What Phase 3 had to work around

- **No user lookup.** The restrictions screen takes a user `hk`; searching by email needs requirement 02.
- **The OTC rules editor is JSON**, with the backend's field-path errors shown under it, plus the "explain a route" tool. A structured editor can follow once the rules format settles.
- **Payout destination in the clear** is shown only after an explicit click on a payout, in a dialog that says the read is audited. It is never in a list or a cache that outlives the dialog (`gcTime: 0`).
