import { Module } from '@nestjs/common';
import { AccessDoorsModule } from './access-doors/access-doors.module';
import { AccessGroupsModule } from './access-groups/access-groups.module';
import { AccessOrganizationsModule } from './access-organizations/access-organizations.module';
import { AccessScheduleTemplatesModule } from './access-schedule-templates/access-schedule-templates.module';
import { AccessWeekPlansModule } from './access-week-plans/access-week-plans.module';
import { AccessControlSyncController } from './controller/access-control-sync.controller';
import { DeviceCommandLogsModule } from './device-command-logs/device-command-logs.module';
import { EmployeeBiometricCaptureSessionsModule } from './employee-biometric-capture-sessions/employee-biometric-capture-sessions.module';
import { EmployeeAccessCredentialsModule } from './employee-access-credentials/employee-access-credentials.module';
import { EmployeeDeviceAccessAuditLogsModule } from './employee-device-access-audit-logs/employee-device-access-audit-logs.module';
import { EmployeeDeviceAssignmentsModule } from './employee-device-assignments/employee-device-assignments.module';

@Module({
  imports: [
    AccessDoorsModule,
    AccessOrganizationsModule,
    AccessScheduleTemplatesModule,
    AccessWeekPlansModule,
    AccessGroupsModule,
    EmployeeAccessCredentialsModule,
    EmployeeDeviceAssignmentsModule,
    EmployeeDeviceAccessAuditLogsModule,
    EmployeeBiometricCaptureSessionsModule,
    DeviceCommandLogsModule,
  ],
  controllers: [AccessControlSyncController],
})
export class AccessControlModule {}
