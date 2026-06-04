# API

Base URL for local development:

```text
http://localhost:3000
```

All responses include a request/correlation ID.

The service uses `X-Brand-Id` as the tenant header.

---

## Error format

All errors should use this shape:

```json
{
  "error": {
    "code": "BRAND_ID_REQUIRED",
    "message": "X-Brand-Id header is required",
    "details": {},
    "requestId": "req_01HZX..."
  }
}
```

Common status codes:

| Status | Meaning |
| --- | --- |
| `400` | Invalid request, missing tenant, missing idempotency key |
| `401` | Missing or invalid session token |
| `403` | Authenticated session belongs to another brand |
| `404` | Resource not found in current brand |
| `409` | Conflict, for example duplicate registration in same brand |
| `422` | DTO/schema validation failed |
| `500` | Unexpected server error |

---

## Required headers

### Tenant header

```http
X-Brand-Id: brandA
```

Required on every endpoint except `GET /health` and `/docs`.

The value is trimmed and must be 1-64 characters matching `^[A-Za-z0-9_-]+$`.

### Correlation header

```http
X-Correlation-Id: local-test-001
```

Optional. If absent, the server generates one.

### Auth header

```http
Authorization: Bearer <accessToken>
```

Required for authenticated endpoints.

### Callback idempotency headers

```http
Idempotency-Key: idem_123
X-Webhook-Event-Id: psp_evt_1001
```

Callback endpoints resolve the idempotency key from `Idempotency-Key`, then `X-Webhook-Event-Id`, then `payload.eventId`.

---

# Health

## GET /health

Returns service health without requiring `X-Brand-Id`.

Response `200 OK`:

```json
{
  "data": {
    "status": "ok"
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

---

# Identity

## POST /auth/register

Creates a new user inside the current brand and returns a session token.

```http
POST /auth/register
Content-Type: application/json
X-Brand-Id: brandA
X-Correlation-Id: demo-register-001
```

Request:

```json
{
  "email": "alice@example.com",
  "password": "Password123!"
}
```

Response `201 Created`:

```json
{
  "data": {
    "user": {
      "id": "7fddf1e5-f94f-4f92-94fb-829f4f40a8d6",
      "brandId": "brandA",
      "email": "alice@example.com"
    },
    "session": {
      "accessToken": "sess_raw_token_returned_once",
      "expiresAt": "2026-06-11T12:00:00.000Z"
    }
  },
  "meta": {
    "requestId": "demo-register-001"
  }
}
```

Duplicate email inside the same brand returns `409 USER_ALREADY_EXISTS`.

The same email may be registered under a different brand.

---

## POST /auth/login

Authenticates a user inside the current brand and returns a new session token.

```http
POST /auth/login
Content-Type: application/json
X-Brand-Id: brandA
```

Request:

```json
{
  "email": "alice@example.com",
  "password": "Password123!"
}
```

Response `200 OK`:

```json
{
  "data": {
    "user": {
      "id": "7fddf1e5-f94f-4f92-94fb-829f4f40a8d6",
      "brandId": "brandA",
      "email": "alice@example.com"
    },
    "session": {
      "accessToken": "sess_raw_token_returned_once",
      "expiresAt": "2026-06-11T12:00:00.000Z"
    }
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

Invalid credentials return `401 INVALID_CREDENTIALS`.

---

## GET /profile/me

Returns the current authenticated user profile.

```http
GET /profile/me
X-Brand-Id: brandA
Authorization: Bearer sess_raw_token_returned_once
```

Response `200 OK`:

```json
{
  "data": {
    "id": "7fddf1e5-f94f-4f92-94fb-829f4f40a8d6",
    "brandId": "brandA",
    "email": "alice@example.com"
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

If a valid token from `brandA` is used with `X-Brand-Id: brandB`, return `403 TENANT_MISMATCH`.

---

# PSP callbacks

## POST /webhooks/psp/:provider

Ingests a Payment Service Provider callback.

The endpoint persists the raw callback and marks it for future processing. It does not update balances.

```http
POST /webhooks/psp/mock-pay
Content-Type: application/json
X-Brand-Id: brandA
X-Webhook-Event-Id: psp_evt_1001
X-Correlation-Id: callback-demo-001
```

Request:

```json
{
  "eventId": "psp_evt_1001",
  "type": "payment.succeeded",
  "occurredAt": "2026-06-04T12:00:00.000Z",
    "data": {
      "paymentId": "pay_123",
      "userId": "7fddf1e5-f94f-4f92-94fb-829f4f40a8d6",
      "amount": "100.00",
      "currency": "EUR"
  }
}
```

First response `202 Accepted`:

```json
{
  "data": {
    "status": "accepted",
    "duplicate": false,
    "source": "PSP",
    "provider": "mock-pay",
    "idempotencyKey": "psp_evt_1001",
    "rawEventId": "61da57c5-e22d-4f29-90af-68e502139ba6"
  },
  "meta": {
    "requestId": "callback-demo-001"
  }
}
```

Duplicate response `200 OK`:

```json
{
  "data": {
    "status": "duplicate_ignored",
    "duplicate": true,
    "source": "PSP",
    "provider": "mock-pay",
    "idempotencyKey": "psp_evt_1001",
    "firstRawEventId": "61da57c5-e22d-4f29-90af-68e502139ba6"
  },
  "meta": {
    "requestId": "callback-demo-001-retry"
  }
}
```

Missing idempotency key returns `400 IDEMPOTENCY_KEY_REQUIRED`.

Malformed idempotency keys return `400 INVALID_IDEMPOTENCY_KEY`. The resolved key is trimmed, capped at 128 characters, and cannot contain control characters.

Invalid provider slugs return `400 INVALID_PROVIDER`. Providers must match `^[a-z0-9_-]+$` and be at most 64 characters.

The persisted `raw_events.idempotencyKey` is the resolved idempotency key. The persisted `raw_events.providerEventId` is `payload.eventId` when present, so a header idempotency key can differ from the provider event ID.

---

# GSP callbacks

## POST /webhooks/gsp/:provider

Ingests a Game Service Provider callback.

The endpoint uses the same ingestion, idempotency, and persistence flow as PSP callbacks.

```http
POST /webhooks/gsp/mock-game
Content-Type: application/json
X-Brand-Id: brandA
X-Webhook-Event-Id: gsp_evt_2001
```

Request:

```json
{
  "eventId": "gsp_evt_2001",
  "type": "round.finished",
  "occurredAt": "2026-06-04T12:01:00.000Z",
  "data": {
    "roundId": "round_123",
    "userId": "usr_...",
    "gameCode": "demo-slot"
  }
}
```

Response `202 Accepted`:

```json
{
  "data": {
    "status": "accepted",
    "duplicate": false,
    "source": "GSP",
    "provider": "mock-game",
    "idempotencyKey": "gsp_evt_2001",
    "rawEventId": "raw_..."
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

---

# cURL smoke flow

Register:

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brandA' \
  -d '{"email":"alice@example.com","password":"Password123!"}'
```

Login:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brandA' \
  -d '{"email":"alice@example.com","password":"Password123!"}' \
  | jq -r '.data.session.accessToken')
```

Profile:

```bash
curl -s http://localhost:3000/profile/me \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Brand-Id: brandA'
```

PSP callback:

```bash
curl -s -X POST http://localhost:3000/webhooks/psp/mock-pay \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brandA' \
  -H 'X-Webhook-Event-Id: psp_evt_1001' \
  -d '{"eventId":"psp_evt_1001","type":"payment.succeeded","data":{"paymentId":"pay_123","amount":"100.00","currency":"EUR"}}'
```

Duplicate PSP callback:

```bash
curl -s -X POST http://localhost:3000/webhooks/psp/mock-pay \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brandA' \
  -H 'X-Webhook-Event-Id: psp_evt_1001' \
  -d '{"eventId":"psp_evt_1001","type":"payment.succeeded","data":{"paymentId":"pay_123","amount":"100.00","currency":"EUR"}}'
```
