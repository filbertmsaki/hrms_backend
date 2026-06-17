import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessGroupDevice } from '../access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../access-group-employees/entity/access-group-employee.entity';
import { AccessGroup } from '../access-groups/entity/access-group.entity';
import { AccessOrganizationEmployee } from '../access-organization-employees/entity/access-organization-employee.entity';
import { AccessOrganization } from '../access-organizations/entity/access-organization.entity';
import { AccessScheduleTemplate } from '../access-schedule-templates/entity/access-schedule-template.entity';
import { EmployeeAccessCredential } from '../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceRightPlan } from '../employee-device-right-plans/entity/employee-device-right-plan.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { EmployeeDeviceIdentity } from '../../hr/attendance/processing/entities/employee-device-identity.entity';
import { AttendanceProcessedEvent } from '../../hr/attendance/processing/entities/attendance-processed-event.entity';
import { AttendanceRecalculationJob } from '../../hr/attendance/processing/entities/attendance-recalculation-job.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeBiometricCaptureSession } from '../employee-biometric-capture-sessions/entity/employee-biometric-capture-session.entity';
import { EmployeeDeviceAccessAuditLog } from '../employee-device-access-audit-logs/entity/employee-device-access-audit-log.entity';
import { EmployeeDeviceAssignment } from './entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentsController } from './controller/employee-device-assignments.controller';
import { EmployeeDeviceAssignmentsService } from './service/employee-device-assignments.service';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { EmployeeBiometricCaptureSessionsModule } from '../employee-biometric-capture-sessions/employee-biometric-capture-sessions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeDeviceAssignment,
      Employee,
      AttendanceDevice,
      EmployeeDeviceIdentity,
      AttendanceProcessedEvent,
      AttendanceRecalculationJob,
      EmployeeDeviceRightPlan,
      EmployeeAccessCredential,
      AccessGroup,
      AccessGroupDevice,
      AccessGroupDoor,
      AccessGroupEmployee,
      AccessOrganization,
      AccessOrganizationEmployee,
      AccessScheduleTemplate,
      EmployeeBiometricCaptureSession,
      EmployeeDeviceAccessAuditLog,
    ]),
    HikvisionModule,
    EmployeeBiometricCaptureSessionsModule,
  ],
  controllers: [EmployeeDeviceAssignmentsController],
  providers: [EmployeeDeviceAssignmentsService],
  exports: [EmployeeDeviceAssignmentsService],
})
export class EmployeeDeviceAssignmentsModule {}
