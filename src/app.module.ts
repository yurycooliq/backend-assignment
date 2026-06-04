import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CallbacksModule } from './callbacks/callbacks.module';
import { RequestContextMiddleware } from './common/logging/request-context.middleware';
import { IdentityModule } from './identity/identity.module';
import { PersistenceModule } from './persistence/persistence.module';

@Module({
  imports: [PersistenceModule, IdentityModule, CallbacksModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
