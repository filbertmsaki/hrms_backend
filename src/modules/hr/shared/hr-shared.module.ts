import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { CompanyUserDepartmentAccess } from '../departments/entities/company-user-department-access.entity';
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from './hr-access.service';
import { CodeGeneratorService } from './code-generator.service';
import { PositionAvailabilityService } from './position-availability.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyUserBranchAccess,
      Branch,
      CompanyUserDepartmentAccess,
      DepartmentPosition,
      Department,
      Employee,
    ]),
  ],
  providers: [
    HrAccessService,
    TenantGuard,
    CodeGeneratorService,
    PositionAvailabilityService,
  ],
  exports: [
    HrAccessService,
    TenantGuard,
    CodeGeneratorService,
    PositionAvailabilityService,
    TypeOrmModule,
  ],
})
export class HrSharedModule {}
