import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../../files/files.module';
import { CompaniesModule } from '../../companies/companies.module';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { UsersModule } from '../../users/users.module';
import { AccessControlAttendanceDevicesModule } from '../../access-control/attendance-devices/attendance-devices.module';
import { EmployeeAccessCredentialsModule } from '../../access-control/employee-access-credentials/employee-access-credentials.module';
import { EmployeeDeviceAssignmentsModule } from '../../access-control/employee-device-assignments/employee-device-assignments.module';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { ShiftEngineModule } from '../attendance/shift/shift-engine.module';
import { TimetableEngineModule } from '../attendance/timetable/timetable-engine.module';
import { Position } from '../positions/entities/position.entity';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { HrSharedModule } from '../shared/hr-shared.module';
import { HrLaunchReadinessModule } from '../launch-readiness/hr-launch-readiness.module';
import { EmployeesController } from './employees.controller';
import { EmployeeImportCleanupService } from './import/employee-import-cleanup.service';
import { EmployeeImportOutboxDispatcher } from './import/employee-import-outbox.dispatcher';
import { EmployeeImportProcessor } from './import/employee-import.processor';
import { EMPLOYEE_IMPORT_QUEUE } from './import/employee-import-job.constants';
import { EmployeeImportService } from './import/employee-import.service';
import { EmployeeImportBatch } from './import/entities/employee-import-batch.entity';
import { EmployeeImportOutboxEvent } from './import/entities/employee-import-outbox-event.entity';
import { EmployeeImportRow } from './import/entities/employee-import-row.entity';
import { EmployeeAssignmentService } from './employee-assignment.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { EmployeeNumberController } from './employee-number.controller';
import { EmployeeNumberService } from './employee-number.service';
import { EmployeesService } from './employees.service';
import { EmployeeAddress } from './entities/employee-address.entity';
import { EmployeeBankAccount } from './entities/employee-bank-account.entity';
import { EmployeeBranchAssignment } from './entities/employee-branch-assignment.entity';
import { EmployeeContact } from './entities/employee-contact.entity';
import { EmployeeDepartmentAssignmentHistory } from './entities/employee-department-assignment-history.entity';
import { EmployeeDepartment } from './entities/employee-department.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeExperience } from './entities/employee-experience.entity';
import { EmployeeIdentification } from './entities/employee-identification.entity';
import { EmployeeNumberSequence } from './entities/employee-number-sequence.entity';
import { EmployeeAcademicQualification } from './entities/employee-academic-qualification.entity';
import { EmployeePosition } from './entities/employee-position.entity';
import { EmployeeProfessionalQualification } from './entities/employee-professional-qualification.entity';
import { EmployeeReportingLine } from './entities/employee-reporting-line.entity';
import { EmployeeRelative } from './entities/employee-relative.entity';
import { Employee } from './entities/employee.entity';
import { LeaveModule } from '../leave/leave.module';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { Role } from '../../roles/entities/role.entity';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from '../../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { DefaultAvatarsModule } from '../default-avatars/default-avatars.module';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      EmployeeDepartment,
      EmployeeDocument,
      EmployeeContact,
      EmployeeAddress,
      EmployeeRelative,
      EmployeeIdentification,
      EmployeeNumberSequence,
      EmployeeBranchAssignment,
      EmployeeDepartmentAssignmentHistory,
      EmployeeReportingLine,
      EmployeeBankAccount,
      EmployeeAcademicQualification,
      EmployeeProfessionalQualification,
      EmployeeExperience,
      EmployeePosition,
      CompanyUser,
      User,
      Branch,
      Department,
      DepartmentPosition,
      Position,
      Shift,
      Timetable,
      AttendanceDevice,
      Role,
      EmployeeImportBatch,
      EmployeeImportOutboxEvent,
      EmployeeImportRow,
      EmployeeDeviceAssignment,
      EmployeeAccessCredential,
    ]),
    BullModule.registerQueue({
      name: EMPLOYEE_IMPORT_QUEUE,
    }),
    FilesModule,
    CompaniesModule,
    UsersModule,
    DefaultAvatarsModule,
    HrSharedModule,
    OnboardingModule,
    HrLaunchReadinessModule,
    LeaveModule,
    ShiftEngineModule,
    TimetableEngineModule,
    AccessControlAttendanceDevicesModule,
    EmployeeDeviceAssignmentsModule,
    EmployeeAccessCredentialsModule,
    BranchesModule,
    HikvisionModule,
  ],
  controllers: [EmployeesController, EmployeeNumberController],
  providers: [
    EmployeesService,
    EmployeeImportService,
    EmployeeNumberService,
    EmployeeAssignmentService,
    EmployeeLifecycleService,
    EmployeeImportProcessor,
    EmployeeImportOutboxDispatcher,
    EmployeeImportCleanupService,
  ],
  exports: [EmployeesService, TypeOrmModule],
})
export class EmployeesModule {}
