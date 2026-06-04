import { Injectable } from "@nestjs/common";
import { IncomingHttpHeaders } from "http";
import { normalizeIdempotencyKey } from "../common/validation/request-values";

@Injectable()
export class IdempotencyService {
  resolveKey(headers: IncomingHttpHeaders, payload: unknown): string | null {
    const candidates = [
      this.firstHeader(headers, "idempotency-key"),
      this.firstHeader(headers, "x-webhook-event-id"),
      this.payloadEventId(payload),
    ];

    for (const candidate of candidates) {
      if (candidate === null || candidate.trim().length === 0) {
        continue;
      }

      return normalizeIdempotencyKey(candidate);
    }

    return null;
  }

  extractProviderEventId(payload: unknown): string | undefined {
    const eventId = this.payloadEventId(payload);

    return eventId ? eventId.trim() : undefined;
  }

  private firstHeader(
    headers: IncomingHttpHeaders,
    name: string,
  ): string | null {
    const value = headers[name];
    const candidate = Array.isArray(value) ? value[0] : value;

    if (typeof candidate !== "string") {
      return null;
    }

    return candidate;
  }

  private payloadEventId(payload: unknown): string | null {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("eventId" in payload)
    ) {
      return null;
    }

    const eventId = (payload as { eventId?: unknown }).eventId;

    if (typeof eventId !== "string") {
      return null;
    }

    const trimmed = eventId.trim();

    return trimmed.length > 0 ? trimmed : null;
  }
}
