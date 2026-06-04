import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CallbackSource } from "@prisma/client";
import { Response } from "express";
import { RequestWithContext } from "../common/http/request-context";
import { requireBrandId } from "../common/tenant/tenant";
import { IngestCallbackUseCase } from "./ingest-callback.use-case";

@ApiTags("webhooks")
@ApiHeader({ name: "X-Brand-Id", required: true })
@Controller("webhooks")
export class WebhookController {
  constructor(private readonly ingestCallbackUseCase: IngestCallbackUseCase) {}

  @Post("psp/:provider")
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: "First PSP callback accepted",
  })
  ingestPsp(
    @Param("provider") provider: string,
    @Body() payload: unknown,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    return this.ingest(
      CallbackSource.PSP,
      provider,
      payload,
      request,
      response,
    );
  }

  @Post("gsp/:provider")
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: "First GSP callback accepted",
  })
  ingestGsp(
    @Param("provider") provider: string,
    @Body() payload: unknown,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    return this.ingest(
      CallbackSource.GSP,
      provider,
      payload,
      request,
      response,
    );
  }

  private async ingest(
    source: CallbackSource,
    provider: string,
    payload: unknown,
    request: RequestWithContext,
    response: Response,
  ): Promise<unknown> {
    const result = await this.ingestCallbackUseCase.execute({
      brandId: requireBrandId(request),
      source,
      provider,
      payload,
      headers: request.headers,
      correlationId: request.requestContext?.requestId,
    });

    response.status(result.duplicate ? HttpStatus.OK : HttpStatus.ACCEPTED);

    return result;
  }
}
