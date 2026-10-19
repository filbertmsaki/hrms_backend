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
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { AttendanceCheckpoint } from './checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceCheckpointQrTokenUse } from './checkpoints/entities/attendance-checkpoint-qr-token-use.entity';
import { AttendanceCheckpointQrService } from './checkpoints/attendance-checkpoint-qr.service';
import { AttendanceDeviceSyncLog } from './sync-logs/entities/attendance-device-sync-log.entity';
import { AttendancePolicy } from './policies/entities/attendance-policy.entity';
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
import { AttendanceMobileDeviceRegistration } from './mobile-punches/entities/attendance-mobile-device-registration.entity';
import { AttendanceMobileDeviceRegistrationAudit } from './mobile-punches/entities/attendance-mobile-device-registration-audit.entity';
import { AttendanceMobilePunchRepository } from './mobile-punches/repositories/attendance-mobile-punch.repository';
import { AttendanceMobilePunchesService } from './mobile-punches/attendance-mobile-punches.service';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceProcessedEvent } from './processing/entities/attendance-processed-event.entity';
import { AttendanceDailySummary } from './processing/entities/attendance-daily-summary.entity';
import { AttendanceCompanyConfigService } from './shared/attendance-company-config.service';

import { Shift } from './shift/shifts/entities/shift.entity';
import { ShiftAssignment } from './shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftSchedule } from './shift/shift-schedules/entities/shift-schedule.entity';
import { Timetable } from './timetable/timetables/entities/timetable.entity';
import { EmployeeTimetable } from './timetable/employee-timetables/entities/employee-timetable.entity';
import { AttendanceSchedulePreviewController } from './schedules/attendance-schedule-preview.controller';
import { AttendanceSchedulePreviewService } from './schedules/attendance-schedule-preview.service';
import { EmployeeWorkSchedule } from './schedules/entities/employee-work-schedule.entity';
import { EmployeeWorkSchedulesController } from './schedules/employee-work-schedules.controller';
import { EmployeeWorkSchedulesService } from './schedules/employee-work-schedules.service';
import { TimetableDayShiftOption } from './timetable/timetable-days/entities/timetable-day-shift-option.entity';
import { TimetableDay } from './timetable/timetable-days/entities/timetable-day.entity';
import { AttendanceScheduleAuditLog } from './schedules/entities/attendance-schedule-audit-log.entity';
import { AttendanceScheduleAuditService } from './schedules/attendance-schedule-audit.service';
import { AttendanceSetupController } from './setup/attendance-setup.controller';
import { AttendanceSetupWizardService } from './setup/attendance-setup-wizard.service';
import { AttendanceSetupCompletionService } from './setup/attendance-setup-completion.service';
import { FilesModule } from '../../files/files.module';
import { AttendanceWorkFromHomeRequest } from './work-from-home/entities/attendance-work-from-home-request.entity';
import { AttendanceWorkFromHomeController } from './work-from-home/attendance-work-from-home.controller';
import { AttendanceWorkFromHomeService } from './work-from-home/attendance-work-from-home.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendancePolicy,
      HolidayGroup,
      AttendanceHoliday,
      AttendanceCheckpoint,
      AttendanceCheckpointQrTokenUse,
      AttendanceGeofence,
      AttendanceWifiNetwork,
      AttendanceMobilePunch,
      AttendanceMobileDeviceRegistration,
      AttendanceMobileDeviceRegistrationAudit,
      Employee,
      AttendanceDevice,
      AttendanceDeviceSyncLog,
      Branch,
      EmployeeDeviceAssignment,
      AttendanceProcessedEvent,
      AttendanceDailySummary,
      Shift,
      ShiftAssignment,
      ShiftSchedule,
      EmployeeWorkSchedule,
      Timetable,
      EmployeeTimetable,
      TimetableDayShiftOption,
      TimetableDay,
      AttendanceScheduleAuditLog,
      AttendanceWorkFromHomeRequest,
    ]),
    DeviceManagementHikvisionModule,
    AttendanceProcessingModule,
    FilesModule,
  ],
  controllers: [
    AttendancePoliciesController,
    AttendanceHolidayGroupsController,
    AttendanceHolidaysController,
    AttendanceCheckpointsController,
    AttendanceDeviceSyncLogsController,
    AttendanceGeofencesController,
    AttendanceWifiNetworksController,
    AttendanceMobilePunchesController,
    AttendanceSchedulePreviewController,
    EmployeeWorkSchedulesController,
    AttendanceSetupController,
    AttendanceWorkFromHomeController,
  ],
  providers: [
    AttendancePoliciesService,
    AttendanceHolidayGroupsService,
    AttendanceHolidaysService,
    AttendanceCheckpointsService,
    AttendanceCheckpointQrService,
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
    AttendanceCompanyConfigService,
    AttendanceSchedulePreviewService,
    EmployeeWorkSchedulesService,
    AttendanceScheduleAuditService,
    AttendanceSetupCompletionService,
    AttendanceSetupWizardService,
    AttendanceWorkFromHomeService,
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
    AttendanceCompanyConfigService,
    AttendanceSchedulePreviewService,
    AttendanceSetupCompletionService,
    AttendanceSetupWizardService,
  ],
})
export class AttendanceModule {}
