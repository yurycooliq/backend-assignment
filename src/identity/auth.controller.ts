import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { ApiHeader, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequestWithContext } from "../common/http/request-context";
import { requireBrandId } from "../common/tenant/tenant";
import { AuthDto } from "./dto/auth.dto";
import { LoginUseCase } from "./login.use-case";
import { RegisterUseCase } from "./register.use-case";

@ApiTags("auth")
@ApiHeader({ name: "X-Brand-Id", required: true })
@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  @Post("register")
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "User registered and session created",
  })
  register(
    @Req() request: RequestWithContext,
    @Body() dto: AuthDto,
  ): Promise<unknown> {
    return this.registerUseCase.execute(requireBrandId(request), dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, description: "Session created" })
  login(
    @Req() request: RequestWithContext,
    @Body() dto: AuthDto,
  ): Promise<unknown> {
    return this.loginUseCase.execute(requireBrandId(request), dto);
  }
}
