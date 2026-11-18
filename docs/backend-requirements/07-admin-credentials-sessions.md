# Admin password, forced rotation, reset delay, and session policy

**Labels:** `type: feature`, `type: security`, `area: admin`, `priority: high`

## Summary

Admin sign-in today is an emailed code plus an authenticator code, with one access token and no refresh. Every administrator must also have a **strong password**, with a **forced rotation** and a **configurable delay on password reset**, and sessions must follow a strict, tunable policy: short access tokens, rotating refresh, idle and absolute limits, sender binding, and per-group network and time restrictions. Design reference: [panel security document](../05-security.md).

## Evidence

- `docs/api.md#admin-sign-in`: `POST /admin/auth` and `POST /admin/auth/{uuid}` take an email code and a TOTP code only; "There is no refresh token: administrators sign in again when the token expires".
- Sessions: at most `admin.sessions.max_per_admin` (2); a session lasts as long as its token; step-up window `admin.step_up_minutes` (5).
- Users already have an Argon2id account password with lockout (`PUT /user/password`, `docs/api.md#account-password`); admins have none.
- `cmd/admin` offers `reset-totp`, `disable`, and `end-sessions`; no password and no reset flow exist for admins.

## Proposal

### Sign-in factors

Sign-in needs all three, in order, with identical responses and timing for known and unknown addresses (as today): password, email code, TOTP. No per-user opt-out. WebAuthn for administrators is a follow-up and becomes mandatory for groups with `access:manage`, `staff:manage`, or an `approve` level on money (decision pending).

### Password policy (`admin.password.*`, editable by a super admin with `access:manage`, audited, two-person)

| Setting | Default | Notes |
| --- | --- | --- |
| `min_length` | 14 | Argon2id hash with its own salt, row-sealed. Strength estimate and blocklist (common, breached, contains email or name). No composition rules |
| `history` | 12 | Previous hashes kept; reuse refused |
| `max_age_days` | 90 | Forced rotation; per-group override. A warning is returned from `warn_days` (14) before. Past expiry, the only allowed route is the password change; all others answer `403 password_expired` |
| `reset_delay_hours` | 24 | Range 0-168; `0` disables the delay and the panel warns |
| `post_reset_hold_hours` | 12 | Sensitive routes answer `403 security_hold` after a reset, a new device, or a TOTP reset |
| Lockout | 5 failures: 15 min, doubling to 24 h | Alerts the administrator and the super admins; the answer never says which factor failed |

### Reset flow

1. `POST /admin/auth/password-reset` (always the same answer) sends a link or code to the verified email and, on a real account, ends all sessions of that administrator and notifies the super admins and the administrator.
2. After `reset_delay_hours`, `POST /admin/auth/password-reset/{id}/complete` accepts the email proof, a TOTP code, and the new password. A cancellation link in the notice cancels the request while it waits.
3. Completion ends every session, starts the `post_reset_hold_hours` hold, writes `admin.password_reset` to the audit log, and emails a notice.
4. Lost TOTP: only another super admin through a two-person flow (`POST /admin/staff/{hk}/reset-totp`), followed by the same hold. No self-service TOTP reset.

### Sessions (`admin.sessions.*`, per-group overrides)

| Setting | Default | Range |
| --- | --- | --- |
| `access_token_minutes` | 10 | 5-15 |
| `idle_timeout_minutes` | 15 | 5-60 (money groups 10, support 20) |
| `absolute_lifetime_hours` | 8 | 1-12; never extended |
| `max_per_admin` | 2 | 1-3; a new sign-in past it ends the oldest and notifies |
| `step_up_minutes` | 5 | 1-15; per permission, critical actions 2 and single use |

- **Refresh with rotation:** `POST /admin/auth/refresh` with an HTTP-only, `Secure`, `SameSite=Strict` cookie scoped to that path. Each use issues a new access token and a new refresh token. Reuse of an old refresh token ends the session and alerts the super admins. The refresh token is bound to the session.
- **Sender binding:** the access and refresh tokens are bound to the client key created at sign-in (the key agreement of the sealed-payload issue, or DPoP). A copied token fails from another browser.
- **Idle is server-side:** counted from authenticated requests and from `POST /admin/session/heartbeat`, which the panel sends only while there was real user input in the last minute and the tab is visible. `GET /admin/me` returns `idle_expires_at`, `absolute_expires_at`, and `elevated_until`, so the UI shows true values.
- **Context change:** a change of network (/24 or /48) or user agent requires a step-up before the next sensitive route and raises an alert event.
- **Allowed networks and hours per group:** `admin.groups.<id>.allowed_cidrs` and a weekly time window; outside them sign-in returns the generic failure.
- **Sign-out and termination:** logout, expiry, a group change, disable, and password reset end sessions on every instance at once (the existing session row and blacklist apply).

### Audit events

`admin.password_change`, `admin.password_reset_request`, `admin.password_reset_complete`, `admin.password_reset_cancel`, `admin.password_expired`, `admin.lockout`, `admin.refresh_reuse`, `admin.session_context_change`, `admin.policy_change`, with before/after for policy changes.

## Acceptance criteria

- [ ] Sign-in without any one of the three factors never succeeds; responses and timing are identical for unknown addresses (extend the timing e2e test).
- [ ] Password policy tests: length, blocklist, history, expiry (`403 password_expired`), warning window.
- [ ] Reset tests: delay respected, cancellation, session end, post-reset hold, email proofs, TOTP required, no enumeration.
- [ ] Refresh rotation: reuse detection ends the session; binding rejects a token from another key; behaviour across instances and Redis loss.
- [ ] Idle and absolute limits enforced by the server with a fake clock; heartbeat cannot extend past the absolute lifetime.
- [ ] Policy settings validated at startup and on change; release mode refuses values below the minimum floor (for example `min_length` below 12, `idle_timeout` above 60).
- [ ] `docs/api.md`, `docs/configuration.md`, and OpenAPI updated.
