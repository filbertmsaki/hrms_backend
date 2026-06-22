import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Permission } from '../../permissions/entities/permission.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AttendancePolicy } from '../attendance/policies/entities/attendance-policy.entity';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { HrLaunchReadinessController } from './hr-launch-readiness.controller';
import { HrLaunchReadinessService } from './hr-launch-readiness.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyUser,
      Permission,
      Branch,
      Department,
      Employee,
      AttendancePolicy,
      Shift,
      Timetable,
      AttendanceDailySummary,
      AttendanceDevice,
    ]),
  ],
  controllers: [HrLaunchReadinessController],
  providers: [HrLaunchReadinessService],
  exports: [HrLaunchReadinessService],
})
export class HrLaunchReadinessModule {}
