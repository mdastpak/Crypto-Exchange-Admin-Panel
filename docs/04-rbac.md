# 04 - Dynamic roles and permissions

> **The backend enforces access; the panel only reflects it.** The backend has a single `admin` role today, so everything here depends on [backend requirement 01](backend-requirements/01-rbac.md). Until it ships, every administrator can do everything the API allows.

The super admin manages access **as data, from the panel**: create groups, choose what each group can see and do per area, review, and revoke. Nothing about who may do what is fixed in code, except the **permission catalog**, which developers extend when a new feature ships.

## Concepts

| Term | Meaning |
| --- | --- |
| **Resource** | An area of the product: `currencies`, `markets`, `withdrawals`, `users`, `kyc`, `tickets`, `ledger`, `platform`, `otc`, `audit`, `system_health`, ... |
| **Level** | How much a group may do on a resource: `none` < `view` < `edit` < `approve` < `manage`. Each resource declares which levels exist and what they mean |
| **Special permission** | A sensitive capability that is not a level: `users:reveal_pii`, `ledger:export`, `kyc:view_documents`, `staff:manage`, `access:manage` |
| **Lookup view** | A narrow, masked, read-only projection of one resource that other areas need (see below) |
| **Group (role)** | A named set of grants. Created, edited, cloned, and retired by the super admin |
| **Grant** | `(group, resource, level, constraints)` or `(group, special permission)` |
| **Constraint** | Optional limit on a grant: amount ceiling, "only tickets assigned to me", time window, allowed networks |
| **Assignment** | An administrator belongs to one or more groups, optionally with an expiry date |

The **catalog** (resources, levels, special permissions, lookups, dependencies) comes from the backend at `GET /admin/access/catalog`. The panel builds its editor from it, so a new backend feature appears in the editor without a panel release.

## Cross-area needs: lookups and dependencies

Areas depend on each other's data. A support agent who answers a ticket must see the user, the KYC state, the user's withdrawals, and whether the system is healthy; a finance analyst reviewing a withdrawal needs the user's level and KYC state. The catalog solves this without handing out whole areas:

1. A **lookup view** exposes only what other areas need, always masked:

| Lookup | Contents |
| --- | --- |
| `users:lookup` | user id, masked contacts, status, verification level, restrictions flag, created date, country |
| `kyc:status` | case state, level granted, last decision date. No documents, no notes |
| `withdrawals:status` | the user's withdrawals: amount, currency, state, review reason. No destination detail unless `withdrawals:view` |
| `transactions:status` | the user's ledger-level activity and its state, as a read-only timeline |
| `requests:status` | tickets and other requests registered by the user |
| `system:health` | state of platform controls, price engine, venues, queues. Read-only |

2. Each level declares **requirements**. For example `tickets:edit` requires `users:lookup`, `kyc:status`, `withdrawals:status`, `requests:status`, `system:health`. `withdrawals:approve` requires `users:lookup`, `kyc:status`, `system:health`.
3. When the super admin grants a level, the editor **adds the required lookups automatically**, shows them as "required by tickets:edit", and refuses to remove them while the parent grant exists. The backend enforces the same rule: a group with a grant that misses a requirement is rejected (`422 dependency_missing`).
4. The super admin can still **narrow** a lookup (for example hide `transactions:status` from a group) only if no grant of that group requires it. Otherwise the parent grant must change first. This makes the cost of each grant visible.
5. A lookup never grows into the full view silently. Going from `users:lookup` to `users:view` is a deliberate grant.

## Example group: Support agent (editable, not fixed)

| Resource | Level | Why |
| --- | --- | --- |
| `tickets` | `edit` (constraint: assigned or unassigned) | Works the queue |
| `users` | `lookup` | Required by `tickets:edit` |
| `kyc` | `status` | Sees verification level and KYC state |
| `withdrawals`, `transactions`, `requests` | `status` | Sees what the user asked for and in what state |
| `system_health` | `view` | Can tell a user whether an outage exists |
| `restrictions` | `request` | Can ask for a restriction; cannot apply one |

This is a starting template. The super admin may remove `transactions:status` or add `users:view`; the editor shows the effect before saving.

## Starter templates

The backend seeds templates the super admin can clone and change. A template is a suggestion, not a rule.

| Template | Persian title | Starting grants |
| --- | --- | --- |
| Super admin (fixed, cannot be edited or deleted) | سوپر ادمین | Everything, including `access:manage` and `staff:manage` |
| Catalog admin | ادمین ارزها و بازارها | currencies, markets, market data: `edit`; lifecycle: `manage` |
| Trading admin | ادمین معاملات OTC | otc, venues, price overrides: `edit` |
| Finance analyst | کارشناس مالی | withdrawals, payouts, ledger: `view` |
| Finance manager | مدیر مالی | withdrawals, payouts: `approve`; venue holds: `approve` |
| Support agent | پشتیبانی | as in the example above |
| Ticket agent | تیکتینگ | tickets: `edit`; lookups they need |
| Compliance officer | کارشناس KYC و انطباق | kyc: `approve`; users: `view`; `users:reveal_pii` |
| Auditor | ناظر | `view` on everything; no special permissions |

Only the super admin group is fixed. Everything else, including these templates after cloning, is editable.

## The access manager (super admin screen)

- **Groups:** list, create, clone, rename, retire. A retired group keeps history and cannot receive new members.
- **Matrix editor:** rows are resources, columns are levels. Selecting a level shows what it allows in plain language and which lookups it adds. Constraints open in a side panel.
- **Effective access preview:** pick an administrator or a group and see the final list of what they can open and do, and *which group grants each item*.
- **Diff before save:** every change shows added, removed, and auto-added grants. Saving needs a reason and a step-up.
- **Two-person rule:** a change to a group or to who holds `access:manage` or `staff:manage` is applied only after a second super admin approves. The requester cannot approve their own change.
- **Versioning:** every group has numbered versions with author, reason, and diff. A version can be restored (as a new change that needs approval).
- **Assignments:** per administrator, with an optional expiry date and a reason. Temporary access ends by itself.
- **Access review:** a periodic report (default every 90 days, configurable) lists each administrator, groups, last use of each permission, and unused grants. The super admin confirms or revokes; unreviewed assignments are flagged.
- **Break-glass:** none. There is no hidden role. The last super admin cannot be removed; recovery is the operator CLI with an audit event.

## Separation of duties (enforced by the backend)

- The requester of a price override, reseal, lockdown lift, venue-hold clear, or access change cannot approve it. Two of these exist in the backend today (`second_approval_required`).
- A withdrawal approver cannot approve a withdrawal of their own account.
- Nobody changes their own groups, expiry, or status.
- Incompatible grant pairs are declared in the catalog (for example preparing and approving the same payout) and refused at save time (`409 incompatible_grants`).
- Every grant, revoke, denial, and review decision is written to the audit log with a reason.

## How the panel uses it

- `GET /admin/me` returns groups and the effective grants. The sidebar, routes, buttons, and table columns read it; a missing permission removes the control, and a direct URL shows "not found".
- Masked and lookup fields are marked by the API (`"masked": true`), so the UI shows a lock hint rather than guessing.
- A `403 permission_denied` response refreshes the grants and shows "not allowed for your groups".
- A change applies to the next request, with no sign-in, because the backend reads the grants per request.
