import { Module } from '@nestjs/common';
import { ShiftEngineModule } from '../attendance/shift/shift-engine.module';
import { TimetableEngineModule } from '../attendance/timetable/timetable-engine.module';
import { EmployeesModule } from '../employees/employees.module';
import { EmploymentHistoryModule } from '../employment-history/employment-history.module';
import { HrLaunchReadinessModule } from '../launch-readiness/hr-launch-readiness.module';
import { OffboardingModule } from '../offboarding/offboarding.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { ProbationModule } from '../probation/probation.module';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeeStatusChangeController } from './employee-status-change.controller';
import { EmployeeStatusChangeService } from './employee-status-change.service';

/**
 * Employee status changes with inline prerequisites. Kept outside
 * EmployeesModule because it composes onboarding, offboarding and attendance,
 * which themselves depend on EmployeesModule.
 */
@Module({
  imports: [
    HrSharedModule,
    EmployeesModule,
    EmploymentHistoryModule,
    ShiftEngineModule,
    TimetableEngineModule,
    HrLaunchReadinessModule,
    OnboardingModule,
    OffboardingModule,
    ProbationModule,
  ],
  controllers: [EmployeeStatusChangeController],
  providers: [EmployeeStatusChangeService],
})
export class EmployeeStatusChangeModule {}
