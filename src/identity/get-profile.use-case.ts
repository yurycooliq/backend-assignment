import { Injectable } from "@nestjs/common";
import { ApplicationError } from "../common/errors/application-error";
import { UsersRepository } from "../persistence/repositories/users.repository";

@Injectable()
export class GetProfileUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(
    brandId: string,
    userId: string,
  ): Promise<{ id: string; brandId: string; email: string }> {
    const user = await this.usersRepository.findById(brandId, userId);

    if (!user) {
      throw ApplicationError.unauthorized(
        "INVALID_SESSION",
        "Session user is no longer available",
      );
    }

    return {
      id: user.id,
      brandId: user.brandId,
      email: user.email,
    };
  }
}
