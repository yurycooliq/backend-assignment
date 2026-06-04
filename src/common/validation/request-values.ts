import { ApplicationError } from "../errors/application-error";

const BRAND_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PROVIDER_PATTERN = /^[a-z0-9_-]+$/;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1F\x7F]/;

export function normalizeBrandId(value: string | undefined): string {
  const brandId = value?.trim() ?? "";

  if (!brandId) {
    throw ApplicationError.badRequest(
      "BRAND_ID_REQUIRED",
      "X-Brand-Id header is required",
    );
  }

  if (brandId.length > 64 || !BRAND_ID_PATTERN.test(brandId)) {
    throw ApplicationError.badRequest(
      "INVALID_BRAND_ID",
      "X-Brand-Id must be a safe tenant slug",
    );
  }

  return brandId;
}

export function normalizeProvider(value: string): string {
  const provider = value.trim();

  if (!provider || provider.length > 64 || !PROVIDER_PATTERN.test(provider)) {
    throw ApplicationError.badRequest(
      "INVALID_PROVIDER",
      "Provider must be a safe lowercase slug",
    );
  }

  return provider;
}

export function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();

  if (!key) {
    throw ApplicationError.badRequest(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Stable callback idempotency key is required",
    );
  }

  if (key.length > 128 || CONTROL_CHARACTER_PATTERN.test(key)) {
    throw ApplicationError.badRequest(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key is malformed",
    );
  }

  return key;
}
