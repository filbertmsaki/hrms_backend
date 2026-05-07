import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { HrAccessService } from './hr-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyUserBranchAccess])],
  providers: [HrAccessService, TenantGuard],
  exports: [HrAccessService, TenantGuard, TypeOrmModule],
})
export class HrSharedModule {}
