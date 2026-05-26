import { Module } from '@nestjs/common';
import { AccessDoorsModule } from './access-doors/access-doors.module';
import { AccessGroupsModule } from './access-groups/access-groups.module';
import { AccessOrganizationsModule } from './access-organizations/access-organizations.module';
import { AccessScheduleTemplatesModule } from './access-schedule-templates/access-schedule-templates.module';
import { AccessWeekPlansModule } from './access-week-plans/access-week-plans.module';
import { AccessControlSyncController } from './controller/access-control-sync.controller';
import { EmployeeAccessCredentialsModule } from './employee-access-credentials/employee-access-credentials.module';
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
  ],
  controllers: [AccessControlSyncController],
})
export class AccessControlModule {}
