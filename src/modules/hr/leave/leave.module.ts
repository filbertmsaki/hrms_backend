import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { Holiday } from './entities/holiday.entity';
import { LeaveApprovalWorkflowStep } from './entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from './entities/leave-approval-workflow.entity';
import { LeaveAuditLog } from './entities/leave-audit-log.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveDocument } from './entities/leave-document.entity';
import { LeaveMedicalDetail } from './entities/leave-medical-detail.entity';
import { LeavePolicyType } from './entities/leave-policy-type.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { LeaveRequestApproval } from './entities/leave-request-approval.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeavePdfService } from './services/leave-pdf.service';
import { LeaveWorkflowService } from './services/leave-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeaveType,
      LeavePolicy,
      LeavePolicyType,
      LeaveBalance,
      LeaveRequest,
      LeaveApprovalWorkflow,
      LeaveApprovalWorkflowStep,
      LeaveRequestApproval,
      LeaveMedicalDetail,
      LeaveDocument,
      Holiday,
      LeaveAuditLog,
      Employee,
      Department,
      Position,
      CompanyUser,
      CompanyUserRole,
      Role,
    ]),
    HrSharedModule,
  ],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    LeaveAuditService,
    LeaveBalanceService,
    LeaveWorkflowService,
    LeavePdfService,
  ],
  exports: [LeaveService, TypeOrmModule],
})
export class LeaveModule {}
