import { Module } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service";
import { IngestCallbackUseCase } from "./ingest-callback.use-case";
import { WebhookController } from "./webhook.controller";

@Module({
  controllers: [WebhookController],
  providers: [IdempotencyService, IngestCallbackUseCase],
})
export class CallbacksModule {}
