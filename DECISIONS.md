# Decisions and Trade-offs

## 1. NestJS + TypeScript

The assignment prefers NestJS + TypeScript, so the implementation should follow NestJS module boundaries instead of a minimal Express app.

Trade-off:

- NestJS has more boilerplate.
- The module structure makes identity, callbacks, persistence, and common infrastructure easier to review.

---

## 2. PostgreSQL + Prisma

PostgreSQL is used for durable persistence and transactional idempotency.

Prisma is used because:

- schema review is simple;
- migrations are straightforward;
- unique constraints are explicit;
- tests can inspect persisted records cleanly.

Trade-off:

- TypeORM may feel more native to some NestJS projects.
- Prisma is faster to implement correctly for a small MVP.

---

## 3. Explicit tenant header: `X-Brand-Id`

Every tenant-scoped request must include `X-Brand-Id`. `GET /health` and `/docs` are intentionally tenant-neutral.

Why:

- The assignment explicitly asks for tenant isolation through `brandId`.
- A visible header makes tests and reviewer checks simple.
- It prevents hidden assumptions about global user identity.
- The header is validated as a short slug before any use.

Trade-off:

- In a production system, tenant context might come from domain, API key, OAuth claims, or provider configuration.
- For this assignment, explicit `X-Brand-Id` is clearer and easier to verify.

---

## 4. Opaque sessions instead of JWT-only auth

The system stores sessions in a `sessions` table and returns an opaque bearer token.

Why:

- The assignment requires a `sessions` table.
- Opaque tokens can be revoked.
- Only token hashes are stored.

Trade-off:

- Each authenticated request needs a DB lookup.
- That is acceptable for a small backend MVP and makes tenant checks explicit.
- The auth guard first looks up sessions by `brandId + tokenHash`. If no scoped session exists, it performs a minimal global select of only `{ id, brandId }` to distinguish `401 INVALID_SESSION` from the required `403 TENANT_MISMATCH`. Profile data is still loaded with `brandId + userId`, not by user ID alone.

---

## 5. Email uniqueness is scoped by brand

`users` has a unique constraint on:

```text
brandId + email
```

Why:

- The same email may exist in multiple brands.
- This is the simplest way to demonstrate multi-tenant discipline.

Trade-off:

- Global account sharing across brands is not supported.
- That is outside the assignment scope.

---

## 6. Callback idempotency is database-backed

Idempotency is handled with a unique database constraint on:

```text
brandId + source + provider + key
```

Why:

- In-memory idempotency fails after restart.
- Database uniqueness is safe under concurrent duplicate callbacks.
- The exact dedupe scope is reviewable.

Trade-off:

- It requires careful transaction handling.
- That complexity is the point of the assignment and should be implemented clearly.
- The first delivery claims the idempotency key and creates the `PENDING` raw event in one transaction. A duplicate delivery records a `DUPLICATE` raw event and increments `duplicateCount`; it never creates a second processable `PENDING` event.

---

## 7. Duplicate callbacks return 2xx

Duplicate callbacks return a successful response, usually `200 OK` with `duplicate: true`.

Why:

- Providers often retry until they receive a 2xx response.
- Returning an error for a known duplicate may create retry storms.

Trade-off:

- The client must inspect the response body to see whether it was a first delivery or duplicate.
- That is acceptable for webhook APIs.

---

## 8. Raw events are an inbox/outbox-like boundary

The callbacks module persists raw events but does not apply business side effects.

Why:

- PSP/GSP adapters should not update balances directly.
- Future ledger processing can consume `raw_events.status = PENDING`.
- Audit/debugging becomes easier because original payloads are preserved.
- The resolved `idempotencyKey` and provider-owned `payload.eventId` are stored separately because the stable retry key may come from an HTTP header while the provider event ID lives in the body.

Trade-off:

- The service does not complete actual payment/game settlement.
- That is intentionally out of scope.

---

## 9. No direct balance, wallet, or ledger mutations

The implementation should not include a `balances` table or update user balances from callbacks.

Why:

- The assignment explicitly forbids direct balance updates in PSP/GSP adapters.
- A future ledger must own financial state transitions.

Trade-off:

- The demo is less feature-rich.
- It is safer and better aligned with the evaluation criteria.

---

## 10. Structured error responses

All errors follow this shape:

```json
{
  "error": {
    "code": "TENANT_MISMATCH",
    "message": "Session belongs to a different brand",
    "details": {},
    "requestId": "req_..."
  }
}
```

Why:

- Clear status codes and machine-readable error codes make APIs easier to integrate and test.
- Including request ID connects API errors to logs.

Trade-off:

- A global exception filter adds setup work.
- The result is much more professional.

---

## 11. Basic observability only

The MVP logs request/correlation ID, brand ID, method, path, status code, and duration.

Why:

- The assignment only asks for basic observability hooks.
- Request ID in logs is the highest-value minimal addition.

Trade-off:

- No metrics, tracing, or dashboards are included.
- Those are future improvements.

---

## 12. OpenAPI is a nice-to-have, not the core deliverable

Expose Swagger docs at `/docs` if implementation time allows.

Why:

- It improves reviewer experience.
- The core evaluation still depends on idempotency, tenant isolation, and tests.

Trade-off:

- Do not spend time polishing Swagger if required tests or persistence are incomplete.
