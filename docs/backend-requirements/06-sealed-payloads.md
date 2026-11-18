# Sealed (encrypted) admin payloads

**Labels:** `type: feature`, `type: security`, `area: admin`, `priority: medium`

## Summary

Add an application-layer encryption envelope for sensitive admin routes, on top of TLS, so a TLS-terminating intermediary (CDN, WAF, load balancer, logging proxy) cannot read or replay admin requests and responses. The full design is in the panel repository: [`docs/06-api-contract.md#encrypted-payloads`](../06-api-contract.md#encrypted-payloads).

## Evidence

- `docs/api.md` describes plain JSON bodies and query strings; any proxy that terminates TLS sees user data, withdrawal details, and PII.
- Admin sessions already exist as server-side rows with a token; the session is a natural anchor for a per-session key (`docs/api.md#admin-sign-in`, #308).
- The admin API can run on a separate listener (`server.admin_listen_addr`), so the middleware can apply only there.

## Proposal

1. **Key agreement at sign-in.** `POST /admin/auth/{uuid}` accepts an optional `client_key` (ECDH P-256 public JWK). The response adds `server_key`, `key_id`, and `signature` (over both keys and the session id, made with a long-term signing key held in the key service, with rotation). The derived key is `HKDF-SHA-256(ECDH, salt=session_id, info="cex-admin-seal-v1")`. The server stores only what it needs to derive the key (its ephemeral private key sealed with the data key, encrypted at rest), never in logs.
2. **Middleware `sealed`** on the admin router: for routes marked `Sealed` in the `adminRoutes` table it decrypts the request body, authenticates the AAD (`v | kid | session_id | direction | seq | method | path | request_id`), enforces the sequence and a 60 s timestamp window, and encrypts the response. Content type `application/vnd.cex.sealed+json`, AES-256-GCM, 96-bit IV, never reused.
3. **Replay protection.** Per session, per direction sequence numbers kept in Redis with the session's life; `409 replay_detected`, and `400 seal_invalid` for any authentication failure, with no detail. Three in a row end the session.
4. **Plain errors for transport failures** (`401`, `403`, `404`, `429`, `5xx`); business errors from sealed routes are sealed.
5. **Sealed reads.** Routes whose filters are sensitive use `POST .../query` (see requirements 02, 03, 04). Plain `GET` stays for non-sensitive lists.
6. **Configuration.** `admin.sealed.enabled` (`off`, `optional`, `required`), `admin.sealed.signing_key`, `admin.sealed.max_clock_skew_seconds`. Release mode requires `required` on a production-profile listener once the panel ships support. `415 sealed_required` when plain JSON reaches a sealed route in `required` mode.
7. **Logging.** The request logger and the tracer record the route, sizes, `kid`, and `seq`, never plaintext or ciphertext.

## Limits (must be in the docs)

It protects against intermediaries and replay. It does not protect against XSS or a compromised browser, nor a compromised backend. It supplements TLS 1.3, CSP, step-up, and two-person rules and replaces none of them.

## Acceptance criteria

- [ ] Known-answer tests for key derivation and AEAD with a shared vector file, also used by the panel's tests.
- [ ] Tamper tests: modified ciphertext, moved to another route, another session, another direction, replayed, reordered, stale timestamp.
- [ ] Session end drops the key on every instance.
- [ ] Fuzz test of the envelope parser; no panic, constant-time comparisons where relevant.
- [ ] Load test shows overhead under 5 percent at the admin baseline.
- [ ] `docs/api.md` and `docs/configuration.md` describe the envelope, modes, and limits.
