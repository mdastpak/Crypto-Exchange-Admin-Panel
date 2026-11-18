# 06 - API contract

The panel follows the backend conventions in its `docs/api.md`. This page restates what the panel depends on and defines what is **new**: contracts for the missing modules, and the encrypted envelope.

## Conventions the panel relies on

- Base path `/api/v1/admin/...`, `Authorization: Bearer <admin access token>`.
- Envelope `{status, message, code?, request_id?, info?}`. The payload is in `info`. Errors carry a stable `code` and the details in `info`.
- Validation errors: `400 validation_failed` with `info.errors` mapping a field to a problem. The panel maps field names to form fields.
- Pagination: `limit` and an opaque `cursor` (keyset). Responses return the next cursor; the panel never builds a cursor.
- Optimistic concurrency: `version` on update and delete, `409 version_conflict` with the current version.
- Money: decimal strings. Time: RFC 3339 UTC.
- Identifiers: `hk` (opaque string) and UUIDs.

## Contract rules for the new endpoints

These apply to every endpoint proposed in [backend-requirements](backend-requirements/).

1. **Same envelope and error codes style.** New codes are added to the backend table; a published code never changes meaning.
2. **Every list is paginated with a cursor**, with documented filters and a maximum `limit`.
3. **Every change takes a `reason`** (required, at most 1000 characters) and is audited with before and after values.
4. **Every change is classified** in `adminRoutes` (`RouteChange` or `RouteSensitive`) and is covered by a permission.
5. **No secret ever appears in a response.** Secrets show as `[secret]`.
6. **PII is masked by default**; an unmasked read is a separate permission, needs a step-up, and is audited.
7. **Response shapes are in the OpenAPI document**, so the panel types are generated from it.
8. **Idempotency:** a state-changing `POST` accepts `Idempotency-Key`; a retry returns the first result.

## Encrypted payloads

### Scope and honesty

TLS 1.3 already protects the transport. The envelope below is **defence in depth** for the cases where TLS ends before the application: a CDN, WAF, load balancer, or proxy that terminates TLS and may log, cache, or inspect bodies. It also binds each request to one administrator session and one sequence number, which stops replay and cross-session reuse.

It does **not** protect against a script running inside the page, a compromised browser, or a compromised backend. It is enabled per route class, not for everything:

| Class | Encrypted | Examples |
| --- | --- | --- |
| Sealed | Request and response bodies | Withdrawals and payouts, user PII and KYC, restrictions, ledger reads, tickets with user data, staff and roles, platform controls, OTC rules, price overrides |
| Plain | Neither | Sign-in start, health, static catalog reads, audit list metadata |

The sign-in itself is protected by TLS and by the backend's existing two-factor flow.

### Key agreement

At `POST /admin/auth/{uuid}` the client may add `client_key`: an ephemeral ECDH P-256 public key (JWK), generated with WebCrypto as a non-extractable key pair. The server answers with its own ephemeral public key `server_key` and a `key_id`, signed with a long-term server signing key whose public half is built into the panel (`VITE_SEALING_PUBKEY`) or served with a pinned fingerprint. Both sides derive the session key:

```text
shared  = ECDH(client_priv, server_pub)
key     = HKDF-SHA-256(shared, salt = session_id, info = "cex-admin-seal-v1", length = 32)
```

The key lives only in the session on both sides and ends with it (logout, expiry, `DELETE /admin/sessions/{id}`).

### Message format

Content type `application/vnd.cex.sealed+json`:

```json
{
  "v": 1,
  "kid": "k_2026_11",
  "seq": 42,
  "iv": "<base64url, 12 bytes>",
  "ct": "<base64url, AES-256-GCM ciphertext and tag>"
}
```

- **Algorithm:** AES-256-GCM, a fresh random 96-bit IV per message (or a counter-derived IV; never reused with a key).
- **Additional authenticated data (AAD):** `v | kid | session_id | direction | seq | method | path (without query) | request_id`. A ciphertext moved to another route, session, or request fails authentication.
- **Plaintext:** the exact JSON that would have been sent in the clear, including the query parameters for `GET` routes, which move into the body of a `POST .../query` form or into a sealed `q` parameter (see below).
- **Sequence:** `seq` increases by one per direction per session. The server rejects a repeated or lower `seq` (`409 replay_detected`) and a gap larger than a small window. Responses use their own counter.
- **Freshness:** the plaintext carries `ts`; the server rejects messages more than 60 seconds off.
- **Errors:** the transport-level errors (`401`, `403`, `404`, `429`, `5xx`) stay plain envelopes with no sensitive data, so intermediaries and the panel can act on them. A business error from a sealed route is sealed.
- **Query strings for sealed reads:** sensitive list filters (for example a user's email) must not appear in URLs, which are logged. A sealed read is `POST /admin/<resource>/query` with a sealed body `{filters, limit, cursor}`; the unsealed `GET` is kept only for non-sensitive resources.

### Failure behaviour

- Missing or unknown `kid`, bad tag, bad AAD, or replay: `400 seal_invalid` (no detail). The panel ends the session after three in a row.
- A route marked sealed that receives plain JSON: `415 sealed_required`.
- Key rotation: the server may announce a new `kid` in a response; the panel renegotiates on the next sign-in. Sessions are short, so rotation is a sign-in away.

### Data at rest

The backend already encrypts PII fields and seals rows. The panel adds nothing at rest. Nothing sensitive is cached by the browser (`Cache-Control: no-store`), and TanStack Query data for sealed routes is dropped on sign-out and on idle timeout.

### What the panel implements (Phase 5)

The panel and its mock server implement the whole envelope; `src/crypto/seal.ts` is the reference, and `src/crypto/vectors.json` holds known-answer vectors computed by OpenSSL, not by this code (`node scripts/gen-seal-vectors.mjs`). Details chosen where the text above was open:

- **Negotiation.** `POST /admin/auth/verify` accepts `client_key` (an ECDH P-256 public JWK with only `kty`, `crv`, `x`, `y`). The answer adds `seal: {kid, sid, server_key, signature}`. The signature is ECDSA P-256 over `sid|kid|canonical(client_key)|canonical(server_key)` (canonical JSON `{crv,kty,x,y}`), checked against a key pinned in the build (`VITE_SEALING_PUBKEY`). Without a valid signature the panel does not sign in.
- **Which messages.** A sealed route seals the request body when there is one, and seals the response. A `GET` has no body, so only its answer is sealed. Plain: `401`, `403`, `404`, `415`, `429`, and `5xx`.
- **Sequence numbers.** Requests start at 1 and rise by one per sealed request in a session; responses have their own counter. A receiver accepts a number that it has not seen and is no more than 16 behind the highest. **A number is recorded only after the message authenticated**, so garbage with a stolen token cannot use numbers up.
- **Downgrade.** On a sealed route, a successful answer in the clear is treated as an attack and refused (`seal_invalid`).
- **Tabs.** A sealed session is not shared between tabs, because two tabs would race on one sequence. Each tab signs in on its own and uses one of the administrator's session slots.
- **Errors.** `400 seal_invalid` never says why; `409 replay_detected`; `415 sealed_required` when a body arrives in the clear on a sealed route.
- **Modes.** The panel runs with `VITE_SEALING` `off`, `optional`, or `required`. Mock mode defaults to `optional`; against the real backend it stays `off` until requirement 06 ships.

## Contracts of the missing modules

Request and response shapes of the new endpoints are written as issues, each with its contract, errors, permissions, and audit events:

| Module | Requirement |
| --- | --- |
| Dynamic groups, catalog, lookups, `GET /admin/me`, staff management | [01-rbac.md](backend-requirements/01-rbac.md) |
| Users and KYC | [02-users-kyc.md](backend-requirements/02-users-kyc.md) |
| Ledger and finance | [03-ledger-finance.md](backend-requirements/03-ledger-finance.md) |
| Ticketing | [04-ticketing.md](backend-requirements/04-ticketing.md) |
| Dashboard aggregates | [05-dashboard.md](backend-requirements/05-dashboard.md) |
| Sealed payloads | [06-sealed-payloads.md](backend-requirements/06-sealed-payloads.md) |
| Admin password, rotation, reset delay, sessions and refresh | [07-admin-credentials-sessions.md](backend-requirements/07-admin-credentials-sessions.md) |
