# Backend Callback MVP

[![CI](https://github.com/yurycooliq/backend-assignment/actions/workflows/ci.yml/badge.svg)](https://github.com/yurycooliq/backend-assignment/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.33.2-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Jest](https://img.shields.io/badge/Jest-tested-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-documented-6BA539?logo=openapiinitiative&logoColor=white)](./API.md)

Small NestJS + TypeScript backend service demonstrating:

- identity basics;
- safe PSP/GSP callback ingestion;
- persistent idempotency;
- tenant isolation through `brandId`;
- readiness for future ledger processing.

This project is intentionally small. It focuses on correctness, module boundaries, and reviewer-friendly local execution.

---

## Features

### Identity

- `POST /auth/register`
- `POST /auth/login`
- `GET /profile/me`
- Opaque bearer sessions persisted in `sessions`
- Password hashing
- Tenant-scoped users through `X-Brand-Id`

### Callback ingestion

- `POST /webhooks/psp/:provider`
- `POST /webhooks/gsp/:provider`
- Raw callback persistence in `raw_events`
- Persistent idempotency through `idempotency_keys`
- Duplicate callbacks are safely deduplicated
- PSP/GSP adapters do not update balances directly

### Observability

- Request/correlation ID support
- Structured logs with method, path, status, brand ID, and duration
- Structured error responses with machine-readable error codes

---

## Requirements

- Node.js 20+
- pnpm through Corepack (`corepack enable`)
- Docker and Docker Compose

---

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

The API should be available at:

```text
http://localhost:3000
```

If port 3000 is already used on your machine, set `APP_PORT` in `.env` before starting Compose, for example `APP_PORT=3001`.

If Swagger/OpenAPI is enabled:

```text
http://localhost:3000/docs
```

---

## Local development without Docker app container

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Install dependencies:

```bash
corepack enable
pnpm install
```

Generate Prisma Client:

```bash
pnpm prisma:generate
```

Run migrations:

```bash
pnpm prisma:migrate
```

`pnpm prisma:migrate` applies the committed SQL migrations from `prisma/migrations`. `pnpm prisma:generate` generates Prisma Client from `prisma/schema.prisma`.

Start app:

```bash
pnpm start:dev
```

---

## Test and verification

Run all checks against the local PostgreSQL container:

```bash
docker compose up -d postgres
pnpm verify
```

Or run the same verification inside Docker:

```bash
docker compose run --rm app pnpm verify
```

Run checks separately:

```bash
pnpm lint
pnpm test
pnpm test:e2e
```

The most important tests cover:

- callback idempotency;
- tenant leakage protection;
- identity business logic.

---

## Environment variables

See `.env.example`.

```env
NODE_ENV=development
APP_PORT=3000
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/backend_assignment?schema=public
SESSION_TTL_SECONDS=604800
BCRYPT_ROUNDS=10
```

---

## Tenant model

Every request must include:

```http
X-Brand-Id: brandA
```

Authenticated requests must also include:

```http
Authorization: Bearer <accessToken>
```

A session created under `brandA` cannot be used with `X-Brand-Id: brandB`.

---

## Idempotency model

Callback deduplication is scoped by:

```text
brandId + source + provider + idempotencyKey
```

The idempotency key is resolved from:

1. `Idempotency-Key` header;
2. `X-Webhook-Event-Id` header;
3. `payload.eventId`.

A duplicate callback returns a successful 2xx response but is not treated as a second processable event.

---

## API examples

See [API.md](./API.md).

---

## Design decisions

See [DECISIONS.md](./DECISIONS.md).

---

## Project structure

```text
src/
  common/        shared errors, logging, tenant extraction
  persistence/   Prisma service and repositories
  identity/      register, login, profile
  callbacks/     PSP/GSP webhook ingestion and idempotency
prisma/
  schema.prisma
  migrations/
test/
  app.e2e-spec.ts
```

`pnpm verify` runs Prisma Client generation, TypeScript type-checking, the business-logic unit test, and the Supertest integration suite. The e2e suite applies migrations before running and clears tenant-owned tables between tests.

---

## Important non-goals

This project does not implement:

- real PSP/GSP signature verification;
- balances;
- wallet mutations;
- ledger posting;
- background workers.

The callback module persists raw events so a future ledger processor can consume them safely.

---

## Reviewer checklist

A reviewer should be able to verify from README alone that:

- the app runs locally;
- tests run locally;
- duplicate callbacks are deduplicated;
- callback payloads are persisted;
- tenant context is validated;
- brand A cannot access brand B data;
- PSP/GSP adapters do not directly update balances.
