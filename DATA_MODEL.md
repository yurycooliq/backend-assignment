# Data Model

This model is intentionally small and focused on the assignment requirements.

## Entity overview

```text
users
  └── sessions

idempotency_keys
  └── raw_events
```

`raw_events` are the durable boundary between external PSP/GSP callbacks and future ledger processing.

---

## users

Stores tenant-scoped identity records.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID/string | Primary key |
| `brandId` | string | Tenant identifier |
| `email` | string | Case-normalized email |
| `passwordHash` | string | Never store raw password |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

Indexes:

```text
UNIQUE (brandId, email)
INDEX (brandId)
```

Why `brandId + email` is unique, not just `email`:

- The same person may exist in different brands.
- Tenant isolation must be explicit.

---

## sessions

Stores opaque login sessions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID/string | Primary key |
| `brandId` | string | Tenant identifier copied from user |
| `userId` | UUID/string | FK to users |
| `tokenHash` | string | Hash of random token, unique |
| `expiresAt` | timestamp | Expiry time |
| `revokedAt` | timestamp/null | Optional revocation |
| `createdAt` | timestamp | Creation time |

Indexes:

```text
UNIQUE (tokenHash)
INDEX (brandId, userId)
INDEX (brandId, tokenHash)
```

Important rule:

- Never store the raw bearer token.
- Return the raw token only once at login/register time.

---

## idempotency_keys

Stores persistent deduplication keys for callbacks.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID/string | Primary key |
| `brandId` | string | Tenant identifier |
| `source` | enum | `PSP` or `GSP` |
| `provider` | string | Provider slug from path |
| `key` | string | Stable callback key |
| `firstRawEventId` | UUID/string/null | First accepted raw event |
| `duplicateCount` | integer | Number of duplicate attempts |
| `createdAt` | timestamp | First seen time |
| `updatedAt` | timestamp | Last duplicate/update time |

Indexes:

```text
UNIQUE (brandId, source, provider, key)
INDEX (brandId, source, provider)
```

This is the most important reliability table in the assignment.

---

## raw_events

Stores raw PSP/GSP callback attempts for audit and future processing.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID/string | Primary key |
| `brandId` | string | Tenant identifier |
| `source` | enum | `PSP` or `GSP` |
| `provider` | string | Provider slug from path |
| `idempotencyKey` | string | Derived stable key |
| `providerEventId` | string/null | Optional provider event ID |
| `status` | enum | `PENDING`, `DUPLICATE`, `INVALID` |
| `payload` | JSON/JSONB | Full callback payload |
| `headers` | JSON/JSONB/null | Safe subset of headers, no secrets |
| `correlationId` | string | Request/correlation ID |
| `duplicateOfRawEventId` | UUID/string/null | First raw event for duplicate attempts |
| `receivedAt` | timestamp | Time received |

Indexes:

```text
INDEX (brandId, source, provider)
INDEX (brandId, idempotencyKey)
INDEX (status, receivedAt)
```

Processing rule for future ledger:

- Only `status = PENDING` events should be picked up by a future ledger/outbox consumer.
- `DUPLICATE` records are audit records only.
- `INVALID` records are audit/debug records only.

---

## Suggested Prisma schema

```prisma
enum CallbackSource {
  PSP
  GSP
}

enum RawEventStatus {
  PENDING
  DUPLICATE
  INVALID
}

model User {
  id           String    @id @default(uuid())
  brandId      String
  email        String
  passwordHash String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  sessions     Session[]

  @@unique([brandId, email])
  @@index([brandId])
  @@map("users")
}

model Session {
  id        String    @id @default(uuid())
  brandId   String
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id])

  @@index([brandId, userId])
  @@index([brandId, tokenHash])
  @@map("sessions")
}

model IdempotencyKey {
  id              String         @id @default(uuid())
  brandId         String
  source          CallbackSource
  provider        String
  key             String
  firstRawEventId String?
  duplicateCount  Int            @default(0)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@unique([brandId, source, provider, key])
  @@index([brandId, source, provider])
  @@map("idempotency_keys")
}

model RawEvent {
  id                    String         @id @default(uuid())
  brandId               String
  source                CallbackSource
  provider              String
  idempotencyKey        String
  providerEventId       String?
  status                RawEventStatus
  payload               Json
  headers               Json?
  correlationId         String?
  duplicateOfRawEventId String?
  receivedAt            DateTime       @default(now())

  @@index([brandId, source, provider])
  @@index([brandId, idempotencyKey])
  @@index([status, receivedAt])
  @@map("raw_events")
}
```
