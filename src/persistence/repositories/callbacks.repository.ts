import { Injectable } from "@nestjs/common";
import {
  CallbackSource,
  IdempotencyKey,
  Prisma,
  RawEvent,
  RawEventStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CallbacksRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(
    handler: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  createIdempotencyKey(
    input: {
      brandId: string;
      source: CallbackSource;
      provider: string;
      key: string;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<IdempotencyKey> {
    return client.idempotencyKey.create({
      data: input,
    });
  }

  findIdempotencyKey(
    scope: {
      brandId: string;
      source: CallbackSource;
      provider: string;
      key: string;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<IdempotencyKey | null> {
    return client.idempotencyKey.findUnique({
      where: {
        brandId_source_provider_key: scope,
      },
    });
  }

  linkFirstRawEvent(
    id: string,
    firstRawEventId: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<IdempotencyKey> {
    return client.idempotencyKey.update({
      where: { id },
      data: { firstRawEventId },
    });
  }

  incrementDuplicateCount(
    id: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<IdempotencyKey> {
    return client.idempotencyKey.update({
      where: { id },
      data: {
        duplicateCount: {
          increment: 1,
        },
      },
    });
  }

  createRawEvent(
    input: {
      brandId: string;
      source: CallbackSource;
      provider: string;
      idempotencyKey: string;
      providerEventId?: string;
      status: RawEventStatus;
      payload: Prisma.InputJsonValue;
      headers?: Prisma.InputJsonValue;
      correlationId?: string;
      duplicateOfRawEventId?: string;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<RawEvent> {
    return client.rawEvent.create({
      data: {
        brandId: input.brandId,
        source: input.source,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey,
        providerEventId: input.providerEventId,
        status: input.status,
        payload: input.payload,
        headers: input.headers,
        correlationId: input.correlationId,
        duplicateOfRawEventId: input.duplicateOfRawEventId,
      },
    });
  }
}
