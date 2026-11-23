import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { ScheduleDeploymentsController } from './service/schedule-deployments.controller';
import { ScheduleDeploymentsService } from './service/schedule-deployments.service';
import { DeviceReconciliationService } from './service/device-reconciliation.service';
import { CardStatusReconciliationService } from './service/card-status-reconciliation.service';
import { DeviceReconciliationController } from './service/device-reconciliation.controller';
import { HikvisionModule } from '../hikvision/hikvision.module';
import { AccessDoorsModule } from './access-doors/access-doors.module';
import { AccessGroupsModule } from './access-groups/access-groups.module';
import { AccessOrganizationsModule } from './access-organizations/access-organizations.module';
import { AccessScheduleTemplatesModule } from './access-schedule-templates/access-schedule-templates.module';
import { AccessWeekPlansModule } from './access-week-plans/access-week-plans.module';
import { DeviceCommandLogsModule } from './device-command-logs/device-command-logs.module';
import { HikvisionSyncLogsModule } from './hikvision-sync-logs/hikvision-sync-logs.module';
import { EmployeeBiometricCaptureSessionsModule } from './employee-biometric-capture-sessions/employee-biometric-capture-sessions.module';
import { EmployeeAccessCredentialsModule } from './employee-access-credentials/employee-access-credentials.module';
import { EmployeeDeviceAccessAuditLogsModule } from './employee-device-access-audit-logs/employee-device-access-audit-logs.module';
import { EmployeeDeviceAssignmentsModule } from './employee-device-assignments/employee-device-assignments.module';
import { AccessControlAttendanceDevicesModule } from './attendance-devices/attendance-devices.module';

@Module({
  imports: [
    HikvisionModule,
    CompaniesModule,
    AccessDoorsModule,
    AccessControlAttendanceDevicesModule,
    AccessOrganizationsModule,
    AccessScheduleTemplatesModule,
    AccessWeekPlansModule,
    AccessGroupsModule,
    EmployeeAccessCredentialsModule,
    EmployeeDeviceAssignmentsModule,
    EmployeeDeviceAccessAuditLogsModule,
    EmployeeBiometricCaptureSessionsModule,
    DeviceCommandLogsModule,
    HikvisionSyncLogsModule,
  ],
  controllers: [ScheduleDeploymentsController, DeviceReconciliationController],
  providers: [
    ScheduleDeploymentsService,
    DeviceReconciliationService,
    CardStatusReconciliationService,
  ],
})
export class AccessControlModule {}
