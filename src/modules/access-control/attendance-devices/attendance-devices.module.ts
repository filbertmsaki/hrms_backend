import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceDevice } from '../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { AccessControlAttendanceDevicesController } from './controller/attendance-devices.controller';
import { AccessControlAttendanceDevicesService } from './service/attendance-devices.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDevice,
      Employee,
      EmployeeDeviceAssignment,
    ]),
  ],
  controllers: [AccessControlAttendanceDevicesController],
  providers: [AccessControlAttendanceDevicesService],
  exports: [AccessControlAttendanceDevicesService],
})
export class AccessControlAttendanceDevicesModule {}
