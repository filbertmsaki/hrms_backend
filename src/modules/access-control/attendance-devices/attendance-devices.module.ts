import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HikvisionModule as DeviceManagementHikvisionModule } from '../../hikvision/hikvision.module';
import { Branch } from '../../hr/branches/entities/branch.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { AccessControlAttendanceDevicesController } from './controller/attendance-devices.controller';
import { AttendanceDevicesController } from './controller/legacy-attendance-devices.controller';
import { AttendanceDevice } from './entities/attendance-device.entity';
import { AccessControlAttendanceDevicesService } from './service/attendance-devices.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDevice,
      Branch,
      Employee,
      EmployeeDeviceAssignment,
    ]),
    DeviceManagementHikvisionModule,
  ],
  controllers: [
    AccessControlAttendanceDevicesController,
    AttendanceDevicesController,
  ],
  providers: [AccessControlAttendanceDevicesService],
  exports: [AccessControlAttendanceDevicesService],
})
export class AccessControlAttendanceDevicesModule {}
