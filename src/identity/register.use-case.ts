import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { ApplicationError } from '../common/errors/application-error';
import { PrismaService } from '../persistence/prisma.service';
import { isUniqueConstraintViolation } from '../persistence/prisma-errors';
import { UsersRepository } from '../persistence/repositories/users.repository';
import { AuthDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(brandId: string, dto: AuthDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const existing = await this.usersRepository.findByEmail(brandId, email);

    if (existing) {
      throw ApplicationError.conflict('USER_ALREADY_EXISTS', 'User already exists in this brand');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (client) => {
        const user = await this.usersRepository.create({ brandId, email, passwordHash }, client);
        const { accessToken, session } = await this.sessionService.createSession(brandId, user.id, client);

        return toAuthResult(user, accessToken, session.expiresAt);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw ApplicationError.conflict('USER_ALREADY_EXISTS', 'User already exists in this brand');
      }

      throw error;
    }
  }
}

export interface AuthResult {
  user: {
    id: string;
    brandId: string;
    email: string;
  };
  session: {
    accessToken: string;
    expiresAt: string;
  };
}

export function toAuthResult(user: User, accessToken: string, expiresAt: Date): AuthResult {
  return {
    user: {
      id: user.id,
      brandId: user.brandId,
      email: user.email,
    },
    session: {
      accessToken,
      expiresAt: expiresAt.toISOString(),
    },
  };
}
