import { Injectable } from "@nestjs/common";
import { ApplicationError } from "../common/errors/application-error";
import { UsersRepository } from "../persistence/repositories/users.repository";
import { AuthDto } from "./dto/auth.dto";
import { AuthResult, toAuthResult } from "./register.use-case";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(brandId: string, dto: AuthDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.usersRepository.findByEmail(brandId, email);

    if (!user) {
      throw ApplicationError.unauthorized(
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }

    const passwordMatches = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw ApplicationError.unauthorized(
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }

    const { accessToken, session } = await this.sessionService.createSession(
      brandId,
      user.id,
    );

    return toAuthResult(user, accessToken, session.expiresAt);
  }
}
