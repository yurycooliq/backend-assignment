# Test Plan

The test suite should prove the assignment's risky parts, not just happy paths.

---

## Required tests

## 1. Unit test — business logic

Recommended target: `IngestCallbackUseCase`.

### Scenario: first callback creates pending raw event

Given:

- brand: `brandA`
- source: `PSP`
- provider: `mock-pay`
- idempotency key: `evt_1`

When:

- the use case ingests the callback for the first time

Then:

- it creates/claims an idempotency key;
- it creates one `raw_events` record with `status = PENDING`;
- it returns `{ duplicate: false, status: "accepted" }`;
- it does not call any balance/ledger updater.

### Scenario: duplicate callback is ignored for processing

Given:

- the same idempotency key already exists

When:

- the use case ingests the callback again

Then:

- it does not create another pending event;
- it either increments duplicate count or creates a duplicate audit record;
- it returns `{ duplicate: true, status: "duplicate_ignored" }`.

---

## 2. Integration test — callback idempotency

Recommended target: `POST /webhooks/psp/mock-pay`.

### Flow

1. Start app with a clean test database.
2. Send PSP callback:

```json
{
  "eventId": "psp_evt_dup_1",
  "type": "payment.succeeded",
  "data": {
    "paymentId": "pay_dup_1",
    "amount": "100.00",
    "currency": "EUR"
  }
}
```

Headers:

```http
X-Brand-Id: brandA
X-Webhook-Event-Id: psp_evt_dup_1
```

Expected:

- HTTP `202`;
- response has `duplicate: false`;
- DB has one pending raw event for this key.

3. Send the exact same callback again with the same `X-Webhook-Event-Id`.

Expected:

- HTTP `200` or another documented 2xx;
- response has `duplicate: true`;
- DB still has only one pending raw event for this key;
- no balance/user mutation happened.

Optional stronger assertion:

- DB may have an additional raw event with `status = DUPLICATE`, but not a second `PENDING` event.

---

## 3. Tenant leakage test

### Scenario A: profile access is brand-scoped

Given:

- user A exists in `brandA`;
- user B exists in `brandB`;
- token A belongs to user A.

When:

- call `GET /profile/me` with token A and `X-Brand-Id: brandB`.

Then:

- response is `403 TENANT_MISMATCH`;
- it does not return brand B user data.

### Scenario B: callback idempotency is brand-scoped

Given:

- callback event key `shared_evt_1`.

When:

- send callback with `X-Brand-Id: brandA` and key `shared_evt_1`;
- send callback with `X-Brand-Id: brandB` and key `shared_evt_1`.

Then:

- both first deliveries are accepted;
- idempotency from brand A does not block brand B;
- raw events are stored under their own brands.

---

## Additional useful tests

### Identity

- Register requires `X-Brand-Id`.
- Register rejects invalid email.
- Register rejects weak/short password.
- Register rejects duplicate email within the same brand.
- Register allows the same email in another brand.
- Login rejects wrong password.
- Profile rejects missing token.
- Profile rejects expired/revoked token.

### Callbacks

- Missing `X-Brand-Id` returns `400 BRAND_ID_REQUIRED`.
- Missing idempotency key returns `400 IDEMPOTENCY_KEY_REQUIRED`.
- Invalid provider slug returns `400 INVALID_PROVIDER`.
- PSP and GSP use the same idempotency logic.
- Header idempotency key takes precedence over payload `eventId`.

### Error shape

Every error response should include:

- `error.code`
- `error.message`
- `error.requestId`

---

## Test implementation notes

Use a clean database per integration test suite.

Recommended setup:

- Run migrations before tests.
- Truncate tables between tests.
- Avoid test interdependence.
- Use stable test data: `brandA`, `brandB`, `alice@example.com`, `bob@example.com`.

For integration tests, use Supertest against the Nest application instance.

For unit tests, mock repositories and test use-case behavior without HTTP.
