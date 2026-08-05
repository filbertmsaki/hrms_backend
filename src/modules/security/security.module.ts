import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityEvent } from './entities/security-event.entity';
import { SecurityEventsController } from './security-events.controller';
import { SecurityEventsService } from './security-events.service';
import { TwoFactorPolicyService } from './two-factor-policy.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SecurityEvent])],
  controllers: [SecurityEventsController],
  providers: [SecurityEventsService, TwoFactorPolicyService],
  exports: [SecurityEventsService, TwoFactorPolicyService],
})
export class SecurityModule {}
