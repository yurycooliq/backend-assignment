import { Injectable } from '@nestjs/common';
import { Prisma, RawEventStatus } from '@prisma/client';
import { IncomingHttpHeaders } from 'http';
import { ApplicationError } from '../common/errors/application-error';
import { normalizeProvider } from '../common/validation/request-values';
import { isUniqueConstraintViolation } from '../persistence/prisma-errors';
import { CallbacksRepository } from '../persistence/repositories/callbacks.repository';
import { IdempotencyService } from './idempotency.service';
import { IngestCallbackInput, IngestCallbackResult } from './dto/ingest-callback.dto';

@Injectable()
export class IngestCallbackUseCase {
  constructor(
    private readonly callbacksRepository: CallbacksRepository,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async execute(input: IngestCallbackInput): Promise<IngestCallbackResult> {
    const normalizedInput = { ...input, provider: normalizeProvider(input.provider) };
    const idempotencyKey = this.idempotencyService.resolveKey(input.headers, input.payload);

    if (!idempotencyKey) {
      throw ApplicationError.badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Stable callback idempotency key is required');
    }

    try {
      return await this.createFirstEvent(normalizedInput, idempotencyKey);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return this.recordDuplicateEvent(normalizedInput, idempotencyKey);
      }

      throw error;
    }
  }

  private createFirstEvent(input: IngestCallbackInput, idempotencyKey: string): Promise<IngestCallbackResult> {
    return this.callbacksRepository.transaction(async (client) => {
      const idempotency = await this.callbacksRepository.createIdempotencyKey(
        {
          brandId: input.brandId,
          source: input.source,
          provider: input.provider,
          key: idempotencyKey,
        },
        client,
      );
      const rawEvent = await this.callbacksRepository.createRawEvent(
        {
          brandId: input.brandId,
          source: input.source,
          provider: input.provider,
          idempotencyKey,
          providerEventId: this.idempotencyService.extractProviderEventId(input.payload),
          status: RawEventStatus.PENDING,
          payload: toJson(input.payload),
          headers: toJson(safeHeaders(input.headers)),
          correlationId: input.correlationId,
        },
        client,
      );

      await this.callbacksRepository.linkFirstRawEvent(idempotency.id, rawEvent.id, client);

      return {
        status: 'accepted',
        duplicate: false,
        source: input.source,
        provider: input.provider,
        idempotencyKey,
        rawEventId: rawEvent.id,
      };
    });
  }

  private recordDuplicateEvent(input: IngestCallbackInput, idempotencyKey: string): Promise<IngestCallbackResult> {
    return this.callbacksRepository.transaction(async (client) => {
      const existing = await this.callbacksRepository.findIdempotencyKey(
        {
          brandId: input.brandId,
          source: input.source,
          provider: input.provider,
          key: idempotencyKey,
        },
        client,
      );

      if (!existing) {
        throw ApplicationError.badRequest('IDEMPOTENCY_LOOKUP_FAILED', 'Unable to resolve duplicate idempotency key');
      }

      await this.callbacksRepository.createRawEvent(
        {
          brandId: input.brandId,
          source: input.source,
          provider: input.provider,
          idempotencyKey,
          providerEventId: this.idempotencyService.extractProviderEventId(input.payload),
          status: RawEventStatus.DUPLICATE,
          payload: toJson(input.payload),
          headers: toJson(safeHeaders(input.headers)),
          correlationId: input.correlationId,
          duplicateOfRawEventId: existing.firstRawEventId ?? undefined,
        },
        client,
      );
      const updated = await this.callbacksRepository.incrementDuplicateCount(existing.id, client);

      return {
        status: 'duplicate_ignored',
        duplicate: true,
        source: input.source,
        provider: input.provider,
        idempotencyKey,
        firstRawEventId: updated.firstRawEventId ?? undefined,
      };
    });
  }
}

function safeHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const allowedHeaderNames = new Set([
    'idempotency-key',
    'x-webhook-event-id',
    'x-brand-id',
    'x-correlation-id',
    'x-request-id',
    'content-type',
  ]);
  const result: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!allowedHeaderNames.has(name) || value === undefined) {
      continue;
    }

    result[name] = Array.isArray(value) ? value : String(value);
  }

  return result;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) {
    return {};
  }

  return value as Prisma.InputJsonValue;
}
