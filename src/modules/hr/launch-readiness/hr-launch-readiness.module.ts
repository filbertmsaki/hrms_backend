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
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from '../../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { HrLaunchReadinessController } from './hr-launch-readiness.controller';
import { HrLaunchReadinessService } from './hr-launch-readiness.service';
import { EmployeeAttendanceReadinessService } from './employee-attendance-readiness.service';

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
      EmployeeTimetable,
      ShiftAssignment,
      EmployeeDeviceAssignment,
      EmployeeAccessCredential,
    ]),
  ],
  controllers: [HrLaunchReadinessController],
  providers: [HrLaunchReadinessService, EmployeeAttendanceReadinessService],
  exports: [HrLaunchReadinessService, EmployeeAttendanceReadinessService],
})
export class HrLaunchReadinessModule {}
