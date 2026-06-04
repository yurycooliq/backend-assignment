import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma, Session } from '@prisma/client';
import { ApplicationError } from '../common/errors/application-error';
import { SessionsRepository } from '../persistence/repositories/sessions.repository';

@Injectable()
export class SessionService {
  private readonly ttlSeconds = Number(process.env.SESSION_TTL_SECONDS ?? 604800);

  constructor(private readonly sessionsRepository: SessionsRepository) {}

  async createSession(
    brandId: string,
    userId: string,
    client?: Prisma.TransactionClient,
  ): Promise<{ accessToken: string; session: Session }> {
    const accessToken = `sess_${randomBytes(32).toString('base64url')}`;
    const tokenHash = this.hashToken(accessToken);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const session = await this.sessionsRepository.create({ brandId, userId, tokenHash, expiresAt }, client);

    return { accessToken, session };
  }

  async authenticate(brandId: string, accessToken: string): Promise<Session> {
    const tokenHash = this.hashToken(accessToken);
    const session = await this.sessionsRepository.findByTokenHash(tokenHash);

    if (!session) {
      throw ApplicationError.unauthorized('INVALID_SESSION', 'Session token is invalid');
    }

    if (session.brandId !== brandId) {
      throw ApplicationError.forbidden('TENANT_MISMATCH', 'Session belongs to a different brand');
    }

    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw ApplicationError.unauthorized('INVALID_SESSION', 'Session is expired or revoked');
    }

    return session;
  }

  private hashToken(accessToken: string): string {
    return createHash('sha256').update(accessToken).digest('hex');
  }
}
