import { Module } from '@nestjs/common';
import { AttendanceModule } from './attendance/attendance.module';
import { BranchesModule } from './branches/branches.module';
import { DesignationsModule } from './designations/designations.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeeDesignationsModule } from './employee-designations/employee-designations.module';
import { EmployeePositionsModule } from './employee-positions/employee-positions.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OffboardingModule } from './offboarding/offboarding.module';
import { PositionsModule } from './positions/positions.module';
import { TimetableEngineModule } from './attendance/timetable/timetable-engine.module';
import { ShiftEngineModule } from './attendance/shift/shift-engine.module';

@Module({
  imports: [
    AttendanceModule,
    ShiftEngineModule,
    TimetableEngineModule,
    BranchesModule,
    DepartmentsModule,
    DesignationsModule,
    PositionsModule,
    EmployeesModule,
    EmployeePositionsModule,
    EmployeeDesignationsModule,
    LeaveModule,
    OnboardingModule,
    OffboardingModule,
  ],
})
export class HrModule {}
