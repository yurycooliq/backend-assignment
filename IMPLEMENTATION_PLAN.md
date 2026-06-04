# Implementation Plan — Backend Engineer Assignment

## Target outcome

Build a small but production-minded NestJS + TypeScript backend that proves three things clearly:

1. **Identity basics**: users can register, log in, and read their own profile through persisted sessions.
2. **Safe PSP/GSP callback handling**: callbacks are persisted, deduplicated through a database-backed idempotency mechanism, and never update balances directly.
3. **Future ledger readiness**: callback ingestion creates durable raw events that can later be consumed by a ledger/outbox processor.

The assignment says 4–8 hours, so the solution should be intentionally small. The quality should come from correctness, clear boundaries, tests, and documentation — not from overbuilding.

---

## Core assumptions

### Tenant context

Use `X-Brand-Id` as the explicit tenant header for all endpoints.

Why:

- It is easy for reviewers to test.
- It makes tenant isolation visible in every request.
- It avoids hiding tenant logic inside auth tokens only.

Rules:

- Missing `X-Brand-Id` returns `400 BRAND_ID_REQUIRED`.
- Authenticated endpoints must check that `session.brandId === X-Brand-Id`.
- Every persistence query for tenant-owned data must include `brandId`.

### Session model

Use opaque bearer session tokens, not JWT-only auth.

Why:

- The assignment explicitly lists a `sessions` table.
- Opaque tokens are easier to revoke.
- Storing only a hash of the token keeps leaked databases safer.

### Callback idempotency

Use a persistent `idempotency_keys` table with a unique constraint on:

```text
brandId + source + provider + key
```

Where:

- `source` is `PSP` or `GSP`.
- `provider` comes from `/webhooks/:source/:provider`.
- `key` comes from `Idempotency-Key`, `X-Webhook-Event-Id`, or `payload.eventId`.

Do **not** use in-memory deduplication. It fails after restart and does not demonstrate backend reliability.

### Raw event persistence

Persist callback attempts to `raw_events`.

Recommended behavior:

- First delivery: create `raw_events.status = PENDING` and link it to the idempotency key.
- Duplicate delivery: create `raw_events.status = DUPLICATE`, link it to the first raw event, and return a safe 2xx response.
- Invalid callback with valid tenant/idempotency context: optionally persist `raw_events.status = INVALID` for audit.

This gives both auditability and safe downstream processing. Only `PENDING` events should be considered for future ledger processing.

### No direct balance updates

Do not create `balances`, `wallets`, or `ledger_entries` in this assignment.

Adapters/controllers must only:

1. validate request context;
2. normalize minimal metadata;
3. persist raw event;
4. return a structured response.

The future ledger should be a separate consumer/use case, not part of PSP/GSP webhook adapters.

---

## Recommended stack

- NestJS + TypeScript
- PostgreSQL
- Prisma ORM
- Jest + Supertest
- Docker Compose for app + database
- `@nestjs/swagger` for OpenAPI generation
- `class-validator` / `class-transformer` for DTO validation
- `bcrypt` or `argon2` for password hashing
- `pino` or Nest built-in logger with JSON-style structured logs

Prisma is recommended because it keeps the schema and unique constraints easy to review.

---

## Module boundaries

```text
src/
  main.ts
  app.module.ts
  common/
    errors/
      app-error.ts
      http-exception.filter.ts
    logging/
      request-id.middleware.ts
      request-logger.interceptor.ts
    tenant/
      tenant-context.ts
      tenant.guard.ts
      tenant.decorator.ts
  persistence/
    prisma.service.ts
    repositories/
      users.repository.ts
      sessions.repository.ts
      raw-events.repository.ts
      idempotency-keys.repository.ts
  identity/
    identity.module.ts
    auth.controller.ts
    profile.controller.ts
    register.use-case.ts
    login.use-case.ts
    get-profile.use-case.ts
    password.service.ts
    session.service.ts
    dto/
  callbacks/
    callbacks.module.ts
    webhook.controller.ts
    ingest-callback.use-case.ts
    idempotency.service.ts
    callback-source.ts
    dto/
```

Keep business logic in use cases/services, not controllers.

---

## Implementation sequence

### 1. Bootstrap project

Create a NestJS project with strict TypeScript settings.

Required baseline:

- `pnpm` scripts for local run, tests, linting, migrations.
- `.env.example`.
- Docker Compose with PostgreSQL.
- Prisma schema and migration.

Suggested scripts:

```json
{
  "start:dev": "nest start --watch",
  "build": "nest build",
  "lint": "eslint .",
  "test": "jest",
  "test:e2e": "jest --config ./test/jest-e2e.json",
  "prisma:migrate": "prisma migrate dev",
  "prisma:deploy": "prisma migrate deploy",
  "verify": "pnpm lint && pnpm test && pnpm test:e2e"
}
```

### 2. Persistence layer

Create tables:

- `users`
- `sessions`
- `raw_events`
- `idempotency_keys`

Add indexes and unique constraints needed for tenant isolation and idempotency.

The most important constraint:

```text
UNIQUE (brandId, source, provider, key)
```

on `idempotency_keys`.

### 3. Common infrastructure

Add:

- request/correlation ID middleware;
- tenant extraction from `X-Brand-Id`;
- global validation pipe;
- global error filter with structured JSON errors;
- logging interceptor that logs request ID, brand ID, method, path, status, and duration.

### 4. Identity module

Endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `GET /profile/me`

Rules:

- User uniqueness is scoped by `brandId + email`.
- Password is hashed.
- Session token is random and opaque.
- Only token hash is stored.
- `GET /profile/me` must reject a valid token if the request uses a different `X-Brand-Id`.

### 5. Callback module

Endpoints:

- `POST /webhooks/psp/:provider`
- `POST /webhooks/gsp/:provider`

Rules:

- `provider` is a safe slug: lowercase letters, numbers, `_`, `-`.
- Callback must include a stable event key through one of:
  - `Idempotency-Key` header;
  - `X-Webhook-Event-Id` header;
  - `payload.eventId` field.
- First callback creates a pending raw event.
- Duplicate callback is detected through the idempotency table.
- Duplicate callback returns 2xx and does not create a second pending event.
- Adapter must not update balances or user state.

Recommended response behavior:

- First callback: `202 Accepted`, `status = "accepted"`.
- Duplicate callback: `200 OK`, `status = "duplicate_ignored"`.

### 6. Tests

Required tests:

1. Unit test for business logic.
   - Best choice: `IngestCallbackUseCase` or `RegisterUseCase`.
2. Integration test for callback idempotency.
   - Send the same PSP callback twice.
   - Assert one pending raw event and one duplicate or duplicate counter.
3. Tenant leakage test.
   - Create users/sessions for brand A and brand B.
   - Assert brand A token cannot access brand B profile.
   - Assert the same callback id can be accepted independently for different brands.

### 7. Documentation

Create:

- `README.md`
- `API.md`
- `DECISIONS.md`

Nice-to-have:

- generated OpenAPI route at `/docs`;
- static `openapi.yaml` or instructions for generating it.

---

## Acceptance checklist

Before submission, verify:

- [ ] `docker compose up --build` starts the app and DB.
- [ ] `pnpm verify` or documented equivalent runs tests.
- [ ] `POST /auth/register` creates a user under a brand.
- [ ] `POST /auth/login` returns an opaque access token.
- [ ] `GET /profile/me` requires matching token and brand.
- [ ] First PSP callback is persisted as raw event.
- [ ] Duplicate PSP callback is deduplicated.
- [ ] GSP endpoint uses the same safe ingestion path.
- [ ] No direct balance, wallet, or ledger updates exist in PSP/GSP adapters.
- [ ] Every tenant-owned query includes `brandId`.
- [ ] Error responses include `error.code`, `error.message`, and `requestId`.
- [ ] Logs include request/correlation ID.
- [ ] README alone is enough for reviewer to run and test the project.
