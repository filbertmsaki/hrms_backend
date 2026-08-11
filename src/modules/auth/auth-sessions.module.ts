import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthSession } from './entities/auth-session.entity';
import { AuthSessionsService } from './auth-sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuthSession])],
  providers: [AuthSessionsService],
  exports: [AuthSessionsService, TypeOrmModule],
})
export class AuthSessionsModule {}
