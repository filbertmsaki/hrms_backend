import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { AccessGroupDevice } from '../access-control/access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../access-control/access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../access-control/access-group-employees/entity/access-group-employee.entity';
import { AccessOrganizationEmployee } from '../access-control/access-organization-employees/entity/access-organization-employee.entity';
import { AccessOrganization } from '../access-control/access-organizations/entity/access-organization.entity';
import { AccessWeekPlan } from '../access-control/access-week-plans/entity/access-week-plan.entity';
import { AccessWeekPlanSegment } from '../access-control/access-week-plan-segments/entity/access-week-plan-segment.entity';
import { EmployeeDeviceAccessAuditLog } from '../access-control/employee-device-access-audit-logs/entity/employee-device-access-audit-log.entity';
import { AccessDoor } from '../access-control/access-doors/entity/access-door.entity';
import { AccessGroup } from '../access-control/access-groups/entity/access-group.entity';
import { AccessScheduleTemplate } from '../access-control/access-schedule-templates/entity/access-schedule-template.entity';
import { EmployeeAccessCredential } from '../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceRightPlan } from '../access-control/employee-device-right-plans/entity/employee-device-right-plan.entity';
import { EmployeeDeviceAccessAuditLogService } from '../access-control/employee-device-access-audit-logs/service/employee-device-access-audit-log.service';
import { HikvisionSyncLog } from '../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { AccessControlSyncService } from '../access-control/service/access-control-sync.service';
import { Branch } from '../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceEmployeeResolverService } from '../hr/attendance/processing/attendance-employee-resolver.service';
import { EmployeeDeviceIdentity } from '../hr/attendance/processing/entities/employee-device-identity.entity';
import { AttendanceRecalculationJob } from '../hr/attendance/processing/entities/attendance-recalculation-job.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { DeviceCommandLog } from './device-command-logs/entity/device-command-log.entity';
import { DeviceCommandLogService } from './device-command-logs/service/device-command-log.service';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionAttendanceController } from './hikvision-attendance.controller';
import { HikvisionAttendanceSyncCronService } from './hikvision-attendance-sync-cron.service';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';
import { HikvisionAttendanceSyncJob } from './entities/hikvision-attendance-sync-job.entity';
import { HikvisionDoorSyncService } from './hikvision-door.service';
import { HikvisionPeopleCredentialSyncController } from './hikvision-people-credential-sync.controller';
import { HikvisionPeopleCredentialSyncService } from './hikvision-people-credential-sync.service';
import { HikvisionService } from './hikvision.service';
import { HikvisionUserManagementService } from './hikvision-user-management.service';
import { HikvisionAttendanceLog } from './entities/hikvision-attendance-log.entity';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';
import { HIKVISION_SYNC_QUEUE } from './hikvision-sync-job.constants';
import { HikvisionImportSyncService } from './hikvision-import-sync.service';
import { HikvisionSyncJobsService } from './hikvision-sync-jobs.service';
import { HikvisionSyncProcessor } from './hikvision-sync.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDevice,
      Branch,
      CompanyUser,
      AccessGroup,
      AccessGroupDevice,
      AccessGroupDoor,
      AccessGroupEmployee,
      AccessOrganization,
      AccessOrganizationEmployee,
      AccessWeekPlan,
      AccessWeekPlanSegment,
      Employee,
      EmployeeDeviceIdentity,
      AttendanceRecalculationJob,
      AccessDoor,
      AccessScheduleTemplate,
      EmployeeAccessCredential,
      EmployeeDeviceAssignment,
      EmployeeDeviceRightPlan,
      EmployeeDeviceAccessAuditLog,
      DeviceCommandLog,
      HikvisionAttendanceLog,
      HikvisionAttendanceSyncJob,
      HikvisionSyncLog,
    ]),
    BullModule.registerQueue({
      name: HIKVISION_SYNC_QUEUE,
    }),
  ],
  controllers: [
    HikvisionAttendanceController,
    HikvisionPeopleCredentialSyncController,
  ],
  providers: [
    HikvisionService,
    HikvisionDoorSyncService,
    HikvisionAccessControlService,
    HikvisionAttendanceSyncService,
    HikvisionAttendanceSyncCronService,
    HikvisionPeopleCredentialSyncService,
    HikvisionUserManagementService,
    AccessControlSyncService,
    EmployeeDeviceAccessAuditLogService,
    AttendanceEmployeeResolverService,
    DeviceCommandLogService,
    HikvisionHelperService,
    HikvisionDigestClient,
    HikvisionParserHelper,
    HikvisionImportSyncService,
    HikvisionSyncJobsService,
    HikvisionSyncProcessor,
  ],
  exports: [
    // Export TypeOrmModule so importing modules can inject repositories for any
    // entity registered here (e.g. HikvisionAttendanceLog) without re-registering.
    TypeOrmModule,
    HikvisionHelperService,
    HikvisionService,
    HikvisionDoorSyncService,
    HikvisionAccessControlService,
    HikvisionAttendanceSyncService,
    HikvisionPeopleCredentialSyncService,
    HikvisionImportSyncService,
    HikvisionUserManagementService,
    DeviceCommandLogService,
    HikvisionSyncJobsService,
  ],
})
export class HikvisionModule {}
