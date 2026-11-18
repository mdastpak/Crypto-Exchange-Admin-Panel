# Contract notes from Phase 4

The panel's mock server (`src/api/mock/`) is the executable form of requirements 01 to 05 and 07. Where an issue left a detail open, the mock chose one. This page lists those choices so the backend can follow them or answer differently; a different answer changes the mock, not the screens.

## Cross-area lookups (requirement 01 and 02)

- `GET /admin/users/{hk}/lookup` returns one object with these optional blocks: `user`, `kyc`, `withdrawals`, `transactions`, `requests`, `system_health`. **A block is absent when the caller lacks its lookup grant** (`users:lookup`, `kyc:status`, `withdrawals:status`, `transactions:status`, `requests:status`, `system_health:view`). The panel draws only the blocks it receives; an empty object means "no access to any".
- Lists of users are `POST /admin/users/query` with a body, never a query string. Email and mobile match exactly (blind index); there is no prefix or substring search.
- `POST /admin/users/{hk}/reveal` returns `{values, audited: true}` and needs the special permission `reveal_pii`, a step-up, and a reason. The panel shows values for 30 seconds and does not cache them.

## Two-person changes (requirements 01 and 07)

- A change that needs a second administrator answers `202` with a **pending change**: `{id, kind, summary, requested_by, requested_at, reason, status}`. Kinds: `group_change`, `group_create`, `staff_create`, `staff_groups`, `staff_reset_totp`, `policy_change`.
- `GET /admin/access/changes` lists them; `POST /admin/access/changes/{id}/approve` and `/reject` decide. The requester gets `403 second_approval_required`; a decided change gets `409 already_resolved`.
- Approving applies the change in the same transaction and records `approved_by` on the new group version.
- Immediate (single-person) staff actions: disable and enable. Both end the sessions of that administrator, refuse the caller's own account (`403 self_change`), and refuse to leave fewer than two active super admins (`409 last_super_admin`).
- Incompatible groups are refused at assignment: `409 incompatible_grants` (the mock lists `finance_analyst` with `finance_manager`).

## Ledger (requirement 03)

- Balance and entry queries are `POST`, and **need a bound**: a user or a currency for balances; a time range, a user, or a reference for entries. An unbounded query answers `400 validation_failed`.
- A balance whose row seal fails is returned with `verified: false`; an entry whose postings do not sum to zero is returned with `balanced: false`. Neither is hidden.
- `POST /admin/ledger/reconciliation/run` answers `202` with the new run (`result: running`) and `409 conflict` while one runs.

## KYC and tickets (requirements 02 and 04)

- A KYC decision needs the case to be claimed by the caller (`409 conflict` otherwise), and a closed case (`approved`, `rejected`) refuses further decisions.
- Document access is its own special permission (`kyc_documents`), needs a step-up, and each read is audited; the response is a short-lived signed URL, not bytes.
- An internal ticket note never changes the ticket status and is never sent to the user. Ticket lists are `POST /admin/tickets/query`.

## Sign-in and password (requirement 07)

- `POST /admin/auth/verify` returns `password_expired: true` when the password is past `max_age_days`. Until `POST /admin/auth/password-change` succeeds, every route except `/admin/me`, `/admin/logout`, and the heartbeat answers `403 password_expired`.
- A disabled administrator gets the same `401 code_invalid` as a wrong code.

## New resources in the catalog

`ledger`, `staff`, `security` (levels `none`, `view`, `manage` or `edit`), and the special permissions `reveal_pii` and `kyc_documents` (levels `none`, `allow`).
