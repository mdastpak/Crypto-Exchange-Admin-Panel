# Dynamic access control: permission catalog, groups, lookups, and `GET /admin/me`

**Labels:** `type: feature`, `area: admin`, `type: security`, `priority: high`

## Summary

Administrators have one undifferentiated `admin` role. Every administrator can lock the platform, approve withdrawals, and re-seal rows. The super admin must be able to define **groups** and give each one **per-area access levels** (read-only, edit, approve, manage), with the **cross-area lookups** that real work needs (for example, support sees a user's level, KYC state, requests, transactions' state, and system health in masked form). All of it must be data the super admin edits, reviews, and revokes, and the backend must enforce it on every admin route.

Design reference: [panel RBAC document](../04-rbac.md).

## Evidence

- `internal/adminauth/adminauth.go` selects administrators with `WHERE role = 'admin' AND status = 'ACTIVE' AND totp_enabled ...`: the role is a single value.
- `internal/app/admin_routes.go` classifies each changing route only as `RouteChange` or `RouteSensitive` (step-up). There is no notion of who may call it, and read routes are not classified at all.
- `docs/api.md#admin-sign-in`: admin tokens carry `role: admin` and `aud: admin-api`; nothing narrower.
- Admins are created only by `cmd/admin create`; there is no API to list, enable, or change them.
- The panel cannot enforce access itself: any holder of a token can call the API directly.

## Proposal

### 1. Permission catalog (code, versioned)

Defined in code next to the routes, returned by `GET /admin/access/catalog`:

- **Resources** and their **levels**: `none < view < edit < approve < manage`. Each resource lists the levels it supports and what each allows, in a translatable text.
- **Special permissions**: `users:reveal_pii`, `kyc:view_documents`, `ledger:export`, `staff:manage`, `access:manage`.
- **Lookups**: narrow, masked, read-only projections other areas need: `users:lookup`, `kyc:status`, `withdrawals:status`, `transactions:status`, `requests:status`, `system:health`.
- **Requirements**: each `(resource, level)` lists the lookups it needs (for example `tickets:edit` requires `users:lookup`, `kyc:status`, `withdrawals:status`, `requests:status`, `system:health`).
- **Incompatible pairs** (for example preparing and approving the same payout).
- **Constraints** each grant may take: amount ceiling, assigned-only, allowed networks, time window.

Every admin route, **reads included**, declares the `(resource, level)` or lookup it needs in the `adminRoutes` table. A route without a declaration is refused (`403 route_not_classified`), and a test fails.

### 2. Groups and grants (data, edited by the super admin)

- `admin_groups(id, name, description, status, version)`, `admin_group_versions(group_id, version, grants_json, reason, author, approved_by, created_at)`.
- `admin_group_grants(group_id, resource, level, constraints)`; special permissions as their own rows.
- `admin_group_assignments(admin_hk, group_id, expires_at, reason, granted_by, granted_at)`.
- All tables are row-sealed like `users` (`docs/data-protection.md`).
- One fixed system group, `super_admin`, cannot be edited or deleted. Starter templates (catalog, trading, finance analyst, finance manager, support, ticket agent, compliance, auditor) are seeded as ordinary editable groups.

### 3. Enforcement

- Permissions resolve from the database per request (short cache, invalidated on change), **never from a token claim**. A change applies to the next request.
- Missing permission: `403 permission_denied` with `info.required`, audited as a denial.
- Saving a group whose grants miss a required lookup is refused: `422 dependency_missing` listing what is missing. The panel adds them automatically; the API does not.
- Saving incompatible grants: `409 incompatible_grants`.
- Masked lookups return fields flagged `"masked": true`; unmasking is only through the special permission, a step-up, and an audited reveal.
- Existing two-person rules keep working and additionally require that the approver holds the same permission.

### 4. Endpoints

| Route | Permission | Notes |
| --- | --- | --- |
| `GET /admin/me` | any admin | `{hk, email_masked, groups[], grants[], elevated_until, session, policy}` (policy: idle and absolute limits, so the UI shows honest timers) |
| `GET /admin/access/catalog` | `access:manage` | The catalog above |
| `GET /admin/access/groups`, `GET .../{id}`, `GET .../{id}/versions` | `access:manage` | |
| `POST /admin/access/groups`, `PUT .../{id}` | `access:manage`, step-up, **two-person** | Whole grant set, with `reason`; returns `202` with the pending change until a second super admin approves |
| `POST /admin/access/changes/{id}/approve`, `/reject` | `access:manage`, step-up | The requester cannot approve |
| `POST /admin/access/groups/{id}/retire` | `access:manage`, step-up, two-person | Keeps history; no new members |
| `POST /admin/access/preview` | `access:manage` | Body: draft grants. Returns the effective result and the lookups it adds, with no change |
| `GET /admin/access/effective/{admin_hk}` | `access:manage` | Final permissions with the group that grants each |
| `GET /admin/access/review` | `access:manage` | Per administrator: groups, expiry, last use of each permission, unused grants |
| `POST /admin/access/review/{id}/confirm`, `/revoke` | `access:manage`, step-up | Access review decisions, audited |
| `GET /admin/staff`, `POST /admin/staff` | `staff:manage` | List; create an administrator and return an enrolment link for the authenticator, shown once |
| `PUT /admin/staff/{hk}/groups` | `staff:manage`, step-up, two-person | Set of groups with optional `expires_at` and `reason` |
| `POST /admin/staff/{hk}/disable`, `/enable`, `/reset-totp` | `staff:manage`, step-up, two-person for reset | Disable ends sessions; parity with `cmd/admin` |
| `GET /admin/staff/{hk}/sessions`, `DELETE ...` | `staff:manage`, step-up | Parity with `cmd/admin end-sessions` |

### 5. Rules

- Nobody changes their own groups, expiry, or status. At least two active super admins must exist; the last one cannot be disabled or demoted.
- Assignments with `expires_at` end by themselves; the end is audited.
- Every change takes a `reason` (at most 1000 characters), writes before/after to the audit log (`access.group_change`, `access.assignment`, `access.review_confirm`, ...), and emits an outbox event.
- `cmd/admin create` keeps working and creates a super admin.
- Fail closed: if grants cannot be read, sensitive routes refuse.
- When a group changes, the sessions of affected administrators lose their step-up elevation.

## Acceptance criteria

- [ ] Every admin route (reads and changes) declares its permission; the classification test fails for a route without one.
- [ ] Table-driven tests: for each starter group, the routes it can and cannot call.
- [ ] A removed grant gives `403 permission_denied` on the next request, without signing in again.
- [ ] Lookups return masked data only; the support example group can read the six lookups and nothing more.
- [ ] `dependency_missing`, `incompatible_grants`, self-change, last-super-admin, and requester-cannot-approve tests.
- [ ] Group versions, restore as a new change, and expiry of assignments tested.
- [ ] OpenAPI, `docs/api.md`, and `docs/architecture.md` describe the model.
