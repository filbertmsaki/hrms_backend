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
import { DeviceSecretBackfillService } from './service/device-secret-backfill.service';
import { DeviceHealthCronService } from './service/device-health-cron.service';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDevice,
      Branch,
      Employee,
      EmployeeDeviceAssignment,
      CompanyUser,
    ]),
    DeviceManagementHikvisionModule,
    NotificationsModule,
  ],
  controllers: [
    AccessControlAttendanceDevicesController,
    AttendanceDevicesController,
  ],
  providers: [
    AccessControlAttendanceDevicesService,
    DeviceSecretBackfillService,
    DeviceHealthCronService,
    PostgresAdvisoryLockService,
  ],
  exports: [AccessControlAttendanceDevicesService],
})
export class AccessControlAttendanceDevicesModule {}
