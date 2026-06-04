CREATE TYPE "CallbackSource" AS ENUM ('PSP', 'GSP');
CREATE TYPE "RawEventStatus" AS ENUM ('PENDING', 'DUPLICATE', 'INVALID');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "source" "CallbackSource" NOT NULL,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "firstRawEventId" TEXT,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raw_events" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "source" "CallbackSource" NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerEventId" TEXT,
    "status" "RawEventStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "correlationId" TEXT,
    "duplicateOfRawEventId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_brandId_email_key" ON "users"("brandId", "email");
CREATE INDEX "users_brandId_idx" ON "users"("brandId");
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE INDEX "sessions_brandId_userId_idx" ON "sessions"("brandId", "userId");
CREATE INDEX "sessions_brandId_tokenHash_idx" ON "sessions"("brandId", "tokenHash");
CREATE UNIQUE INDEX "idempotency_keys_brandId_source_provider_key_key" ON "idempotency_keys"("brandId", "source", "provider", "key");
CREATE INDEX "idempotency_keys_brandId_source_provider_idx" ON "idempotency_keys"("brandId", "source", "provider");
CREATE INDEX "raw_events_brandId_source_provider_idx" ON "raw_events"("brandId", "source", "provider");
CREATE INDEX "raw_events_brandId_idempotencyKey_idx" ON "raw_events"("brandId", "idempotencyKey");
CREATE INDEX "raw_events_status_receivedAt_idx" ON "raw_events"("status", "receivedAt");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
