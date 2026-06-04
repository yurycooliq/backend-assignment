import { Injectable } from '@nestjs/common';
import { Prisma, Session } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: { brandId: string; userId: string; tokenHash: string; expiresAt: Date },
    client: PrismaClientLike = this.prisma,
  ): Promise<Session> {
    return client.session.create({
      data: input,
    });
  }

  findByTokenHash(tokenHash: string, client: PrismaClientLike = this.prisma): Promise<Session | null> {
    return client.session.findUnique({
      where: {
        tokenHash,
      },
    });
  }
}
