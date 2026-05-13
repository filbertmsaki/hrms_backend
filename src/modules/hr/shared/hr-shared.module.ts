import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { HrAccessService } from './hr-access.service';
import { CodeGeneratorService } from './code-generator.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyUserBranchAccess])],
  providers: [HrAccessService, TenantGuard, CodeGeneratorService],
  exports: [HrAccessService, TenantGuard, CodeGeneratorService, TypeOrmModule],
})
export class HrSharedModule {}
