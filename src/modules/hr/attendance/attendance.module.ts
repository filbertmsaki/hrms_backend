import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendancePoliciesController } from './policies/attendance-policies.controller';
import { AttendancePoliciesService } from './policies/attendance-policies.service';
import { AttendanceCheckpointsController } from './checkpoints/attendance-checkpoints.controller';
import { AttendanceCheckpointsService } from './checkpoints/attendance-checkpoints.service';
import { AttendanceDevicesController } from './devices/attendance-devices.controller';
import { AttendanceDevicesService } from './devices/attendance-devices.service';
import { AttendanceHolidayGroupsController } from './holidays/attendance-holiday-groups.controller';
import { AttendanceHolidayGroupsService } from './holidays/attendance-holiday-groups.service';
import { AttendanceHolidaysController } from './holidays/attendance-holidays.controller';
import { AttendanceHolidaysService } from './holidays/attendance-holidays.service';
import { AttendanceDeviceSyncLogsController } from './sync-logs/attendance-device-sync-logs.controller';
import { AttendanceDeviceSyncLogsService } from './sync-logs/attendance-device-sync-logs.service';
import { AttendanceSettingsController } from './settings/attendance-settings.controller';
import { AttendanceSettingsService } from './settings/attendance-settings.service';
import { AttendanceCheckpoint } from './checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceDeviceSyncLog } from './sync-logs/entities/attendance-device-sync-log.entity';
import { AttendanceDevice } from './devices/entities/attendance-device.entity';
import { AttendancePolicy } from './policies/entities/attendance-policy.entity';
import { AttendanceSetting } from './settings/entities/attendance-setting.entity';
import { HolidayGroup } from './holidays/entities/holiday-group.entity';
import { AttendanceHoliday } from './holidays/entities/holiday.entity';
import { Branch } from '../branches/entities/branch.entity';
import { HikvisionModule as DeviceManagementHikvisionModule } from '../../hikvision/hikvision.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendancePolicy,
      AttendanceSetting,
      HolidayGroup,
      AttendanceHoliday,
      AttendanceCheckpoint,
      AttendanceDevice,
      AttendanceDeviceSyncLog,
      Branch,
    ]),
    DeviceManagementHikvisionModule,
  ],
  controllers: [
    AttendancePoliciesController,
    AttendanceSettingsController,
    AttendanceHolidayGroupsController,
    AttendanceHolidaysController,
    AttendanceDevicesController,
    AttendanceCheckpointsController,
    AttendanceDeviceSyncLogsController,
  ],
  providers: [
    AttendancePoliciesService,
    AttendanceSettingsService,
    AttendanceHolidayGroupsService,
    AttendanceHolidaysService,
    AttendanceDevicesService,
    AttendanceCheckpointsService,
    AttendanceDeviceSyncLogsService,
  ],
  exports: [AttendancePoliciesService, TypeOrmModule],
})
export class AttendanceModule {}




