# 04 - Roles and permissions

> **The backend enforces roles; the panel only reflects them.** Today the backend has a single `admin` role (`users.role = 'admin'`), so everything below is a **proposal** that needs [backend requirement 01](backend-requirements/01-rbac.md). Until it ships, every administrator can do everything the API allows.

## Model

- A **permission** is `resource:action`, for example `withdrawals:approve`.
- A **role** is a named bundle of permissions. An administrator holds one or more roles.
- The backend checks the permission on every request, from the database, never from a claim in the token. The token may carry role names for display only.
- `GET /admin/me` returns the administrator, roles, and effective permissions, so the panel can hide what is not allowed.
- Sensitive permissions (marked **S**) also need a fresh step-up. Two-person permissions (marked **2P**) need a second administrator who holds the same permission and is not the requester.

## Roles

| Role | Persian title | Purpose |
| --- | --- | --- |
| `super_admin` | سوپر ادمین | Manages staff and roles, platform controls, and everything else. Few people, always with 2FA and a hardware-backed network |
| `catalog_admin` | ادمین ارزها و بازارها | Currencies, networks, markets, market-data catalog |
| `trading_admin` | ادمین معاملات OTC | OTC routing, venues, price overrides |
| `finance_analyst` | کارشناس مالی | Reads withdrawals, payouts, ledger, and reconciliation; prepares reviews; cannot move money |
| `finance_manager` | مدیر مالی | Approves or rejects withdrawals, records payouts, clears venue holds |
| `support_agent` | پشتیبانی | Reads user profiles in masked form, reads restrictions, requests a restriction |
| `ticket_agent` | تیکتینگ | Works the ticket queue, replies, adds internal notes |
| `compliance_officer` | کارشناس KYC و انطباق | Reviews KYC and verification levels, decides restrictions |
| `auditor` | ناظر | Read-only: audit log, integrity findings, reports |

An administrator can hold several roles (for example `support_agent` + `ticket_agent`).

## Permission matrix

`R` read, `W` write, `S` needs step-up, `2P` needs a second administrator. A blank cell is no access.

| Area / permission | super_admin | catalog_admin | trading_admin | finance_analyst | finance_manager | support_agent | ticket_agent | compliance_officer | auditor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard `dashboard:read` | R | R | R | R | R | R | R | R | R |
| Currencies `currencies:read/write` | R W | R W | R | R | R | R | | | R |
| Lifecycle (delist, migrate, capability) `lifecycle:write` | S | S | | | | | | | |
| Networks and markets `markets:write` | S | S | | | | | | | |
| Reference price, overrides `prices:override` | S 2P | | S 2P | | | | | | |
| Withdrawal queue `withdrawals:read` | R | | | R | R | | | R | R |
| Approve or reject `withdrawals:decide` | | | | | S | | | | |
| Payouts `payouts:record` | | | | | S | | | | |
| Users (masked) `users:read` | R | | | R | R | R | R | R | R |
| Users (PII unmasked) `users:read_pii` | | | | | | | | S | |
| Restrictions `restrictions:read/write` | R W S | | | R | R | R, request | | R W S | R |
| KYC review `kyc:review` | | | | | | | | S | |
| Platform controls `platform:write` | S 2P | | | | | | | | |
| OTC routing rules `otc:write` | S | | S | R | R | | | | R |
| Venues, holds `venues:read/clear` | R | | R | R | S 2P | | | | R |
| Market data `marketdata:read/write` | R W | R W | R | | | | | | R |
| SMS routing `notifications:write` | S | | | | | | | | R |
| Ledger `ledger:read` | R | | | R | R | | | | R |
| Tickets `tickets:read/write` | R W | | | | | R | R W | | R |
| Integrity findings `integrity:read` | R | | | | | | | | R |
| Reseal `integrity:reseal` | S 2P | | | | | | | | |
| Audit log `audit:read` | R | R (own area) | R (own area) | R (own area) | R (own area) | | | | R |
| Staff and roles `staff:manage` | S 2P | | | | | | | | |

## Separation of duties

- The person who requests a price override, reseal, lockdown lift, or venue-hold clear cannot approve it. The backend already enforces this for several of these (`second_approval_required`).
- A withdrawal approver cannot approve a withdrawal of their own account (`own_row`-style check).
- Nobody can change their own roles. Granting `super_admin` needs two `super_admin`s.
- `finance_analyst` and `finance_manager` are never combined on one account (the backend refuses the combination).
- Every role change, grant, and denial is written to the audit log.

## How the panel uses it

- The sidebar, buttons, and routes read `permissions` from `GET /admin/me`. A missing permission hides the control.
- Permission errors from the API (`403 forbidden`) are shown as "not allowed for your role", and the permissions are refreshed.
- A role change takes effect at the next request, with no new sign-in, because the backend reads it per request.
