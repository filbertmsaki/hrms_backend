import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { IdentityChangeAudit } from './entities/identity-change-audit.entity';
import { IdentityAuditController } from './identity-audit.controller';
import { IdentityAuditService } from './identity-audit.service';
import { IdentitySyncService } from './identity-sync.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdentityChangeAudit])],
  controllers: [IdentityAuditController],
  providers: [IdentitySyncService, IdentityAuditService, TenantGuard],
  exports: [IdentitySyncService],
})
export class IdentitySyncModule {}
