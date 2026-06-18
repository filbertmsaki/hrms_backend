import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendancePoliciesController } from './policies/attendance-policies.controller';
import { AttendancePoliciesService } from './policies/attendance-policies.service';
import { AttendanceCheckpointsController } from './checkpoints/attendance-checkpoints.controller';
import { AttendanceCheckpointsService } from './checkpoints/attendance-checkpoints.service';
import { AttendanceHolidayGroupsController } from './holidays/attendance-holiday-groups.controller';
import { AttendanceHolidayGroupsService } from './holidays/attendance-holiday-groups.service';
import { AttendanceHolidaysController } from './holidays/attendance-holidays.controller';
import { AttendanceHolidaysService } from './holidays/attendance-holidays.service';
import { AttendanceDeviceSyncLogsController } from './sync-logs/attendance-device-sync-logs.controller';
import { AttendanceDeviceSyncLogsService } from './sync-logs/attendance-device-sync-logs.service';
import { AttendanceSettingsController } from './settings/attendance-settings.controller';
import { AttendanceSettingsService } from './settings/attendance-settings.service';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { AttendanceCheckpoint } from './checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceDeviceSyncLog } from './sync-logs/entities/attendance-device-sync-log.entity';
import { AttendancePolicy } from './policies/entities/attendance-policy.entity';
import { AttendanceSetting } from './settings/entities/attendance-setting.entity';
import { HolidayGroup } from './holidays/entities/holiday-group.entity';
import { AttendanceHoliday } from './holidays/entities/holiday.entity';
import { Branch } from '../branches/entities/branch.entity';
import { HikvisionModule as DeviceManagementHikvisionModule } from '../../hikvision/hikvision.module';
import { AttendanceProcessingModule } from './processing/attendance-processing.module';
import { AttendanceGeofence } from './geofences/entities/attendance-geofence.entity';
import { AttendanceGeofencesController } from './geofences/attendance-geofences.controller';
import { AttendanceGeofencesService } from './geofences/attendance-geofences.service';
import { AttendanceGeofenceRepository } from './geofences/repositories/attendance-geofence.repository';
import { GeofenceDistanceService } from './geofences/geofence-distance.service';
import { AttendanceWifiNetwork } from './wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceWifiNetworksController } from './wifi-networks/attendance-wifi-networks.controller';
import { AttendanceWifiNetworksService } from './wifi-networks/attendance-wifi-networks.service';
import { AttendanceWifiNetworkRepository } from './wifi-networks/repositories/attendance-wifi-network.repository';
import { IpCidrValidatorService } from './wifi-networks/validators/ip-cidr-validator.service';
import { WifiNetworkValidatorService } from './wifi-networks/validators/wifi-network-validator.service';
import { AttendanceMobilePunchesController } from './mobile-punches/attendance-mobile-punches.controller';
import { AttendanceMobilePunch } from './mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendanceMobilePunchRepository } from './mobile-punches/repositories/attendance-mobile-punch.repository';
import { AttendanceMobilePunchesService } from './mobile-punches/attendance-mobile-punches.service';
import { Employee } from '../employees/entities/employee.entity';
import { HikvisionAttendanceLog } from '../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceProcessedEvent } from './processing/entities/attendance-processed-event.entity';
import { AttendanceDailySummary } from './processing/entities/attendance-daily-summary.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendancePolicy,
      AttendanceSetting,
      HolidayGroup,
      AttendanceHoliday,
      AttendanceCheckpoint,
      AttendanceGeofence,
      AttendanceWifiNetwork,
      AttendanceMobilePunch,
      Employee,
      AttendanceDevice,
      AttendanceDeviceSyncLog,
      Branch,
      EmployeeDeviceAssignment,
      HikvisionAttendanceLog,
      AttendanceProcessedEvent,
      AttendanceDailySummary,
    ]),
    DeviceManagementHikvisionModule,
    AttendanceProcessingModule,
  ],
  controllers: [
    AttendancePoliciesController,
    AttendanceSettingsController,
    AttendanceHolidayGroupsController,
    AttendanceHolidaysController,
    AttendanceCheckpointsController,
    AttendanceDeviceSyncLogsController,
    AttendanceGeofencesController,
    AttendanceWifiNetworksController,
    AttendanceMobilePunchesController,
  ],
  providers: [
    AttendancePoliciesService,
    AttendanceSettingsService,
    AttendanceHolidayGroupsService,
    AttendanceHolidaysService,
    AttendanceCheckpointsService,
    AttendanceDeviceSyncLogsService,
    AttendanceGeofencesService,
    AttendanceGeofenceRepository,
    GeofenceDistanceService,
    AttendanceWifiNetworksService,
    AttendanceWifiNetworkRepository,
    IpCidrValidatorService,
    WifiNetworkValidatorService,
    AttendanceMobilePunchesService,
    AttendanceMobilePunchRepository,
  ],
  exports: [
    AttendancePoliciesService,
    TypeOrmModule,
    AttendanceGeofencesService,
    AttendanceGeofenceRepository,
    GeofenceDistanceService,
    AttendanceWifiNetworksService,
    AttendanceWifiNetworkRepository,
    WifiNetworkValidatorService,
    IpCidrValidatorService,
    AttendanceMobilePunchesService,
    AttendanceMobilePunchRepository,
  ],
})
export class AttendanceModule {}
