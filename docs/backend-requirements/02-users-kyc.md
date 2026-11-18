# Admin user directory and KYC review

**Labels:** `type: feature`, `area: admin`, `area: kyc`, `priority: high`

## Summary

Support and compliance staff cannot find a user or see their verification state through the API. Today only `admin verification grant` (CLI) changes a level, and the only user-facing admin route is the restrictions list. The panel needs a masked, searchable directory, a profile view, and a KYC review queue.

## Evidence

- `README.md` status table: "Custody, KYC/AML services - Planned"; "Verification levels - Partial ... until then, an operator grants them with the audited `admin verification grant`".
- `docs/swagger.json` has `/admin/users/{hk}/restrictions` but no route to find or read a user.
- Contacts and names are stored encrypted and found by blind indexes (`docs/data-protection.md#field-encryption`), so search must use blind indexes, never decrypt-and-scan.

## Proposal

| Route | Permission | Notes |
| --- | --- | --- |
| `POST /admin/users/query` | `users:read` | Body `{email?, mobile?, hk?, status?, level?, created_from?, created_to?, limit, cursor}`. Email and mobile match exactly through the blind index. Returns masked rows. Uses `POST` so identifiers stay out of URLs and logs |
| `GET /admin/users/{hk}` | `users:read` | Masked profile: status, level, created, last sign-in, contacts masked (`a***@example.com`), country, security hold, counts of sessions and restrictions, flags |
| `POST /admin/users/{hk}/reveal` | `users:read_pii`, step-up | Body `{fields: ["email","mobile","national_id","name"], reason}`. Returns the plaintext once, audited `admin.user_reveal` with the fields, not the values |
| `GET /admin/users/{hk}/verification` | `users:read` | Level, what it allows, limits remaining (reuse `GET /user/verification` logic), history of level changes |
| `GET /admin/users/{hk}/activity` | `users:read` | Sign-ins and security events (from the audit log), paginated |
| `GET /admin/kyc/cases` | `kyc:review` | Queue: `status` (`pending`, `in_review`, `approved`, `rejected`, `needs_info`), `level_requested`, `assigned_to`, `created_*`, paginated |
| `GET /admin/kyc/cases/{id}` | `kyc:review` | Case with documents list (metadata only), automated check results (identity provider results from #158), notes |
| `GET /admin/kyc/cases/{id}/documents/{doc}` | `kyc:review`, step-up | Short-lived signed URL or streamed bytes; every view audited |
| `POST /admin/kyc/cases/{id}/claim` | `kyc:review` | Assign to self |
| `POST /admin/kyc/cases/{id}/decision` | `kyc:review`, step-up | `{decision: approve|reject|needs_info, level?, reason, checklist}`; approving sets the level through the existing audited path; the reviewer cannot be the user |
| `POST /admin/users/{hk}/verification/level` | `kyc:review`, step-up, two-person for levels above 2 | `{level, reason}`; replaces the CLI for routine use |

User status changes stay in the restrictions API; this issue adds no other write to a user.

## Rules

- Lists and profiles never contain plaintext PII. `reveal` is the only path and is rate-limited per administrator.
- Documents are stored encrypted with the field key; never returned inline in JSON.
- A KYC decision is one transaction: update case, set level, write audit and outbox events.
- `own_row`: an administrator cannot review or reveal their own account.

## Acceptance criteria

- [ ] Search by email or mobile uses blind indexes; a test proves no plaintext column is read.
- [ ] Masking is applied in the API layer by default and covered by tests for each field.
- [ ] `reveal` and document views are audited and rate-limited.
- [ ] Decision flow tested: approve, reject, needs info, concurrent decision (`409`), self-review refused.
- [ ] OpenAPI and `docs/api.md` updated; error codes registered.
