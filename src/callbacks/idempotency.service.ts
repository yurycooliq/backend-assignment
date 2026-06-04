import { Injectable } from '@nestjs/common';
import { IncomingHttpHeaders } from 'http';

@Injectable()
export class IdempotencyService {
  resolveKey(headers: IncomingHttpHeaders, payload: unknown): string | null {
    return (
      this.firstHeader(headers, 'idempotency-key') ??
      this.firstHeader(headers, 'x-webhook-event-id') ??
      this.payloadEventId(payload)
    );
  }

  private firstHeader(headers: IncomingHttpHeaders, name: string): string | null {
    const value = headers[name];
    const candidate = Array.isArray(value) ? value[0] : value;

    if (typeof candidate !== 'string') {
      return null;
    }

    const trimmed = candidate.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private payloadEventId(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || !('eventId' in payload)) {
      return null;
    }

    const eventId = (payload as { eventId?: unknown }).eventId;

    if (typeof eventId !== 'string') {
      return null;
    }

    const trimmed = eventId.trim();

    return trimmed.length > 0 ? trimmed : null;
  }
}
