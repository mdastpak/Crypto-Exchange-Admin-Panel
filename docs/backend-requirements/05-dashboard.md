# Admin dashboard aggregates

**Labels:** `type: feature`, `area: admin`, `priority: low`

## Summary

The dashboard needs a few cheap, cached aggregates. Operational state (platform controls, withdrawals waiting, integrity findings, venues, price overrides) already comes from existing endpoints. Business KPIs do not exist.

## Evidence

- `docs/observability.md` lists Prometheus metrics, but an administrator cannot read counts through the API.
- `GET /admin/withdrawals`, `/admin/integrity/findings`, `/admin/venues`, and `/admin/platform` give the operational parts.

## Proposal

`GET /admin/dashboard/summary` (permission `dashboard:read`). Cached for 30 seconds in Redis, computed from PostgreSQL read replicas or materialised rollups; never a full scan on request.

```json
{
  "generated_at": "2026-11-18T09:00:00Z",
  "users": { "total": 12840, "new_24h": 112, "active_24h": 2031, "by_level": {"0": 410, "1": 9800, "2": 2400, "3": 230} },
  "volume": { "currency": "USDT", "otc_24h": "1840213.55", "otc_7d": "10230411.10", "trades_24h": 934 },
  "money": { "deposits_24h": "512000.00", "withdrawals_24h": "398500.00", "pending_withdrawal_review": 7 },
  "fees": { "currency": "USDT", "collected_24h": "7260.11" },
  "support": { "open_tickets": 41, "sla_breaches": 3 },
  "health": { "price_engine": "ok", "venues_stale": 0, "integrity_open": 0, "outbox_dead_letters": 0 }
}
```

Additional series for charts: `GET /admin/dashboard/series?metric=otc_volume|signups|withdrawals&interval=hour|day&from=&to=`, bounded to 90 days.

## Rules

- Each block is computed by its owning package; a failure of one block returns that block as `null` with `errors.<block>` and never fails the whole response.
- Amounts are decimal strings in a stated reporting currency.
- Each block respects permissions (`finance` blocks need `ledger:read`, `support` blocks need `tickets:read`).

## Acceptance criteria

- [ ] Response time under 150 ms from cache and under 1 s cold on the load baseline dataset.
- [ ] Partial failure test (one block unavailable).
- [ ] OpenAPI and docs updated.
