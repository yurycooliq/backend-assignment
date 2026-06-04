import { Global, Module } from '@nestjs/common';
import { CallbacksRepository } from './repositories/callbacks.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { UsersRepository } from './repositories/users.repository';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, UsersRepository, SessionsRepository, CallbacksRepository],
  exports: [PrismaService, UsersRepository, SessionsRepository, CallbacksRepository],
})
export class PersistenceModule {}
