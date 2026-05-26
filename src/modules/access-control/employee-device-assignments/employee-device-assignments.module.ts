import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceDevice } from '../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAssignment } from './entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentsController } from './controller/employee-device-assignments.controller';
import { EmployeeDeviceAssignmentsService } from './service/employee-device-assignments.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeDeviceAssignment, Employee, AttendanceDevice])],
  controllers: [EmployeeDeviceAssignmentsController],
  providers: [EmployeeDeviceAssignmentsService],
  exports: [EmployeeDeviceAssignmentsService],
})
export class EmployeeDeviceAssignmentsModule {}
