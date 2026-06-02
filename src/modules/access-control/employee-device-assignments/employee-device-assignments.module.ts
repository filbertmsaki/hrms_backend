import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeAccessCredential } from '../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceRightPlan } from '../employee-device-right-plans/entity/employee-device-right-plan.entity';
import { AttendanceDevice } from '../../hr/attendance/devices/entities/attendance-device.entity';
import { EmployeeDeviceIdentity } from '../../hr/attendance/processing/entities/employee-device-identity.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAssignment } from './entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentsController } from './controller/employee-device-assignments.controller';
import { EmployeeDeviceAssignmentsService } from './service/employee-device-assignments.service';
import { HikvisionModule } from '../../hikvision/hikvision.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeDeviceAssignment,
      Employee,
      AttendanceDevice,
      EmployeeDeviceIdentity,
      EmployeeDeviceRightPlan,
      EmployeeAccessCredential,
    ]),
    HikvisionModule,
  ],
  controllers: [EmployeeDeviceAssignmentsController],
  providers: [EmployeeDeviceAssignmentsService],
  exports: [EmployeeDeviceAssignmentsService],
})
export class EmployeeDeviceAssignmentsModule {}
