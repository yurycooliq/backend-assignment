import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { GetProfileUseCase } from "./get-profile.use-case";
import { LoginUseCase } from "./login.use-case";
import { PasswordService } from "./password.service";
import { ProfileController } from "./profile.controller";
import { RegisterUseCase } from "./register.use-case";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";

@Module({
  controllers: [AuthController, ProfileController],
  providers: [
    PasswordService,
    SessionService,
    SessionAuthGuard,
    RegisterUseCase,
    LoginUseCase,
    GetProfileUseCase,
  ],
  exports: [SessionService],
})
export class IdentityModule {}
