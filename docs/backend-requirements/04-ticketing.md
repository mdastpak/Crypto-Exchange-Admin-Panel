# Support ticketing service

**Labels:** `type: feature`, `area: support`, `priority: medium`

## Summary

Support and ticket agents need a queue to answer users. The backend has no ticket model. This issue defines a minimal service: a user opens and replies to tickets; agents triage, reply, and keep internal notes.

## Evidence

- No `ticket` table, package, or route in `internal/`, `docs/swagger.json`, or `docs/architecture.md`.
- The panel plan lists a ticketing role (`ticket_agent`) and a tickets module.
- Existing building blocks to reuse: outbox events, email and SMS notification queue, i18n catalogs, audit log, and field encryption for message bodies.

## Proposal

### User side (for the exchange app)

| Route | Notes |
| --- | --- |
| `POST /user/tickets` | `{subject, category, body, attachments?}`; rate-limited |
| `GET /user/tickets`, `GET /user/tickets/{id}` | Own tickets and public messages only |
| `POST /user/tickets/{id}/messages` | Reply; reopens a solved ticket within 7 days |
| `POST /user/tickets/{id}/close` | |

### Admin side

| Route | Permission | Notes |
| --- | --- | --- |
| `POST /admin/tickets/query` | `tickets:read` | `{status, category, priority, assignee, user_hk, sla_state, created_*, text?, limit, cursor}` |
| `GET /admin/tickets/{id}` | `tickets:read` | Ticket, messages (public and internal), user summary (masked), related withdrawals or restrictions |
| `POST /admin/tickets/{id}/claim` / `assign` | `tickets:write` | Self or another agent |
| `POST /admin/tickets/{id}/messages` | `tickets:write` | `{body, internal: bool, attachments?}`; a public message notifies the user |
| `POST /admin/tickets/{id}/status` | `tickets:write` | `open`, `pending_user`, `pending_internal`, `solved`, `closed` |
| `PUT /admin/tickets/{id}/priority`, `/category` | `tickets:write` | |
| `GET /admin/tickets/stats` | `tickets:read` | Backlog, first-response and resolution times, SLA breaches, per agent |
| `GET/PUT /admin/tickets/macros` | `tickets:write` / `staff:manage` | Canned replies per locale |

### Rules

- Bodies are encrypted with the field key; search is by metadata and a blind-indexed `user_hk`, not by full-text on bodies in v1.
- Attachments: type allow-list, size cap, antivirus scan, stored encrypted, served only through short-lived signed URLs, never rendered inline.
- Message text is plain text or a restricted Markdown subset; the API never returns HTML.
- Agents never see unmasked PII in a ticket unless they hold `users:read_pii`.
- Never put secrets or full card numbers in a ticket: a detector masks card-like and key-like strings on write and warns.
- SLA targets per category and priority are configurable; breaches are exposed in the stats and emitted as events.
- Every state change, assignment, and internal note read by another role is audited.

## Acceptance criteria

- [ ] A user can never read an internal message or another user's ticket (tests per route).
- [ ] Concurrent claim and status changes are safe (`409` with the current state).
- [ ] Public replies enqueue a notification in the user's locale through the existing queue.
- [ ] Attachment handling tests: wrong type, oversize, scan failure, expired URL.
- [ ] OpenAPI, docs, migrations, and metrics (backlog, SLA breaches) added.
