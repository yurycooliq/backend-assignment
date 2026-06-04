import { CallbackSource, RawEventStatus } from '@prisma/client';
import { IngestCallbackUseCase } from './ingest-callback.use-case';
import { IdempotencyService } from './idempotency.service';

describe('IngestCallbackUseCase', () => {
  it('creates one pending event for the first callback and one duplicate event for a retry', async () => {
    const repository = new FakeCallbacksRepository();
    const useCase = new IngestCallbackUseCase(repository as never, new IdempotencyService());
    const input = {
      brandId: 'brandA',
      source: CallbackSource.PSP,
      provider: 'mock-pay',
      payload: { eventId: 'psp_evt_dup_1', type: 'payment.succeeded' },
      headers: { 'x-webhook-event-id': 'psp_evt_dup_1' },
      correlationId: 'unit-test-1',
    };

    const first = await useCase.execute(input);
    const duplicate = await useCase.execute(input);

    expect(first).toMatchObject({
      status: 'accepted',
      duplicate: false,
      idempotencyKey: 'psp_evt_dup_1',
    });
    expect(duplicate).toMatchObject({
      status: 'duplicate_ignored',
      duplicate: true,
      idempotencyKey: 'psp_evt_dup_1',
      firstRawEventId: first.rawEventId,
    });
    expect(repository.rawEvents.filter((event) => event.status === RawEventStatus.PENDING)).toHaveLength(1);
    expect(repository.rawEvents.filter((event) => event.status === RawEventStatus.DUPLICATE)).toHaveLength(1);
    expect(repository.rawEvents.map((event) => event.status)).toEqual([
      RawEventStatus.PENDING,
      RawEventStatus.DUPLICATE,
    ]);
    expect(repository.rawEvents.every((event) => event.providerEventId === 'psp_evt_dup_1')).toBe(true);
    expect(repository.idempotencyKeys[0]?.duplicateCount).toBe(1);
  });
});

class FakeCallbacksRepository {
  idempotencyKeys: Array<{
    id: string;
    brandId: string;
    source: CallbackSource;
    provider: string;
    key: string;
    firstRawEventId?: string;
    duplicateCount: number;
  }> = [];

  rawEvents: Array<{
    id: string;
    brandId: string;
    source: CallbackSource;
    provider: string;
    idempotencyKey: string;
    providerEventId?: string;
    status: RawEventStatus;
    duplicateOfRawEventId?: string;
  }> = [];

  async transaction<T>(handler: (client: unknown) => Promise<T>): Promise<T> {
    return handler(this);
  }

  async createIdempotencyKey(input: {
    brandId: string;
    source: CallbackSource;
    provider: string;
    key: string;
  }): Promise<{
    id: string;
    brandId: string;
    source: CallbackSource;
    provider: string;
    key: string;
    firstRawEventId?: string;
    duplicateCount: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const existing = this.findKey(input);

    if (existing) {
      throw { code: 'P2002' };
    }

    const record = {
      id: `idem_${this.idempotencyKeys.length + 1}`,
      ...input,
      duplicateCount: 0,
    };
    this.idempotencyKeys.push(record);

    return { ...record, createdAt: new Date(), updatedAt: new Date() };
  }

  async findIdempotencyKey(scope: {
    brandId: string;
    source: CallbackSource;
    provider: string;
    key: string;
  }): Promise<{
    id: string;
    brandId: string;
    source: CallbackSource;
    provider: string;
    key: string;
    firstRawEventId?: string | null;
    duplicateCount: number;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const record = this.findKey(scope);

    return record ? { ...record, createdAt: new Date(), updatedAt: new Date() } : null;
  }

  async linkFirstRawEvent(
    id: string,
    firstRawEventId: string,
  ): Promise<{
    id: string;
    brandId: string;
    source: CallbackSource;
    provider: string;
    key: string;
    firstRawEventId?: string;
    duplicateCount: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const record = this.idempotencyKeys.find((item) => item.id === id);

    if (!record) {
      throw new Error('missing idempotency key');
    }

    record.firstRawEventId = firstRawEventId;

    return { ...record, createdAt: new Date(), updatedAt: new Date() };
  }

  async incrementDuplicateCount(id: string): Promise<{
    id: string;
    brandId: string;
    source: CallbackSource;
    provider: string;
    key: string;
    firstRawEventId?: string;
    duplicateCount: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const record = this.idempotencyKeys.find((item) => item.id === id);

    if (!record) {
      throw new Error('missing idempotency key');
    }

    record.duplicateCount += 1;

    return { ...record, createdAt: new Date(), updatedAt: new Date() };
  }

  async createRawEvent(input: {
    brandId: string;
    source: CallbackSource;
    provider: string;
    idempotencyKey: string;
    providerEventId?: string;
    status: RawEventStatus;
    payload: unknown;
    headers: unknown;
    correlationId?: string;
    duplicateOfRawEventId?: string;
  }): Promise<{
    id: string;
    brandId: string;
    source: CallbackSource;
    provider: string;
    idempotencyKey: string;
    providerEventId: string | null;
    status: RawEventStatus;
    payload: unknown;
    headers: unknown;
    correlationId: string | null;
    duplicateOfRawEventId: string | null;
    receivedAt: Date;
  }> {
    const record = {
      id: `raw_${this.rawEvents.length + 1}`,
      brandId: input.brandId,
      source: input.source,
      provider: input.provider,
      idempotencyKey: input.idempotencyKey,
      providerEventId: input.providerEventId,
      status: input.status,
      duplicateOfRawEventId: input.duplicateOfRawEventId,
    };
    this.rawEvents.push(record);

    return {
      ...record,
      providerEventId: input.providerEventId ?? null,
      payload: input.payload,
      headers: input.headers,
      correlationId: input.correlationId ?? null,
      duplicateOfRawEventId: input.duplicateOfRawEventId ?? null,
      receivedAt: new Date(),
    };
  }

  private findKey(scope: { brandId: string; source: CallbackSource; provider: string; key: string }) {
    return this.idempotencyKeys.find(
      (item) =>
        item.brandId === scope.brandId &&
        item.source === scope.source &&
        item.provider === scope.provider &&
        item.key === scope.key,
    );
  }
}
