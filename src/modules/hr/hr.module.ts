import { Module } from '@nestjs/common';
import { BranchesModule } from './branches/branches.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PositionsModule } from './positions/positions.module';

@Module({
  imports: [
    BranchesModule,
    DepartmentsModule,
    PositionsModule,
    EmployeesModule,
    LeaveModule,
    OnboardingModule,
  ],
})
export class HrModule {}
