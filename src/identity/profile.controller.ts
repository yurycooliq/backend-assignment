import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { RequestWithContext } from "../common/http/request-context";
import { requireBrandId } from "../common/tenant/tenant";
import { GetProfileUseCase } from "./get-profile.use-case";
import { SessionAuthGuard } from "./session-auth.guard";

@ApiTags("profile")
@ApiHeader({ name: "X-Brand-Id", required: true })
@ApiBearerAuth()
@Controller("profile")
export class ProfileController {
  constructor(private readonly getProfileUseCase: GetProfileUseCase) {}

  @Get("me")
  @UseGuards(SessionAuthGuard)
  @ApiResponse({ status: 200, description: "Current user profile" })
  me(@Req() request: RequestWithContext): Promise<unknown> {
    return this.getProfileUseCase.execute(
      requireBrandId(request),
      request.auth?.userId ?? "",
    );
  }
}
