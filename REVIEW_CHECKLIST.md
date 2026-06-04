# Review Checklist

Use this checklist before submitting the repository.

## Critical requirements

- [ ] Uses NestJS + TypeScript.
- [ ] Has `users`, `sessions`, `raw_events`, `idempotency_keys` tables.
- [ ] Has `POST /auth/register`.
- [ ] Has `POST /auth/login`.
- [ ] Has `GET /profile/me`.
- [ ] Has `POST /webhooks/psp/:provider`.
- [ ] Has `POST /webhooks/gsp/:provider`.
- [ ] Callback payload is persisted.
- [ ] Duplicate callbacks are deduplicated through persistent storage.
- [ ] Tenant context is applied through `brandId`.
- [ ] Brand A cannot access Brand B data.
- [ ] PSP/GSP adapters do not update balances directly.
- [ ] Errors use structured responses.
- [ ] Logs include request/correlation ID.
- [ ] README explains how to run and test.
- [ ] API.md includes examples.
- [ ] DECISIONS.md explains trade-offs.

## Things that often fail in this assignment

### 1. In-memory idempotency

Bad:

```ts
const seen = new Set<string>();
```

This fails after process restart and under multi-instance deployments.

Good:

```text
UNIQUE (brandId, source, provider, key)
```

in the database.

### 2. Missing brand in queries

Bad:

```ts
findUserById(userId)
```

Good:

```ts
findUserByIdAndBrand(userId, brandId)
```

### 3. JWT-only auth without sessions table

The assignment asks for `sessions`. Use persisted opaque sessions or at least persist session records.

### 4. Callback directly changes balance

Bad:

```ts
await balances.increment(userId, amount);
```

Good:

```ts
await rawEvents.create({ status: 'PENDING', payload });
```

### 5. Duplicate creates another processable event

A duplicate may be stored for audit, but it must not create another `PENDING` raw event.

### 6. README is incomplete

The reviewer should not have to guess commands.

README must include:

- prerequisites;
- env setup;
- start command;
- test command;
- API docs location;
- examples or links to API.md.

## Final local verification

Run:

```bash
pnpm verify
```

Then test manually:

```bash
curl -s -X POST http://localhost:3000/webhooks/psp/mock-pay \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brandA' \
  -H 'X-Webhook-Event-Id: psp_evt_manual_1' \
  -d '{"eventId":"psp_evt_manual_1","type":"payment.succeeded","data":{"paymentId":"pay_manual_1"}}'
```

Repeat the same command. The second response must be duplicate-safe.
