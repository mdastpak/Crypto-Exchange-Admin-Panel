# Admin roles, permissions, and `GET /admin/me`

**Labels:** `type: feature`, `area: admin`, `type: security`, `priority: high`

## Summary

Administrators have one undifferentiated `admin` role. Every administrator can lock the platform, approve withdrawals, and re-seal rows. The admin panel needs finer roles (super admin, section admins, finance analyst, finance manager, support, ticketing, compliance, auditor), enforced by the backend on every admin route.

## Evidence

- `internal/adminauth/adminauth.go` selects administrators with `WHERE role = 'admin' AND status = 'ACTIVE' AND totp_enabled ...`: the role is a single value.
- `internal/app/admin_routes.go` classifies each changing route only as `RouteChange` or `RouteSensitive` (step-up). There is no notion of who may call it.
- `docs/api.md#admin-sign-in`: admin tokens carry `role: admin` and `aud: admin-api`; nothing narrower.
- Admins are created only by `cmd/admin create`; there is no API to list, enable, or change them.
- The panel cannot enforce roles itself: any holder of a token can call the API directly, so front-end checks are not a control.

## Proposal

### Data model

- `admin_roles(id, name, description, system bool)`; seeded system roles: `super_admin`, `catalog_admin`, `trading_admin`, `finance_analyst`, `finance_manager`, `support_agent`, `ticket_agent`, `compliance_officer`, `auditor`.
- `admin_role_permissions(role_id, permission)`, where a permission is `resource:action` (list in the [panel RBAC matrix](../04-rbac.md)).
- `admin_role_assignments(admin_hk, role_id, granted_by, granted_at)`.
- All three tables are row-sealed like `users` (see `docs/data-protection.md`).

### Enforcement

- Extend the `adminRoutes` table with the required permission per route. A route without a permission is refused (`403 route_not_classified`), and a test fails, as today for classification.
- The permission is resolved from the database per request (cached briefly, invalidated on change), **never from a token claim**. A role change applies to the next request.
- Return `403 permission_denied` with `info.required` for a missing permission. Audit the denial (`outcome=denied`).
- Incompatible roles are refused at assignment: `finance_analyst` with `finance_manager`.
- Two-person rules already in place keep working and additionally require that the approver holds the permission.

### Endpoints

| Route | Permission | Notes |
| --- | --- | --- |
| `GET /admin/me` | any admin | `{hk, email_masked, roles[], permissions[], elevated_until, session}` |
| `GET /admin/staff` | `staff:manage` | Paginated list with roles and status |
| `POST /admin/staff` | `staff:manage`, step-up, two-person | Create an administrator (replaces the operator-only `create` for day-to-day use); returns an enrolment link for the authenticator, shown once |
| `PUT /admin/staff/{hk}/roles` | `staff:manage`, step-up, two-person | Whole set of roles, with `reason`; granting `super_admin` needs two `super_admin`s |
| `POST /admin/staff/{hk}/disable`, `/enable` | `staff:manage`, step-up | Ends the sessions on disable |
| `POST /admin/staff/{hk}/reset-totp` | `staff:manage`, step-up, two-person | Parity with `cmd/admin reset-totp` |
| `GET /admin/staff/{hk}/sessions`, `DELETE ...` | `staff:manage`, step-up | Parity with `cmd/admin end-sessions` |
| `GET /admin/roles` | `staff:manage` | Roles with their permissions (read-only for system roles) |

### Rules

- Nobody changes their own roles or status.
- The last `super_admin` cannot be disabled or demoted.
- Every change takes a `reason`, is audited (`admin.role_grant`, `admin.role_revoke`, `admin.staff_create`, `admin.staff_disable`, ...), and emits an outbox event.
- `cmd/admin create` keeps working and creates a `super_admin`.

## Security considerations

- Fail closed: if the permission store cannot be read, sensitive routes refuse.
- A downgraded administrator keeps no elevation: end their step-up when roles change.
- Rate-limit and audit `GET /admin/me` like other admin routes.

## Acceptance criteria

- [ ] Every route in `adminRoutes` has a permission; the classification test fails for a route without one.
- [ ] For each system role, a table-driven test proves which routes it can and cannot call.
- [ ] A token of an administrator whose role was removed gets `403 permission_denied` on the next request, without signing in again.
- [ ] Separation-of-duties tests: self role change, last super admin, incompatible roles, requester cannot approve.
- [ ] OpenAPI, `docs/api.md`, and `docs/architecture.md` describe the model; the panel's [RBAC matrix](../04-rbac.md) is reconciled with the final permission names.
