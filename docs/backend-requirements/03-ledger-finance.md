# Admin ledger and finance read API

**Labels:** `type: feature`, `area: admin`, `area: ledger`, `priority: medium`

## Summary

Finance staff must see balances, ledger entries, and reconciliation results for any user and for the exchange's own accounts. Today users read only their own balances (`GET /user/balances`, `GET /user/transactions`), and reconciliation runs through `admin ledger reconcile` (CLI) and metrics.

## Evidence

- `README.md` "Ledger" row: hourly audit snapshots and reconciliation exist, "No public write API", users read their own history only.
- `cmd/admin/ledger.go` implements `ledger reconcile`; no HTTP equivalent in `docs/swagger.json`.
- Withdrawal review (`GET /admin/withdrawals`) shows a withdrawal but not the user's balances or history that a reviewer needs.

## Proposal (read-only; there is no admin write path to the ledger)

| Route | Permission | Notes |
| --- | --- | --- |
| `POST /admin/ledger/balances/query` | `ledger:read` | `{user_hk?, currency_hk?, account?, limit, cursor}`; every balance with `verified` (row-seal state) |
| `POST /admin/ledger/entries/query` | `ledger:read` | Keyset pages over entries with `kind`, `reference`, `idempotency_key`, `currency`, `postings[]`, `created_*` filters |
| `GET /admin/ledger/entries/{id}` | `ledger:read` | One entry with all postings and their sum check |
| `GET /admin/ledger/house-accounts` | `ledger:read` | Custody, fees, inventory, pending-deposit accounts per currency, with balances |
| `GET /admin/ledger/reconciliation/runs` | `ledger:read` | Past runs, result, differences by currency, duration |
| `GET /admin/ledger/reconciliation/runs/{id}` | `ledger:read` | Detail and per-balance replay mismatches |
| `POST /admin/ledger/reconciliation/run` | `ledger:reconcile`, step-up | Start a run now (parity with the CLI); at most one at a time |
| `GET /admin/reports/daily` | `ledger:read` | Per day and currency: deposits, withdrawals, fees collected, OTC volume, inventory change |
| `POST /admin/reports/export` | `ledger:export`, step-up | Asynchronous CSV export with a reason; the file is encrypted and downloaded once with a signed URL; audited |

## Rules

- Amounts are decimal strings with the currency's precision. No floats.
- A balance or entry that fails its row seal is returned with `verified=false` and links to its integrity finding instead of being hidden.
- Queries need a time range or a user to bound them; the maximum `limit` is 200.
- Reading another user's ledger is audited (`admin.ledger_read` with filters, not rows) and rate-limited.
- Exports contain no unmasked PII.

## Acceptance criteria

- [ ] Each filter is backed by an index (check `EXPLAIN` in tests as `GET /user/transactions` does).
- [ ] Postings of every returned entry sum to zero per currency (asserted in tests).
- [ ] Unverified rows are surfaced, not dropped, and tested.
- [ ] Permissions enforced per route; audit events written for reads of user ledgers and for exports.
- [ ] OpenAPI and docs updated.
