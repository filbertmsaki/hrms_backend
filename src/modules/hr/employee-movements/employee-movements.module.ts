import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeBranchAssignment } from '../employees/entities/employee-branch-assignment.entity';
import { EmployeeDepartmentAssignmentHistory } from '../employees/entities/employee-department-assignment-history.entity';
import { EmployeeDepartment } from '../employees/entities/employee-department.entity';
import { EmployeeReportingLine } from '../employees/entities/employee-reporting-line.entity';
import { EmployeeGradeHistory } from '../employees/entities/employee-grade-history.entity';
import { EmployeeCostCenterHistory } from '../employees/entities/employee-cost-center-history.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { CostCenter } from '../cost-centers/entities/cost-center.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { FilesModule } from '../../files/files.module';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { Document } from '../documents/entities/document.entity';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { EmployeeMovement } from './entities/employee-movement.entity';
import { EmployeeMovementChange } from './entities/employee-movement-change.entity';
import { EmployeeMovementNumberSequence } from './entities/employee-movement-number-sequence.entity';
import { EmployeeCompensationVersion } from './entities/employee-compensation-version.entity';
import { EmployeeMovementOperation } from './entities/employee-movement-operation.entity';
import { ProbationCase } from '../probation/entities/probation-case.entity';
import { EmployeeMovementsController } from './employee-movements.controller';
import { EmployeeMovementsService } from './employee-movements.service';
import { EmployeeMovementLetterService } from './services/employee-movement-letter.service';
import { EmployeeMovementSchedulerService } from './services/employee-movement-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeMovement,
      EmployeeMovementChange,
      EmployeeMovementNumberSequence,
      EmployeeCompensationVersion,
      EmployeeMovementOperation,
      ProbationCase,
      Document,
      Employee,
      EmployeeBranchAssignment,
      EmployeeDepartmentAssignmentHistory,
      EmployeeDepartment,
      EmployeeReportingLine,
      EmployeeGradeHistory,
      EmployeeCostCenterHistory,
      EmployeePosition,
      Branch,
      Department,
      Position,
      EmployeeGrade,
      CostCenter,
    ]),
    HrSharedModule,
    FilesModule,
    ActionInboxModule,
  ],
  controllers: [EmployeeMovementsController],
  providers: [
    EmployeeMovementsService,
    EmployeeMovementLetterService,
    EmployeeMovementSchedulerService,
    PostgresAdvisoryLockService,
  ],
  exports: [EmployeeMovementsService, TypeOrmModule],
})
export class EmployeeMovementsModule {}
