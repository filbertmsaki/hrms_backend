import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { Branch } from '../../hr/branches/entities/branch.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { AccessDoor } from '../access-doors/entity/access-door.entity';
import { AccessGroupDoor } from '../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../access-group-employees/entity/access-group-employee.entity';
import { AccessOrganization } from '../access-organizations/entity/access-organization.entity';
import { AccessScheduleTemplate } from '../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessWeekPlan } from '../access-week-plans/entity/access-week-plan.entity';
import { AccessWeekPlanSegment } from '../access-week-plan-segments/entity/access-week-plan-segment.entity';
import { EmployeeAccessCredential } from '../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceRightPlan } from '../employee-device-right-plans/entity/employee-device-right-plan.entity';
import { HikvisionSyncLog } from '../hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { EmployeeDeviceAccessAuditLog } from '../employee-device-access-audit-logs/entity/employee-device-access-audit-log.entity';
import { EmployeeDeviceIdentity } from '../../hr/attendance/processing/entities/employee-device-identity.entity';
import { AccessGroupsController } from './controller/access-groups.controller';
import { AccessGroup } from './entity/access-group.entity';
import { AccessGroupsService } from './service/access-groups.service';
import { AccessControlSyncService } from '../service/access-control-sync.service';
import { EmployeeDeviceAccessAuditLogService } from '../employee-device-access-audit-logs/service/employee-device-access-audit-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccessGroup,
      Branch,
      AccessScheduleTemplate,
      AccessDoor,
      AccessGroupDoor,
      AccessGroupEmployee,
      Employee,
      CompanyUser,
      AccessWeekPlan,
      AccessWeekPlanSegment,
      AccessOrganization,
      EmployeeAccessCredential,
      EmployeeDeviceAssignment,
      EmployeeDeviceRightPlan,
      HikvisionSyncLog,
      AttendanceDevice,
      EmployeeDeviceAccessAuditLog,
      EmployeeDeviceIdentity,
    ]),
    HikvisionModule,
  ],
  controllers: [AccessGroupsController],
  providers: [AccessGroupsService, AccessControlSyncService, EmployeeDeviceAccessAuditLogService],
  exports: [AccessGroupsService, AccessControlSyncService],
})
export class AccessGroupsModule {}

