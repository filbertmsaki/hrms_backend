import { Module } from '@nestjs/common';
import { BranchesModule } from './branches/branches.module';
import { DesignationsModule } from './designations/designations.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeeDesignationsModule } from './employee-designations/employee-designations.module';
import { EmployeePositionsModule } from './employee-positions/employee-positions.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PositionsModule } from './positions/positions.module';

@Module({
  imports: [
    BranchesModule,
    DepartmentsModule,
    DesignationsModule,
    PositionsModule,
    EmployeesModule,
    EmployeePositionsModule,
    EmployeeDesignationsModule,
    LeaveModule,
    OnboardingModule,
  ],
})
export class HrModule {}
