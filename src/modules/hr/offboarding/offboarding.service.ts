import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../employee-movements/entities/employee-compensation-version.entity';
import { EmployeePayrollProfile } from '../payroll/entities/employee-payroll-profile.entity';
import { LeaveBalanceService } from '../leave/services/leave-balance.service';
import { PayrollProrationService } from '../payroll/services/payroll-core.services';
import { PayrollMoney } from '../payroll/services/payroll-money.util';
import { EmployeeFinanceAccount, EmployeeFinanceLedgerEntry } from '../employee-finance/entities/employee-finance-account.entities';
import { EmployeeFinanceAccountStatusEnum } from '../employee-finance/employee-finance.enums';
import {
  EmployeeAsset,
  EmployeeAssetStatusEnum,
} from '../employees/entities/employee-asset.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { Position } from '../positions/entities/position.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { AssignOffboardingClearanceDto } from './dtos/assign-offboarding-clearance.dto';
import { CancelOffboardingRequestDto } from './dtos/cancel-offboarding-request.dto';
import { CompleteOffboardingClearanceDto } from './dtos/complete-offboarding-clearance.dto';
import { CompleteOffboardingTaskDto } from './dtos/complete-offboarding-task.dto';
import { CreateOffboardingActionDto } from './dtos/create-offboarding-action.dto';
import { CreateOffboardingAssetReturnDto } from './dtos/create-offboarding-asset-return.dto';
import { CreateOffboardingClearanceDto } from './dtos/create-offboarding-clearance.dto';
import { CreateOffboardingRequestDto } from './dtos/create-offboarding-request.dto';
import { CreateOffboardingSettlementItemDto } from './dtos/create-offboarding-settlement-item.dto';
import { CreateOffboardingTaskDto } from './dtos/create-offboarding-task.dto';
import { CreateOffboardingWorkflowStepDto } from './dtos/create-offboarding-workflow-step.dto';
import { CreateOffboardingWorkflowDto } from './dtos/create-offboarding-workflow.dto';
import { MyOffboardingApprovalQueryDto } from './dtos/my-offboarding-approval-query.dto';
import { MyOffboardingClearanceQueryDto } from './dtos/my-offboarding-clearance-query.dto';
import { MyOffboardingTaskQueryDto } from './dtos/my-offboarding-task-query.dto';
import { OffboardingDashboardQueryDto } from './dtos/offboarding-dashboard-query.dto';
import { OffboardingRequestQueryDto } from './dtos/offboarding-request-query.dto';
import { OffboardingWorkflowQueryDto } from './dtos/offboarding-workflow-query.dto';
import { OffboardingWorkflowStepInputDto } from './dtos/offboarding-workflow-step-input.dto';
import { ReassignOffboardingTaskDto } from './dtos/reassign-offboarding-task.dto';
import { ReopenOffboardingTaskDto } from './dtos/reopen-offboarding-task.dto';
import { RejectOffboardingTaskDto } from './dtos/reject-offboarding-task.dto';
import { SubmitOffboardingRequestDto } from './dtos/submit-offboarding-request.dto';
import { UpdateOffboardingActionDto } from './dtos/update-offboarding-action.dto';
import { UpdateOffboardingAssetReturnDto } from './dtos/update-offboarding-asset-return.dto';
import { UpdateOffboardingRequestDto } from './dtos/update-offboarding-request.dto';
import { UpdateOffboardingSettlementItemDto } from './dtos/update-offboarding-settlement-item.dto';
import { UpdateOffboardingWorkflowStepDto } from './dtos/update-offboarding-workflow-step.dto';
import { UpdateOffboardingWorkflowDto } from './dtos/update-offboarding-workflow.dto';
import { UpsertOffboardingExitInterviewDto } from './dtos/upsert-offboarding-exit-interview.dto';
import { UploadOffboardingDocumentDto } from './dtos/upload-offboarding-document.dto';
import { OffboardingActionStatusEnum } from './enums/offboarding-action-status.enum';
import { OffboardingAccessOperationStatusEnum } from './enums/offboarding-access-operation-status.enum';
import { OffboardingAccessOperationTypeEnum } from './enums/offboarding-access-operation-type.enum';
import { OffboardingAccessTerminationModeEnum } from './enums/offboarding-access-termination-mode.enum';
import { OffboardingApprovalStatusEnum } from './enums/offboarding-approval-status.enum';
import { OffboardingApproverTypeEnum } from './enums/offboarding-approver-type.enum';
import { OffboardingAssetStatusEnum } from './enums/offboarding-asset-status.enum';
import { OffboardingExitInterviewStatusEnum } from './enums/offboarding-exit-interview-status.enum';
import { OffboardingKnowledgeTransferStatusEnum } from './enums/offboarding-knowledge-transfer-status.enum';
import { OffboardingAuditActionEnum } from './enums/offboarding-audit-action.enum';
import { OffboardingClearanceStatusEnum } from './enums/offboarding-clearance-status.enum';
import { OffboardingRecordStatusEnum } from './enums/offboarding-record-status.enum';
import { OffboardingRequestStatusEnum } from './enums/offboarding-request-status.enum';
import { OffboardingSettlementStatusEnum } from './enums/offboarding-settlement-status.enum';
import { OffboardingTaskPriorityEnum } from './enums/offboarding-task-priority.enum';
import { OffboardingTaskStatusEnum } from './enums/offboarding-task-status.enum';
import { OffboardingTaskTypeEnum } from './enums/offboarding-task-type.enum';
import { OffboardingTypeEnum } from './enums/offboarding-type.enum';
import { OffboardingApproval } from './entities/offboarding-approval.entity';
import { OffboardingAction } from './entities/offboarding-action.entity';
import { OffboardingAccessOperation } from './entities/offboarding-access-operation.entity';
import { OffboardingAssetReturn } from './entities/offboarding-asset-return.entity';
import { OffboardingAssetTypeEnum } from './enums/offboarding-asset-type.enum';
import { OffboardingAuditLog } from './entities/offboarding-audit-log.entity';
import { OffboardingClearance } from './entities/offboarding-clearance.entity';
import { OffboardingExitInterview } from './entities/offboarding-exit-interview.entity';
import { OffboardingNumberSequence } from './entities/offboarding-number-sequence.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingSettlementItem } from './entities/offboarding-settlement-item.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingAuditService } from './services/offboarding-audit.service';
import { OffboardingNoticeService } from './services/offboarding-notice.service';
import { OffboardingWorkflowService } from './services/offboarding-workflow.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  NotificationRecipient,
  OffboardingCompletedEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
  OffboardingTaskCompletedEvent,
} from '../notifications/events';
import {
  buildNotificationRecipient,
  HR_NOTIFICATION_ROLE_NAMES,
} from '../notifications/notification-recipient.util';
import { FilesService } from '../../files/files.service';
import {
  HR_PRIVATE_DOCUMENT_MAX_BYTES,
  HR_PRIVATE_DOCUMENT_MIME_TYPES,
} from '../../files/file-policy';
import { EmergencyAccessTerminationDto } from './dtos/emergency-access-termination.dto';
import { DelegateOffboardingApprovalDto } from './dtos/delegate-offboarding-approval.dto';
import { EmployeeAssignmentService } from '../employees/employee-assignment.service';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../../security/security-events.service';
import { LeaveBalance } from '../leave/entities/leave-balance.entity';
import { LeaveBalanceLedgerService } from '../leave/services/leave-balance-ledger.service';
import { OffboardingSettlementSourceEnum } from './enums/offboarding-settlement-source.enum';
import { OffboardingSettlementItemTypeEnum } from './enums/offboarding-settlement-item-type.enum';

type ProgressSummary = {
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  total_actions: number;
  completed_actions: number;
  failed_actions: number;
  total_approvals: number;
  approved_approvals: number;
  total_clearances: number;
  cleared_clearances: number;
  overdue_clearances: number;
  total_assets: number;
  returned_assets: number;
  total_settlements: number;
  completed_settlements: number;
  progress_percentage: string;
};

type RequestContext = {
  ip_address?: string | null;
  user_agent?: string | null;
};

@Injectable()
export class OffboardingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(OffboardingWorkflow)
    private readonly offboardingWorkflowRepository: Repository<OffboardingWorkflow>,
    @InjectRepository(OffboardingWorkflowStep)
    private readonly offboardingWorkflowStepRepository: Repository<OffboardingWorkflowStep>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRequestRepository: Repository<OffboardingRequest>,
    @InjectRepository(OffboardingTask)
    private readonly offboardingTaskRepository: Repository<OffboardingTask>,
    @InjectRepository(OffboardingAction)
    private readonly offboardingActionRepository: Repository<OffboardingAction>,
    @InjectRepository(OffboardingAccessOperation)
    private readonly offboardingAccessOperationRepository: Repository<OffboardingAccessOperation>,
    @InjectRepository(OffboardingAssetReturn)
    private readonly offboardingAssetReturnRepository: Repository<OffboardingAssetReturn>,
    @InjectRepository(OffboardingSettlementItem)
    private readonly offboardingSettlementItemRepository: Repository<OffboardingSettlementItem>,
    @InjectRepository(OffboardingApproval)
    private readonly offboardingApprovalRepository: Repository<OffboardingApproval>,
    @InjectRepository(OffboardingClearance)
    private readonly offboardingClearanceRepository: Repository<OffboardingClearance>,
    @InjectRepository(OffboardingExitInterview)
    private readonly offboardingExitInterviewRepository: Repository<OffboardingExitInterview>,
    @InjectRepository(OffboardingAuditLog)
    private readonly offboardingAuditLogRepository: Repository<OffboardingAuditLog>,
    @InjectRepository(OffboardingNumberSequence)
    private readonly offboardingNumberSequenceRepository: Repository<OffboardingNumberSequence>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly hrAccessService: HrAccessService,
    private readonly positionAvailabilityService: PositionAvailabilityService,
    private readonly offboardingAuditService: OffboardingAuditService,
    private readonly offboardingNoticeService: OffboardingNoticeService,
    private readonly offboardingWorkflowService: OffboardingWorkflowService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly employeeAssignmentService: EmployeeAssignmentService,
    private readonly securityEventsService: SecurityEventsService,
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepository: Repository<LeaveBalance>,
    private readonly leaveBalanceLedgerService: LeaveBalanceLedgerService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly payrollProrationService: PayrollProrationService,
  ) {}

  private async prepareLeaveSettlement(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<void> {
    const employee = await manager.getRepository(Employee).findOneOrFail({
      where: { id: request.employee_id, company_id: request.company_id },
    });
    const balances = await manager.getRepository(LeaveBalance).find({
      where: { employee_id: request.employee_id },
      relations: { leave_type: true },
    });

    const settlementRepository = manager.getRepository(
      OffboardingSettlementItem,
    );

    for (const balance of balances) {
      if (!balance.leave_type?.is_paid) {
        continue;
      }

      const available =
        this.leaveBalanceLedgerService.calculateAvailableDays(balance);
      if (available <= 0) {
        continue;
      }

      const assignment = await this.leaveBalanceService.resolvePolicyAssignment(
        request.company_id,
        employee,
        balance.leave_type_id,
        manager,
      );
      if (!assignment) {
        throw new BadRequestException(
          `Cannot settle ${balance.leave_type.name}: no applicable leave policy is assigned.`,
        );
      }
      if (!assignment.policyType.encashment_enabled) continue;
      const divisor = Number(assignment.policyType.encashment_rate_divisor);
      if (!Number.isFinite(divisor) || divisor <= 0) {
        throw new BadRequestException(
          `Cannot settle ${balance.leave_type.name}: configure its leave encashment rate divisor first.`,
        );
      }
      const minimumRetained = Number(
        assignment.policyType.minimum_balance_after_encashment ?? 0,
      );
      const maximumDays =
        assignment.policyType.maximum_encashment_days == null
          ? available
          : Number(assignment.policyType.maximum_encashment_days);
      const encashmentDays = Math.max(
        0,
        Math.min(available - minimumRetained, maximumDays),
      );
      if (encashmentDays <= 0) continue;

      const compensationRepository = manager.getRepository(
        EmployeeCompensationVersion,
      );
      const compensation = await compensationRepository.findOne({
        where: [
          {
            companyId: request.company_id,
            employeeId: request.employee_id,
            status: In([
              EmployeeCompensationVersionStatusEnum.ACTIVE,
              EmployeeCompensationVersionStatusEnum.SUPERSEDED,
            ]),
            effectiveFrom: LessThanOrEqual(request.last_working_date),
            effectiveTo: IsNull(),
          },
          {
            companyId: request.company_id,
            employeeId: request.employee_id,
            status: In([
              EmployeeCompensationVersionStatusEnum.ACTIVE,
              EmployeeCompensationVersionStatusEnum.SUPERSEDED,
            ]),
            effectiveFrom: LessThanOrEqual(request.last_working_date),
            effectiveTo: MoreThanOrEqual(request.last_working_date),
          },
        ],
        order: { effectiveFrom: 'DESC', id: 'DESC' },
      });
      const payrollProfile = await manager
        .getRepository(EmployeePayrollProfile)
        .findOne({
          where: {
            companyId: request.company_id,
            employeeId: request.employee_id,
          },
        });
      if (!compensation || !payrollProfile?.currency) {
        throw new BadRequestException(
          `Cannot settle ${balance.leave_type.name}: an effective compensation version and payroll currency are required.`,
        );
      }
      if (compensation.currency !== payrollProfile.currency) {
        throw new BadRequestException(
          `Cannot settle ${balance.leave_type.name}: compensation and payroll profile currencies differ.`,
        );
      }
      const amount = this.roundMoney(
        (Number(compensation.baseSalary) / divisor) * encashmentDays,
      );
      balance.policy_id = assignment.policy.id;
      balance.policy_type_id = assignment.policyType.id;
      await manager.getRepository(LeaveBalance).save(balance);

      const sourceReference = `leave-balance:${balance.id}`;
      const existing = await settlementRepository.findOne({
        where: {
          offboarding_request_id: request.id,
          source_reference: sourceReference,
        },
      });

      if (existing) {
        continue;
      }

      await settlementRepository.save(
        settlementRepository.create({
          company_id: request.company_id,
          offboarding_request_id: request.id,
          item_type: OffboardingSettlementItemTypeEnum.LEAVE_ENCASHMENT,
          title: `${balance.leave_type.name} leave settlement`,
          source_type: OffboardingSettlementSourceEnum.LEAVE,
          source_reference: sourceReference,
          status: OffboardingSettlementStatusEnum.IN_PROGRESS,
          amount,
          currency: payrollProfile.currency,
          calculation_snapshot: {
            leave_balance_id: balance.id,
            leave_type_id: balance.leave_type_id,
            leave_type: balance.leave_type.name,
            available_days: available,
            encashment_days: encashmentDays,
            policy_id: assignment.policy.id,
            policy_type_id: assignment.policyType.id,
            encashment_rate_divisor: divisor,
            compensation_version_id: compensation.id,
            base_salary: compensation.baseSalary,
            pay_frequency: compensation.payFrequency,
            currency: payrollProfile.currency,
            calculated_at: new Date().toISOString(),
          },
        }),
      );
    }
  }

  private roundMoney(value: number): string {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('Settlement amount is invalid.');
    }
    return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  async reconcileFinanceAccounts(
    companyId: number,
    employeeId: number,
    manager: EntityManager,
  ) {
    const accounts = await manager.getRepository(EmployeeFinanceAccount).find({
      where: {
        companyId,
        employeeId,
        status: In([
          EmployeeFinanceAccountStatusEnum.ACTIVE,
          EmployeeFinanceAccountStatusEnum.DEFERRED,
          EmployeeFinanceAccountStatusEnum.IN_ARREARS,
          EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
          EmployeeFinanceAccountStatusEnum.SETTLEMENT_PENDING,
          EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY,
        ]),
      },
      order: { id: 'ASC' },
    });
    const ledgerRepository = manager.getRepository(EmployeeFinanceLedgerEntry);
    const discrepancies: Array<Record<string, unknown>> = [];
    for (const account of accounts) {
      const ledger = await ledgerRepository.find({
        where: { companyId, accountId: account.id },
        order: { id: 'ASC' },
      });
      const calculate = (field: 'principalAmount' | 'interestAmount' | 'feeAmount') =>
        ledger.reduce((sum, entry) => {
          const amount = PayrollMoney.toCents(entry[field]);
          return sum + (entry.direction === 'DEBIT' ? amount : -amount);
        }, 0n);
      const ledgerOutstanding = calculate('principalAmount') + calculate('interestAmount') + calculate('feeAmount');
      const accountOutstanding = PayrollMoney.toCents(account.outstandingTotal);
      if (ledger.length === 0 || ledgerOutstanding !== accountOutstanding) {
        discrepancies.push({
          account_id: account.id,
          account_no: account.accountNo,
          account_outstanding: account.outstandingTotal,
          ledger_outstanding: ledger.length ? PayrollMoney.fromCents(ledgerOutstanding) : null,
          ledger_entry_count: ledger.length,
        });
      }
    }
    return { accounts, discrepancies };
  }

  async listAccessOperations(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    return this.offboardingAccessOperationRepository.find({
      where: { offboarding_request_id: offboardingRequestId },
      order: { id: 'ASC' },
    });
  }

  async retryAccessTermination(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status !== OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED
    ) {
      throw new BadRequestException(
        'Access termination can only be retried from a failed state',
      );
    }

    await this.offboardingRequestRepository.update(
      { id: offboardingRequestId, company_id: companyId },
      {
        status: OffboardingRequestStatusEnum.READY_FOR_TERMINATION,
        access_termination_scheduled_at: new Date(),
      },
    );

    return {
      message: 'Access termination re-queued',
      offboarding_request_id: offboardingRequestId,
    };
  }

  async emergencyTerminateAccess(
    companyId: number,
    offboardingRequestId: number,
    dto: EmergencyAccessTerminationDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      [
        OffboardingRequestStatusEnum.COMPLETED,
        OffboardingRequestStatusEnum.CANCELLED,
        OffboardingRequestStatusEnum.REJECTED,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        'Cannot emergency-terminate access for a closed offboarding request',
      );
    }

    const scheduledAt = new Date();
    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OffboardingRequest);
      const current = await repository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });

      current.access_termination_scheduled_at = scheduledAt;
      current.status = OffboardingRequestStatusEnum.READY_FOR_TERMINATION;
      current.metadata = {
        ...(current.metadata ?? {}),
        emergency_termination: {
          reason: dto.reason,
          requested_by_user_id: actor.id,
          requested_at: scheduledAt.toISOString(),
        },
      };
      await repository.save(current);

      await this.createAccessTerminationOperations(
        companyId,
        current,
        scheduledAt,
        manager,
      );

      return current;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: `Emergency access termination requested: ${dto.reason}`,
      metadata: { reason: dto.reason },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return {
      message: 'Emergency access termination scheduled immediately',
      offboarding_request_id: updated.id,
      status: updated.status,
    };
  }

  async finalizeOffboarding(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status !== OffboardingRequestStatusEnum.READY_FOR_FINALIZATION
    ) {
      throw new BadRequestException(
        'Access termination must complete before offboarding finalization',
      );
    }

    if (!request.access_terminated_at) {
      throw new BadRequestException('Access termination evidence is missing');
    }

    const hasUnresolvedSettlements = (request.settlement_items ?? []).some(
      (settlementItem) => !this.isSettlementResolved(settlementItem),
    );
    if (hasUnresolvedSettlements) {
      throw new BadRequestException(
        'All settlement items must be resolved before finalization',
      );
    }

    const hasUnresolvedAssets = (request.asset_returns ?? []).some(
      (assetReturn) => !this.isAssetResolved(assetReturn),
    );
    if (hasUnresolvedAssets) {
      throw new BadRequestException(
        'All asset-return items must be resolved before finalization',
      );
    }

    const finalized = await this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(OffboardingRequest);
      const employeeRepository = manager.getRepository(Employee);

      const current = await requestRepository
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id: offboardingRequestId })
        .andWhere('request.company_id = :companyId', { companyId })
        .getOneOrFail();

      const employee = await employeeRepository
        .createQueryBuilder('employee')
        .setLock('pessimistic_write')
        .where('employee.id = :id', { id: current.employee_id })
        .andWhere('employee.company_id = :companyId', { companyId })
        .getOneOrFail();

      employee.employment_status = this.resolveFinalEmployeeStatus(
        current.offboarding_type,
      );
      employee.exit_date = current.last_working_date;
      employee.exit_reason = current.reason ?? null;
      employee.status_changed_at = new Date();
      employee.status_changed_by_company_user_id =
        actor.companyMembershipId ?? null;
      await employeeRepository.save(employee);

      await this.employeeAssignmentService.endAssignmentsForExit(
        companyId,
        employee.id,
        current.last_working_date,
        actor,
        manager,
      );

      const financeReconciliation = await this.reconcileFinanceAccounts(
        companyId,
        employee.id,
        manager,
      );
      if (financeReconciliation.discrepancies.length) {
        throw new ConflictException(
          `Finance accounts require ledger reconciliation before finalization: ${financeReconciliation.discrepancies.map((item) => item.account_no).join(', ')}`,
        );
      }

      await this.alignAttendanceArtifactsForExit(
        companyId,
        employee.id,
        current.last_working_date,
        manager,
      );

      current.status = OffboardingRequestStatusEnum.COMPLETED;
      current.completed_at = new Date();
      current.progress_percentage = '100.00';
      current.finalized_by_company_user_id = actor.companyMembershipId ?? null;
      current.finalization_snapshot = {
        employee_status: employee.employment_status,
        exit_date: employee.exit_date,
        access_terminated_at: current.access_terminated_at,
        finance_reconciliation: financeReconciliation.accounts.map((account) => ({
          account_id: account.id,
          account_no: account.accountNo,
          outstanding_total: account.outstandingTotal,
        })),
        finalized_at: new Date().toISOString(),
        finalized_by_company_user_id: actor.companyMembershipId ?? null,
      };

      const saved = await requestRepository.save(current);

      await this.securityEventsService.log(
        {
          eventType: SecurityEventType.USER_STATUS_CHANGED,
          outcome: SecurityEventOutcome.SUCCESS,
          actor,
          companyId,
          targetCompanyUserId: employee.company_user_id,
          resourceType: 'offboarding_request',
          resourceId: saved.id,
          newValues: saved.finalization_snapshot,
          context: {
            ipAddress: context?.ip_address ?? null,
            userAgent: context?.user_agent ?? null,
            requestId: null,
          },
        },
        manager,
      );

      return saved;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding finalized and employee exit recorded',
      metadata: finalized.finalization_snapshot ?? undefined,
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return {
      message: 'Offboarding finalized successfully',
      offboarding_request_id: finalized.id,
      status: finalized.status,
    };
  }

  private getOffboardingWorkflowRepository(
    manager?: EntityManager,
  ): Repository<OffboardingWorkflow> {
    return (
      manager?.getRepository(OffboardingWorkflow) ??
      this.offboardingWorkflowRepository
    );
  }

  private getOffboardingWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<OffboardingWorkflowStep> {
    return (
      manager?.getRepository(OffboardingWorkflowStep) ??
      this.offboardingWorkflowStepRepository
    );
  }

  private getOffboardingRequestRepository(
    manager?: EntityManager,
  ): Repository<OffboardingRequest> {
    return (
      manager?.getRepository(OffboardingRequest) ??
      this.offboardingRequestRepository
    );
  }

  private getOffboardingTaskRepository(
    manager?: EntityManager,
  ): Repository<OffboardingTask> {
    return (
      manager?.getRepository(OffboardingTask) ?? this.offboardingTaskRepository
    );
  }

  private getOffboardingApprovalRepository(
    manager?: EntityManager,
  ): Repository<OffboardingApproval> {
    return (
      manager?.getRepository(OffboardingApproval) ??
      this.offboardingApprovalRepository
    );
  }

  private getOffboardingActionRepository(
    manager?: EntityManager,
  ): Repository<OffboardingAction> {
    return (
      manager?.getRepository(OffboardingAction) ??
      this.offboardingActionRepository
    );
  }

  private getOffboardingAccessOperationRepository(
    manager?: EntityManager,
  ): Repository<OffboardingAccessOperation> {
    return (
      manager?.getRepository(OffboardingAccessOperation) ??
      this.offboardingAccessOperationRepository
    );
  }

  private getOffboardingNumberSequenceRepository(
    manager?: EntityManager,
  ): Repository<OffboardingNumberSequence> {
    return (
      manager?.getRepository(OffboardingNumberSequence) ??
      this.offboardingNumberSequenceRepository
    );
  }

  private getOffboardingAssetReturnRepository(
    manager?: EntityManager,
  ): Repository<OffboardingAssetReturn> {
    return (
      manager?.getRepository(OffboardingAssetReturn) ??
      this.offboardingAssetReturnRepository
    );
  }

  private getOffboardingSettlementItemRepository(
    manager?: EntityManager,
  ): Repository<OffboardingSettlementItem> {
    return (
      manager?.getRepository(OffboardingSettlementItem) ??
      this.offboardingSettlementItemRepository
    );
  }

  private getOffboardingClearanceRepository(
    manager?: EntityManager,
  ): Repository<OffboardingClearance> {
    return (
      manager?.getRepository(OffboardingClearance) ??
      this.offboardingClearanceRepository
    );
  }

  private getOffboardingExitInterviewRepository(
    manager?: EntityManager,
  ): Repository<OffboardingExitInterview> {
    return (
      manager?.getRepository(OffboardingExitInterview) ??
      this.offboardingExitInterviewRepository
    );
  }

  private getEmployeeRepository(manager?: EntityManager): Repository<Employee> {
    return manager?.getRepository(Employee) ?? this.employeeRepository;
  }

  private getDepartmentRepository(
    manager?: EntityManager,
  ): Repository<Department> {
    return manager?.getRepository(Department) ?? this.departmentRepository;
  }

  private getShiftAssignmentRepository(
    manager?: EntityManager,
  ): Repository<ShiftAssignment> {
    return (
      manager?.getRepository(ShiftAssignment) ?? this.shiftAssignmentRepository
    );
  }

  private getEmployeeTimetableRepository(
    manager?: EntityManager,
  ): Repository<EmployeeTimetable> {
    return (
      manager?.getRepository(EmployeeTimetable) ??
      this.employeeTimetableRepository
    );
  }

  private getShiftScheduleRepository(
    manager?: EntityManager,
  ): Repository<ShiftSchedule> {
    return (
      manager?.getRepository(ShiftSchedule) ?? this.shiftScheduleRepository
    );
  }

  private getAttendanceDailySummaryRepository(
    manager?: EntityManager,
  ): Repository<AttendanceDailySummary> {
    return (
      manager?.getRepository(AttendanceDailySummary) ??
      this.attendanceDailySummaryRepository
    );
  }

  private getPositionRepository(manager?: EntityManager): Repository<Position> {
    return manager?.getRepository(Position) ?? this.positionRepository;
  }

  private getBranchRepository(manager?: EntityManager): Repository<Branch> {
    return manager?.getRepository(Branch) ?? this.branchRepository;
  }

  private getCompanyUserRepository(
    manager?: EntityManager,
  ): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getCompanyUserRoleRepository(
    manager?: EntityManager,
  ): Repository<CompanyUserRole> {
    return (
      manager?.getRepository(CompanyUserRole) ?? this.companyUserRoleRepository
    );
  }

  private getRoleRepository(manager?: EntityManager): Repository<Role> {
    return manager?.getRepository(Role) ?? this.roleRepository;
  }

  private getDocumentRepository(manager?: EntityManager): Repository<Document> {
    return manager?.getRepository(Document) ?? this.documentRepository;
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeOptionalDate(value?: string): string | null {
    if (!value) {
      return null;
    }
    return value;
  }

  private hasPermission(actor: AuthenticatedUser, permission: string): boolean {
    return actor.permissions.includes(permission);
  }

  private hasElevatedOffboardingAccess(actor: AuthenticatedUser): boolean {
    const elevatedPermissions = new Set([
      'offboarding_workflows:read',
      'offboarding_workflows:create',
      'offboarding_workflows:update',
      'offboarding_workflows:delete',
      'offboarding_requests:approve',
      'offboarding_requests:complete',
      'offboarding_tasks:read',
      'offboarding_tasks:create',
      'offboarding_tasks:complete',
      'offboarding_tasks:reject',
      'offboarding_clearances:read',
      'offboarding_clearances:create',
      'offboarding_clearances:complete',
      'offboarding_documents:read',
      'offboarding_documents:create',
      'offboarding_documents:update',
      'offboarding_documents:delete',
    ]);

    return actor.permissions.some((permission) =>
      elevatedPermissions.has(permission),
    );
  }

  private isSelfServiceOnlyOffboardingActor(actor: AuthenticatedUser): boolean {
    return (
      actor.roles.includes('EMPLOYEE') &&
      !this.hasElevatedOffboardingAccess(actor)
    );
  }

  private canOperateAssignedTask(
    actor: AuthenticatedUser,
    task: Pick<OffboardingTask, 'assigned_to_company_user_id'>,
  ): boolean {
    return (
      this.hasElevatedOffboardingAccess(actor) ||
      (actor.companyMembershipId !== undefined &&
        actor.companyMembershipId !== null &&
        task.assigned_to_company_user_id === actor.companyMembershipId)
    );
  }

  private canOperateOwnedClearance(
    actor: AuthenticatedUser,
    clearance: Pick<OffboardingClearance, 'owner_company_user_id'>,
  ): boolean {
    return (
      this.hasElevatedOffboardingAccess(actor) ||
      (actor.companyMembershipId !== undefined &&
        actor.companyMembershipId !== null &&
        clearance.owner_company_user_id === actor.companyMembershipId)
    );
  }

  private isActorAssignedAtCurrentApprovalLevel(
    request: Pick<OffboardingRequest, 'approvals'>,
    membershipId: number | null | undefined,
  ): boolean {
    if (!membershipId) {
      return false;
    }

    const pendingApprovals = (request.approvals ?? [])
      .filter(
        (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
      )
      .sort(
        (left, right) =>
          (left.workflow_step?.approval_level ?? Number.MAX_SAFE_INTEGER) -
          (right.workflow_step?.approval_level ?? Number.MAX_SAFE_INTEGER),
      );

    if (!pendingApprovals.length) {
      return false;
    }

    const currentLevel = pendingApprovals[0].workflow_step?.approval_level ?? 0;
    return pendingApprovals.some(
      (approval) =>
        (approval.workflow_step?.approval_level ?? 0) === currentLevel &&
        approval.approver_company_user_id === membershipId,
    );
  }

  private async assertCanAccessOffboardingEmployee(
    actor: AuthenticatedUser,
    employee: Pick<
      Employee,
      | 'id'
      | 'primary_branch_id'
      | 'department_assignments'
      | 'primary_department'
      | 'primary_position'
    >,
  ): Promise<void> {
    if (!this.isSelfServiceOnlyOffboardingActor(actor)) {
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
      return;
    }

    if (!actor.employeeId) {
      throw new ForbiddenException(
        'Employee context is required to access self-service offboarding records',
      );
    }

    if (actor.employeeId !== employee.id) {
      throw new ForbiddenException(
        'Employees can only manage their own offboarding records',
      );
    }
  }

  private async findMembershipRecipient(
    companyId: number,
    membershipId: number | null | undefined,
    manager?: EntityManager,
  ): Promise<NotificationRecipient | null> {
    if (!membershipId) {
      return null;
    }

    const membership = await this.getCompanyUserRepository(manager).findOne({
      where: {
        id: membershipId,
        company_id: companyId,
        status: 'active',
      },
      relations: { user: true },
    });

    return buildNotificationRecipient(membership?.user, {
      companyUserId: membership?.id ?? null,
    });
  }

  private async resolveCompanyRoleRecipients(
    companyId: number,
    roleNames: readonly string[],
    manager?: EntityManager,
  ): Promise<NotificationRecipient[]> {
    const rows = await this.getCompanyUserRoleRepository(manager)
      .createQueryBuilder('assignment')
      .innerJoin(Role, 'role', 'role.id = assignment.role_id')
      .innerJoin(
        CompanyUser,
        'membership',
        'membership.id = assignment.company_user_id AND membership.company_id = :companyId AND membership.status = :status',
        { companyId, status: 'active' },
      )
      .innerJoin('membership.user', 'user')
      .where('role.company_id = :companyId', { companyId })
      .andWhere('role.name IN (:...roleNames)', { roleNames: [...roleNames] })
      .select([
        'membership.id AS company_user_id',
        'user.first_name AS first_name',
        'user.last_name AS last_name',
        'user.email AS email',
      ])
      .groupBy('membership.id')
      .addGroupBy('user.first_name')
      .addGroupBy('user.last_name')
      .addGroupBy('user.email')
      .getRawMany<{
        company_user_id: number;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>();

    return rows.flatMap((user) => {
      const recipient = buildNotificationRecipient(user, {
        companyUserId: user.company_user_id,
      });
      return recipient ? [recipient] : [];
    });
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
  ): Promise<Employee> {
    const repository = this.getEmployeeRepository(manager);
    const employee = await repository.findOne({
      where: { id: employeeId },
      relations: {
        company_user: true,
        primary_department: true,
        primary_position: true,
      },
    });

    if (
      !employee ||
      (employee.company_id ?? employee.company_user?.company_id) !== companyId
    ) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async alignAttendanceArtifactsForExit(
    companyId: number,
    employeeId: number,
    lastWorkingDate: string,
    manager: EntityManager,
  ): Promise<void> {
    const shiftAssignmentRepository =
      this.getShiftAssignmentRepository(manager);
    const shiftScheduleRepository = this.getShiftScheduleRepository(manager);
    const employeeTimetableRepository =
      this.getEmployeeTimetableRepository(manager);

    const shiftAssignments = await shiftAssignmentRepository.find({
      where: {
        companyId,
        employeeId,
        status: ShiftAssignmentStatusEnum.ACTIVE,
      },
    });

    for (const assignment of shiftAssignments) {
      if (assignment.effectiveFrom > lastWorkingDate) {
        assignment.status = ShiftAssignmentStatusEnum.INACTIVE;
      } else if (
        !assignment.effectiveTo ||
        assignment.effectiveTo > lastWorkingDate
      ) {
        assignment.effectiveTo = lastWorkingDate;
      }
      await shiftAssignmentRepository.save(assignment);
    }

    const shiftSchedules = await shiftScheduleRepository.find({
      where: {
        companyId,
        employeeId,
      },
    });

    for (const schedule of shiftSchedules) {
      if (schedule.effectiveFrom > lastWorkingDate) {
        await shiftScheduleRepository.remove(schedule);
        continue;
      }

      if (!schedule.effectiveTo || schedule.effectiveTo > lastWorkingDate) {
        schedule.effectiveTo = lastWorkingDate;
        await shiftScheduleRepository.save(schedule);
      }
    }

    const employeeTimetables = await employeeTimetableRepository.find({
      where: {
        companyId,
        employeeId,
        status: EmployeeTimetableStatusEnum.ACTIVE,
      },
    });

    for (const timetable of employeeTimetables) {
      if (timetable.effectiveFrom > lastWorkingDate) {
        timetable.status = EmployeeTimetableStatusEnum.INACTIVE;
      } else if (
        !timetable.effectiveTo ||
        timetable.effectiveTo > lastWorkingDate
      ) {
        timetable.effectiveTo = lastWorkingDate;
      }
      await employeeTimetableRepository.save(timetable);
    }

    await this.getAttendanceDailySummaryRepository(manager)
      .createQueryBuilder()
      .delete()
      .from(AttendanceDailySummary)
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('attendance_date > :lastWorkingDate', { lastWorkingDate })
      .execute();
  }

  private async findOffboardingRequestOrFail(
    companyId: number,
    offboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<OffboardingRequest> {
    const repository = this.getOffboardingRequestRepository(manager);
    const request = await repository.findOne({
      where: { id: offboardingRequestId, company_id: companyId },
      relations: {
        employee: {
          company_user: true,
          primary_department: true,
          primary_position: true,
        },
        workflow: true,
        tasks: {
          assigned_to_company_user: { user: true },
          completed_by_company_user: { user: true },
          reopened_by_company_user: { user: true },
          last_reassigned_by_company_user: { user: true },
        },
        actions: {
          owner_company_user: { user: true },
        },
        access_operations: true,
        asset_returns: {
          owner_company_user: { user: true },
          received_by_company_user: { user: true },
        },
        settlement_items: {
          owner_company_user: { user: true },
        },
        approvals: {
          approver_company_user: { user: true },
          workflow_step: true,
        },
        clearances: {
          owner_company_user: { user: true },
          cleared_by_company_user: { user: true },
        },
        exit_interview: {
          conducted_by_company_user: { user: true },
        },
      },
      order: {
        tasks: { id: 'ASC' },
        actions: { id: 'ASC' },
        access_operations: { id: 'ASC' },
        asset_returns: { id: 'ASC' },
        settlement_items: { id: 'ASC' },
        approvals: { id: 'ASC' },
        clearances: { id: 'ASC' },
      },
    });

    if (!request) {
      throw new NotFoundException('Offboarding request not found');
    }

    return request;
  }

  private async ensureNoActiveOffboarding(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
    ignoreRequestId?: number,
  ): Promise<void> {
    const repository = this.getOffboardingRequestRepository(manager);
    const qb = repository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id = :employeeId', { employeeId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: [
          OffboardingRequestStatusEnum.DRAFT,
          OffboardingRequestStatusEnum.PENDING_MANAGER,
          OffboardingRequestStatusEnum.IN_PROGRESS,
          OffboardingRequestStatusEnum.WAITING_APPROVAL,
          OffboardingRequestStatusEnum.READY_FOR_TERMINATION,
          OffboardingRequestStatusEnum.TERMINATION_SCHEDULED,
          OffboardingRequestStatusEnum.TERMINATING_ACCESS,
          OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
          OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
        ],
      });

    if (ignoreRequestId) {
      qb.andWhere('request.id != :ignoreRequestId', { ignoreRequestId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Employee already has active offboarding request ${existing.offboarding_code}`,
      );
    }
  }

  private async generateOffboardingCode(
    companyId: number,
    manager?: EntityManager,
  ): Promise<string> {
    type SequenceNumberRow = { sequence_number: number | string };
    const repository = this.getOffboardingNumberSequenceRepository(manager);
    const year = new Date().getFullYear();
    const tableName = repository.metadata.tableName;
    const result = (await repository.query(
      `
        INSERT INTO "${tableName}" ("company_id", "sequence_year", "next_number", "updated_at")
        VALUES ($1, $2, 2, NOW())
        ON CONFLICT ("company_id", "sequence_year")
        DO UPDATE SET "next_number" = "${tableName}"."next_number" + 1, "updated_at" = NOW()
        RETURNING "next_number" - 1 AS "sequence_number"
      `,
      [companyId, year],
    )) as unknown as SequenceNumberRow[];
    const sequenceNumber = Number(result[0]?.sequence_number ?? 1);
    return `OFF-${year}-${String(sequenceNumber).padStart(6, '0')}`;
  }

  private resolveDefaultTerminationMode(
    type: OffboardingTypeEnum,
  ): OffboardingAccessTerminationModeEnum {
    if (
      type === OffboardingTypeEnum.TERMINATION ||
      type === OffboardingTypeEnum.ABSCONDED ||
      type === OffboardingTypeEnum.DECEASED
    ) {
      return OffboardingAccessTerminationModeEnum.IMMEDIATE;
    }

    return OffboardingAccessTerminationModeEnum.AT_LAST_WORKING_DAY;
  }

  private calculateAccessTerminationAt(
    request: Pick<
      OffboardingRequest,
      'access_termination_mode' | 'last_working_date'
    >,
  ): Date | null {
    if (
      request.access_termination_mode ===
      OffboardingAccessTerminationModeEnum.MANUAL
    ) {
      return null;
    }

    if (
      request.access_termination_mode ===
      OffboardingAccessTerminationModeEnum.IMMEDIATE
    ) {
      return new Date();
    }

    const hour = this.configService.get<number>(
      'OFFBOARDING_ACCESS_TERMINATION_HOUR',
      18,
    );
    const minute = this.configService.get<number>(
      'OFFBOARDING_ACCESS_TERMINATION_MINUTE',
      0,
    );
    const scheduled = new Date(`${request.last_working_date}T00:00:00.000Z`);
    scheduled.setUTCHours(hour, minute, 0, 0);
    return scheduled;
  }

  private buildReadinessSnapshot(request: OffboardingRequest) {
    const openTasks = (request.tasks ?? []).filter(
      (task) =>
        task.is_required !== false &&
        task.status !== OffboardingTaskStatusEnum.COMPLETED,
    );
    const pendingApprovals = (request.approvals ?? []).filter(
      (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
    );
    const rejectedApprovals = (request.approvals ?? []).filter(
      (approval) => approval.status === OffboardingApprovalStatusEnum.REJECTED,
    );
    const pendingClearances = (request.clearances ?? []).filter(
      (clearance) =>
        clearance.status === OffboardingClearanceStatusEnum.PENDING,
    );
    const failedClearances = (request.clearances ?? []).filter(
      (clearance) =>
        clearance.status === OffboardingClearanceStatusEnum.NOT_CLEARED,
    );
    const openActions = (request.actions ?? []).filter((action) =>
      this.isActionOpen(action),
    );
    const failedActions = (request.actions ?? []).filter((action) =>
      this.isActionFailed(action),
    );
    const pendingAssets = (request.asset_returns ?? []).filter(
      (assetReturn) => !this.isAssetResolved(assetReturn),
    );
    const blockingAssets = (request.asset_returns ?? []).filter((assetReturn) =>
      this.isAssetBlocking(assetReturn),
    );
    const pendingSettlements = (request.settlement_items ?? []).filter(
      (settlementItem) => !this.isSettlementResolved(settlementItem),
    );
    const blockingSettlements = (request.settlement_items ?? []).filter(
      (settlementItem) => this.isSettlementBlocking(settlementItem),
    );
    const exitInterviewRequired = this.configService.get<boolean>(
      'OFFBOARDING_REQUIRE_EXIT_INTERVIEW',
      false,
    );
    const exitInterviewComplete =
      request.exit_interview?.status ===
      OffboardingExitInterviewStatusEnum.COMPLETED;

    return {
      checked_at: new Date().toISOString(),
      open_tasks: openTasks.length,
      pending_approvals: pendingApprovals.length,
      rejected_approvals: rejectedApprovals.length,
      pending_clearances: pendingClearances.length,
      failed_clearances: failedClearances.length,
      open_actions: openActions.length,
      failed_actions: failedActions.length,
      pending_assets: pendingAssets.length,
      blocking_assets: blockingAssets.length,
      pending_settlements: pendingSettlements.length,
      blocking_settlements: blockingSettlements.length,
      exit_interview_required: exitInterviewRequired,
      exit_interview_complete: exitInterviewComplete,
      ready:
        openTasks.length === 0 &&
        pendingApprovals.length === 0 &&
        rejectedApprovals.length === 0 &&
        pendingClearances.length === 0 &&
        failedClearances.length === 0 &&
        openActions.length === 0 &&
        failedActions.length === 0 &&
        pendingAssets.length === 0 &&
        blockingAssets.length === 0 &&
        pendingSettlements.length === 0 &&
        blockingSettlements.length === 0 &&
        (!exitInterviewRequired || exitInterviewComplete),
    };
  }

  private getAccessOperationTypes(): OffboardingAccessOperationTypeEnum[] {
    const operations = [
      OffboardingAccessOperationTypeEnum.DEACTIVATE_COMPANY_MEMBERSHIP,
      OffboardingAccessOperationTypeEnum.REVOKE_AUTH_SESSIONS,
      OffboardingAccessOperationTypeEnum.DEACTIVATE_GLOBAL_USER_IF_UNUSED,
      OffboardingAccessOperationTypeEnum.END_BRANCH_ACCESS,
      OffboardingAccessOperationTypeEnum.END_DEPARTMENT_ACCESS,
      OffboardingAccessOperationTypeEnum.END_POSITION_ASSIGNMENTS,
      OffboardingAccessOperationTypeEnum.END_REPORTING_LINE,
      OffboardingAccessOperationTypeEnum.CLOSE_ATTENDANCE_ASSIGNMENTS,
      OffboardingAccessOperationTypeEnum.CANCEL_FUTURE_LEAVE,
      OffboardingAccessOperationTypeEnum.REMOVE_ACCESS_GROUP_MEMBERSHIP,
      OffboardingAccessOperationTypeEnum.REVOKE_ACCESS_CREDENTIALS,
    ];

    if (
      this.configService.get<boolean>(
        'OFFBOARDING_DEVICE_REMOVAL_REQUIRED',
        true,
      )
    ) {
      operations.push(OffboardingAccessOperationTypeEnum.REMOVE_DEVICE_USER);
    }
    if (
      this.configService.get<boolean>(
        'OFFBOARDING_REQUIRE_RELIEVING_LETTER',
        true,
      )
    ) {
      operations.push(
        OffboardingAccessOperationTypeEnum.GENERATE_RELIEVING_LETTER,
      );
    }
    if (
      this.configService.get<boolean>(
        'OFFBOARDING_REQUIRE_SERVICE_LETTER',
        true,
      )
    ) {
      operations.push(
        OffboardingAccessOperationTypeEnum.GENERATE_SERVICE_LETTER,
      );
    }

    return operations;
  }

  private async createAccessTerminationOperations(
    companyId: number,
    request: OffboardingRequest,
    scheduledAt: Date | null,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOffboardingAccessOperationRepository(manager);
    const existing = await repository.count({
      where: { offboarding_request_id: request.id },
    });
    if (existing) {
      return;
    }

    await repository.save(
      this.getAccessOperationTypes().map((operationType) =>
        repository.create({
          company_id: companyId,
          offboarding_request_id: request.id,
          operation_type: operationType,
          status: OffboardingAccessOperationStatusEnum.PENDING,
          scheduled_at: scheduledAt,
          metadata: {
            employee_id: request.employee_id,
            last_working_date: request.last_working_date,
            access_termination_mode: request.access_termination_mode,
          },
        }),
      ),
    );
  }

  private validateWorkflowStepOrder(
    steps: OffboardingWorkflowStepInputDto[],
  ): void {
    if (!steps.length) {
      throw new BadRequestException('Workflow must include at least one step');
    }

    const levels = steps
      .map((step) => step.approval_level)
      .sort((a, b) => a - b);
    const uniqueLevels = new Set(levels);
    if (uniqueLevels.size !== levels.length) {
      throw new BadRequestException('Workflow approval levels must be unique');
    }

    for (let index = 0; index < levels.length; index += 1) {
      if (levels[index] !== index + 1) {
        throw new BadRequestException(
          'Workflow approval levels must be sequential starting at 1',
        );
      }
    }
  }

  private async validateWorkflowStepReferences(
    companyId: number,
    steps: OffboardingWorkflowStepInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const branchIds = steps
      .map((step) => step.assigned_branch_id)
      .filter((value): value is number => typeof value === 'number');
    const departmentIds = steps
      .map((step) => step.assigned_department_id)
      .filter((value): value is number => typeof value === 'number');
    const positionIds = steps
      .map((step) => step.position_id)
      .filter((value): value is number => typeof value === 'number');
    const companyUserIds = steps
      .map((step) => step.company_user_id)
      .filter((value): value is number => typeof value === 'number');
    const roleIds = steps
      .map((step) => step.role_id)
      .filter((value): value is number => typeof value === 'number');

    if (branchIds.length) {
      const branches = await this.getBranchRepository(manager).count({
        where: {
          id: In([...new Set(branchIds)]),
          company_id: companyId,
        },
      });
      if (branches !== new Set(branchIds).size) {
        throw new BadRequestException(
          'One or more assigned branches are invalid',
        );
      }
    }

    if (departmentIds.length) {
      const departments = await this.getDepartmentRepository(manager).count({
        where: {
          id: In([...new Set(departmentIds)]),
          company_id: companyId,
        },
      });
      if (departments !== new Set(departmentIds).size) {
        throw new BadRequestException(
          'One or more assigned departments are invalid',
        );
      }
    }

    if (positionIds.length) {
      const positions = await this.getPositionRepository(manager).count({
        where: {
          id: In([...new Set(positionIds)]),
          company_id: companyId,
        },
      });
      if (positions !== new Set(positionIds).size) {
        throw new BadRequestException('One or more positions are invalid');
      }
    }

    if (companyUserIds.length) {
      const memberships = await this.getCompanyUserRepository(manager).count({
        where: {
          id: In([...new Set(companyUserIds)]),
          company_id: companyId,
        },
      });
      if (memberships !== new Set(companyUserIds).size) {
        throw new BadRequestException(
          'One or more company user assignments are invalid',
        );
      }
    }

    if (roleIds.length) {
      const roles = await this.getRoleRepository(manager).count({
        where: {
          id: In([...new Set(roleIds)]),
        },
      });
      if (roles !== new Set(roleIds).size) {
        throw new BadRequestException('One or more roles are invalid');
      }
    }

    for (const step of steps) {
      if (step.assigned_branch_id && step.assigned_department_id) {
        const department = await this.getDepartmentRepository(manager).findOne({
          where: {
            id: step.assigned_department_id,
            company_id: companyId,
          },
        });

        if (
          department?.branch_id &&
          department.branch_id !== step.assigned_branch_id
        ) {
          throw new BadRequestException(
            `Department ${step.assigned_department_id} does not belong to branch ${step.assigned_branch_id}`,
          );
        }
      }

      if (step.position_id) {
        const position = await this.getPositionRepository(manager).findOne({
          where: {
            id: step.position_id,
            company_id: companyId,
          },
        });

        if (
          position &&
          step.assigned_branch_id &&
          !(await this.positionAvailabilityService.isPositionAvailableForBranch(
            companyId,
            position,
            step.assigned_branch_id,
          ))
        ) {
          throw new BadRequestException(
            `Position ${step.position_id} does not belong to branch ${step.assigned_branch_id}`,
          );
        }

        if (
          position &&
          step.assigned_department_id &&
          !(await this.positionAvailabilityService.isPositionAvailableForDepartment(
            companyId,
            position,
            step.assigned_department_id,
          ))
        ) {
          throw new BadRequestException(
            `Position ${step.position_id} does not belong to department ${step.assigned_department_id}`,
          );
        }
      }

      if (
        step.approver_type === OffboardingApproverTypeEnum.ROLE &&
        !step.role_id
      ) {
        throw new BadRequestException(
          'role_id is required for role approver type',
        );
      }
      if (
        step.approver_type === OffboardingApproverTypeEnum.POSITION &&
        !step.position_id
      ) {
        throw new BadRequestException(
          'position_id is required for position approver type',
        );
      }
      if (
        step.approver_type === OffboardingApproverTypeEnum.COMPANY_USER &&
        !step.company_user_id
      ) {
        throw new BadRequestException(
          'company_user_id is required for company_user approver type',
        );
      }
    }
  }

  private mapWorkflowStep(entity: OffboardingWorkflowStep) {
    return {
      id: entity.id,
      workflow_id: entity.workflow_id,
      approval_level: entity.approval_level,
      step_name: entity.step_name,
      task_title: entity.task_title,
      task_description: entity.task_description,
      task_type: entity.task_type,
      assigned_branch_id: entity.assigned_branch_id,
      assigned_department_id: entity.assigned_department_id,
      approver_type: entity.approver_type,
      role_id: entity.role_id,
      position_id: entity.position_id,
      company_user_id: entity.company_user_id,
      action_type: entity.action_type,
      is_required: entity.is_required,
      expected_duration_days: entity.expected_duration_days,
      created_at: entity.created_at,
    };
  }

  private mapWorkflow(entity?: OffboardingWorkflow | null) {
    if (!entity) {
      return null;
    }

    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      description: entity.description,
      is_default: entity.is_default,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      steps: entity.steps?.map((step) => this.mapWorkflowStep(step)) ?? [],
    };
  }

  private async findOffboardingWorkflowOrFail(
    companyId: number,
    workflowId: number,
    manager?: EntityManager,
  ): Promise<OffboardingWorkflow> {
    const repository = this.getOffboardingWorkflowRepository(manager);
    const workflow = await repository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
      relations: {
        steps: true,
      },
      order: {
        steps: {
          approval_level: 'ASC',
          id: 'ASC',
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Offboarding workflow not found');
    }

    return workflow;
  }

  private async findOffboardingWorkflowStepOrFail(
    workflowId: number,
    stepId: number,
    manager?: EntityManager,
  ): Promise<OffboardingWorkflowStep> {
    const repository = this.getOffboardingWorkflowStepRepository(manager);
    const step = await repository.findOne({
      where: {
        id: stepId,
        workflow_id: workflowId,
      },
    });

    if (!step) {
      throw new NotFoundException('Offboarding workflow step not found');
    }

    return step;
  }

  private async shiftWorkflowStepLevelsUp(
    workflowId: number,
    fromLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOffboardingWorkflowStepRepository(manager);
    const candidates = await repository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'DESC', id: 'DESC' },
    });

    for (const candidate of candidates) {
      if (candidate.approval_level >= fromLevel) {
        candidate.approval_level += 1;
        await repository.save(candidate);
      }
    }
  }

  private async shiftWorkflowStepLevelsDown(
    workflowId: number,
    fromLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOffboardingWorkflowStepRepository(manager);
    const candidates = await repository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    for (const candidate of candidates) {
      if (candidate.approval_level > fromLevel) {
        candidate.approval_level -= 1;
        await repository.save(candidate);
      }
    }
  }

  private async moveWorkflowStepLevel(
    workflowId: number,
    stepId: number,
    currentLevel: number,
    targetLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (currentLevel === targetLevel) {
      return;
    }

    const repository = this.getOffboardingWorkflowStepRepository(manager);
    const allSteps = await repository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    if (targetLevel > currentLevel) {
      const range = allSteps
        .filter(
          (step) =>
            step.id !== stepId &&
            step.approval_level > currentLevel &&
            step.approval_level <= targetLevel,
        )
        .sort((left, right) => left.approval_level - right.approval_level);

      for (const candidate of range) {
        candidate.approval_level -= 1;
        await repository.save(candidate);
      }
      return;
    }

    const range = allSteps
      .filter(
        (step) =>
          step.id !== stepId &&
          step.approval_level >= targetLevel &&
          step.approval_level < currentLevel,
      )
      .sort((left, right) => right.approval_level - left.approval_level);

    for (const candidate of range) {
      candidate.approval_level += 1;
      await repository.save(candidate);
    }
  }

  private buildStepValidationPayload(
    existingStep: OffboardingWorkflowStep,
    dto: UpdateOffboardingWorkflowStepDto,
  ): OffboardingWorkflowStepInputDto {
    return {
      approval_level: dto.approval_level ?? existingStep.approval_level,
      step_name: dto.step_name ?? existingStep.step_name,
      task_title: dto.task_title ?? existingStep.task_title,
      task_description:
        dto.task_description ?? existingStep.task_description ?? undefined,
      task_type: dto.task_type ?? existingStep.task_type,
      assigned_branch_id:
        dto.assigned_branch_id ?? existingStep.assigned_branch_id ?? undefined,
      assigned_department_id:
        dto.assigned_department_id ??
        existingStep.assigned_department_id ??
        undefined,
      approver_type: dto.approver_type ?? existingStep.approver_type,
      role_id: dto.role_id ?? existingStep.role_id ?? undefined,
      position_id: dto.position_id ?? existingStep.position_id ?? undefined,
      company_user_id:
        dto.company_user_id ?? existingStep.company_user_id ?? undefined,
      action_type: dto.action_type ?? existingStep.action_type,
      is_required: dto.is_required ?? existingStep.is_required,
      expected_duration_days:
        dto.expected_duration_days ??
        existingStep.expected_duration_days ??
        undefined,
    };
  }

  private isTaskOverdue(entity: Pick<OffboardingTask, 'status' | 'due_date'>) {
    return Boolean(
      entity.due_date &&
      entity.due_date.getTime() < Date.now() &&
      entity.status !== OffboardingTaskStatusEnum.COMPLETED &&
      entity.status !== OffboardingTaskStatusEnum.CANCELLED,
    );
  }

  private isClearanceOverdue(
    entity: Pick<OffboardingClearance, 'status' | 'due_date'>,
  ) {
    return Boolean(
      entity.due_date &&
      entity.due_date.getTime() < Date.now() &&
      entity.status === OffboardingClearanceStatusEnum.PENDING,
    );
  }

  private isActionComplete(entity: Pick<OffboardingAction, 'status'>) {
    return entity.status === OffboardingActionStatusEnum.COMPLETED;
  }

  private isActionFailed(entity: Pick<OffboardingAction, 'status'>) {
    return entity.status === OffboardingActionStatusEnum.FAILED;
  }

  private isActionOpen(entity: Pick<OffboardingAction, 'status'>) {
    return (
      entity.status === OffboardingActionStatusEnum.PENDING ||
      entity.status === OffboardingActionStatusEnum.IN_PROGRESS
    );
  }

  private isAssetResolved(entity: Pick<OffboardingAssetReturn, 'status'>) {
    return (
      entity.status === OffboardingAssetStatusEnum.RETURNED ||
      entity.status === OffboardingAssetStatusEnum.WAIVED
    );
  }

  private isAssetBlocking(entity: Pick<OffboardingAssetReturn, 'status'>) {
    return entity.status === OffboardingAssetStatusEnum.MISSING;
  }

  private isSettlementResolved(
    entity: Pick<OffboardingSettlementItem, 'status'>,
  ) {
    return (
      entity.status === OffboardingSettlementStatusEnum.COMPLETED ||
      entity.status === OffboardingSettlementStatusEnum.WAIVED
    );
  }

  private isSettlementBlocking(
    entity: Pick<OffboardingSettlementItem, 'status'>,
  ) {
    return entity.status === OffboardingSettlementStatusEnum.BLOCKED;
  }

  private mapTask(entity: OffboardingTask) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      offboarding_request_id: entity.offboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      assigned_to_company_user_id: entity.assigned_to_company_user_id,
      title: entity.title,
      description: entity.description,
      task_type: entity.task_type,
      status: entity.status,
      priority: entity.priority,
      due_date: entity.due_date,
      is_overdue: this.isTaskOverdue(entity),
      completed_at: entity.completed_at,
      is_required: entity.is_required,
      completion_evidence_required: entity.completion_evidence_required,
      evidence_document_id: entity.evidence_document_id,
      completion_data: entity.completion_data,
      completed_by_company_user_id: entity.completed_by_company_user_id,
      reopened_at: entity.reopened_at,
      reopened_by_company_user_id: entity.reopened_by_company_user_id,
      reassigned_at: entity.reassigned_at,
      last_reassigned_by_company_user_id:
        entity.last_reassigned_by_company_user_id,
      remarks: entity.remarks,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      assigned_to: entity.assigned_to_company_user?.user
        ? {
            id: entity.assigned_to_company_user.user.id,
            first_name: entity.assigned_to_company_user.user.first_name,
            last_name: entity.assigned_to_company_user.user.last_name,
            email: entity.assigned_to_company_user.user.email,
          }
        : null,
      reopened_by: entity.reopened_by_company_user?.user
        ? {
            id: entity.reopened_by_company_user.user.id,
            first_name: entity.reopened_by_company_user.user.first_name,
            last_name: entity.reopened_by_company_user.user.last_name,
            email: entity.reopened_by_company_user.user.email,
          }
        : null,
      last_reassigned_by: entity.last_reassigned_by_company_user?.user
        ? {
            id: entity.last_reassigned_by_company_user.user.id,
            first_name: entity.last_reassigned_by_company_user.user.first_name,
            last_name: entity.last_reassigned_by_company_user.user.last_name,
            email: entity.last_reassigned_by_company_user.user.email,
          }
        : null,
      completed_by: entity.completed_by_company_user?.user
        ? {
            id: entity.completed_by_company_user.user.id,
            first_name: entity.completed_by_company_user.user.first_name,
            last_name: entity.completed_by_company_user.user.last_name,
            email: entity.completed_by_company_user.user.email,
          }
        : null,
    };
  }

  private mapAccessOperation(entity: OffboardingAccessOperation) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      offboarding_request_id: entity.offboarding_request_id,
      operation_type: entity.operation_type,
      status: entity.status,
      scheduled_at: entity.scheduled_at,
      started_at: entity.started_at,
      completed_at: entity.completed_at,
      failed_at: entity.failed_at,
      attempt_count: entity.attempt_count,
      last_error: entity.last_error,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  private mapAction(entity: OffboardingAction) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      offboarding_request_id: entity.offboarding_request_id,
      action_type: entity.action_type,
      system_name: entity.system_name,
      owner_company_user_id: entity.owner_company_user_id,
      status: entity.status,
      due_date: entity.due_date,
      requested_at: entity.requested_at,
      completed_at: entity.completed_at,
      external_reference: entity.external_reference,
      error_message: entity.error_message,
      notes: entity.notes,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      owner: entity.owner_company_user?.user
        ? {
            id: entity.owner_company_user.user.id,
            first_name: entity.owner_company_user.user.first_name,
            last_name: entity.owner_company_user.user.last_name,
            email: entity.owner_company_user.user.email,
          }
        : null,
    };
  }

  private mapApproval(entity: OffboardingApproval) {
    return {
      id: entity.id,
      offboarding_request_id: entity.offboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      approver_company_user_id: entity.approver_company_user_id,
      status: entity.status,
      comments: entity.comments,
      acted_at: entity.acted_at,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      approval_level: entity.workflow_step?.approval_level ?? null,
      step_name: entity.workflow_step?.step_name ?? null,
      approver: entity.approver_company_user?.user
        ? {
            id: entity.approver_company_user.user.id,
            first_name: entity.approver_company_user.user.first_name,
            last_name: entity.approver_company_user.user.last_name,
            email: entity.approver_company_user.user.email,
          }
        : null,
    };
  }

  private mapAssetReturn(entity: OffboardingAssetReturn) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      offboarding_request_id: entity.offboarding_request_id,
      employee_asset_id: entity.employee_asset_id,
      asset_type: entity.asset_type,
      asset_label: entity.asset_label,
      asset_identifier: entity.asset_identifier,
      owner_company_user_id: entity.owner_company_user_id,
      status: entity.status,
      due_date: entity.due_date,
      returned_at: entity.returned_at,
      received_by_company_user_id: entity.received_by_company_user_id,
      condition_notes: entity.condition_notes,
      remarks: entity.remarks,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      owner: entity.owner_company_user?.user
        ? {
            id: entity.owner_company_user.user.id,
            first_name: entity.owner_company_user.user.first_name,
            last_name: entity.owner_company_user.user.last_name,
            email: entity.owner_company_user.user.email,
          }
        : null,
      received_by: entity.received_by_company_user?.user
        ? {
            id: entity.received_by_company_user.user.id,
            first_name: entity.received_by_company_user.user.first_name,
            last_name: entity.received_by_company_user.user.last_name,
            email: entity.received_by_company_user.user.email,
          }
        : null,
    };
  }

  private mapSettlementItem(entity: OffboardingSettlementItem) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      offboarding_request_id: entity.offboarding_request_id,
      item_type: entity.item_type,
      title: entity.title,
      owner_company_user_id: entity.owner_company_user_id,
      status: entity.status,
      amount: entity.amount,
      currency: entity.currency,
      due_date: entity.due_date,
      completed_at: entity.completed_at,
      remarks: entity.remarks,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      owner: entity.owner_company_user?.user
        ? {
            id: entity.owner_company_user.user.id,
            first_name: entity.owner_company_user.user.first_name,
            last_name: entity.owner_company_user.user.last_name,
            email: entity.owner_company_user.user.email,
          }
        : null,
    };
  }

  private mapClearance(entity: OffboardingClearance) {
    return {
      id: entity.id,
      offboarding_request_id: entity.offboarding_request_id,
      clearance_type: entity.clearance_type,
      status: entity.status,
      remarks: entity.remarks,
      owner_company_user_id: entity.owner_company_user_id,
      due_date: entity.due_date,
      is_overdue: this.isClearanceOverdue(entity),
      cleared_by_company_user_id: entity.cleared_by_company_user_id,
      cleared_at: entity.cleared_at,
      created_at: entity.created_at,
      owner: entity.owner_company_user?.user
        ? {
            id: entity.owner_company_user.user.id,
            first_name: entity.owner_company_user.user.first_name,
            last_name: entity.owner_company_user.user.last_name,
            email: entity.owner_company_user.user.email,
          }
        : null,
      cleared_by: entity.cleared_by_company_user?.user
        ? {
            id: entity.cleared_by_company_user.user.id,
            first_name: entity.cleared_by_company_user.user.first_name,
            last_name: entity.cleared_by_company_user.user.last_name,
            email: entity.cleared_by_company_user.user.email,
          }
        : null,
    };
  }

  private mapQueueRequestSummary(
    entity: OffboardingRequest | null | undefined,
  ) {
    if (!entity) {
      return null;
    }

    return {
      id: entity.id,
      offboarding_code: entity.offboarding_code,
      title: entity.title,
      status: entity.status,
      last_working_date: entity.last_working_date,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
          }
        : null,
    };
  }

  private mapDocument(entity: Document) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      module: entity.module,
      document_type: entity.document_type,
      title: entity.title,
      description: entity.description,
      file_name: entity.file_name,
      original_file_name: entity.original_file_name,
      mime_type: entity.mime_type,
      file_extension: entity.file_extension,
      file_size: entity.file_size,
      file_path:
        `/api/offboarding/requests/${entity.entity_id}` +
        `/documents/${entity.id}/download`,
      is_verified: entity.is_verified,
      uploaded_by_company_user_id: entity.uploaded_by_company_user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  private mapExitInterview(
    entity: OffboardingExitInterview | null | undefined,
  ) {
    if (!entity) {
      return null;
    }

    return {
      id: entity.id,
      offboarding_request_id: entity.offboarding_request_id,
      conducted_by_company_user_id: entity.conducted_by_company_user_id,
      status: entity.status,
      exit_reason_category: entity.exit_reason_category,
      employee_feedback: entity.employee_feedback,
      manager_feedback: entity.manager_feedback,
      rehire_eligible: entity.rehire_eligible,
      knowledge_transfer_status: entity.knowledge_transfer_status,
      handover_notes: entity.handover_notes,
      final_notes: entity.final_notes,
      submitted_at: entity.submitted_at,
      completed_at: entity.completed_at,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      conducted_by: entity.conducted_by_company_user?.user
        ? {
            id: entity.conducted_by_company_user.user.id,
            first_name: entity.conducted_by_company_user.user.first_name,
            last_name: entity.conducted_by_company_user.user.last_name,
            email: entity.conducted_by_company_user.user.email,
          }
        : null,
    };
  }

  private mapRequest(entity: OffboardingRequest, documents: Document[] = []) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      branch_id: entity.branch_id,
      department_id: entity.department_id,
      workflow_id: entity.workflow_id,
      created_by_company_user_id: entity.created_by_company_user_id,
      offboarding_code: entity.offboarding_code,
      title: entity.title,
      description: entity.description,
      offboarding_type: entity.offboarding_type,
      reason: entity.reason,
      notice_date: entity.notice_date,
      last_working_date: entity.last_working_date,
      notice_period_days: entity.notice_period_days,
      notice_period_shortfall_days: entity.notice_period_shortfall_days,
      notice_period_excess_days: entity.notice_period_excess_days,
      notice_period_waived: entity.notice_period_waived,
      notice_period_waiver_reason: entity.notice_period_waiver_reason,
      access_termination_mode: entity.access_termination_mode,
      access_termination_scheduled_at: entity.access_termination_scheduled_at,
      access_termination_started_at: entity.access_termination_started_at,
      access_terminated_at: entity.access_terminated_at,
      access_termination_failed_at: entity.access_termination_failed_at,
      access_termination_failure_reason:
        entity.access_termination_failure_reason,
      access_termination_attempt_count: entity.access_termination_attempt_count,
      access_termination_worker_id: entity.access_termination_worker_id,
      readiness_snapshot: entity.readiness_snapshot,
      readiness_checked_at: entity.readiness_checked_at,
      finalized_by_company_user_id: entity.finalized_by_company_user_id,
      finalization_snapshot: entity.finalization_snapshot,
      workflow_version: entity.workflow_version,
      workflow_snapshot: entity.workflow_snapshot,
      submitted_at: entity.submitted_at,
      completed_at: entity.completed_at,
      cancelled_at: entity.cancelled_at,
      status: entity.status,
      progress_percentage: entity.progress_percentage,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      employee: {
        id: entity.employee.id,
        employee_no: entity.employee.employee_no,
        first_name: entity.employee.first_name,
        middle_name: entity.employee.middle_name,
        last_name: entity.employee.last_name,
        employment_status: entity.employee.employment_status,
      },
      workflow: this.mapWorkflow(entity.workflow),
      tasks: entity.tasks?.map((task) => this.mapTask(task)) ?? [],
      actions: entity.actions?.map((action) => this.mapAction(action)) ?? [],
      access_operations:
        entity.access_operations?.map((operation) =>
          this.mapAccessOperation(operation),
        ) ?? [],
      asset_returns:
        entity.asset_returns?.map((assetReturn) =>
          this.mapAssetReturn(assetReturn),
        ) ?? [],
      settlement_items:
        entity.settlement_items?.map((settlementItem) =>
          this.mapSettlementItem(settlementItem),
        ) ?? [],
      approvals:
        entity.approvals?.map((approval) => this.mapApproval(approval)) ?? [],
      clearances:
        entity.clearances?.map((clearance) => this.mapClearance(clearance)) ??
        [],
      exit_interview: this.mapExitInterview(entity.exit_interview),
      documents: documents.map((document) => this.mapDocument(document)),
    };
  }

  private resolveFinalEmployeeStatus(
    type: OffboardingTypeEnum,
  ): EmploymentStatusEnum {
    switch (type) {
      case OffboardingTypeEnum.TERMINATION:
        return EmploymentStatusEnum.TERMINATED;
      case OffboardingTypeEnum.RESIGNATION:
        return EmploymentStatusEnum.RESIGNED;
      case OffboardingTypeEnum.RETIREMENT:
        return EmploymentStatusEnum.RETIRED;
      case OffboardingTypeEnum.DECEASED:
        return EmploymentStatusEnum.DECEASED;
      default:
        return EmploymentStatusEnum.INACTIVE;
    }
  }

  private async updateRequestProgress(
    request: OffboardingRequest,
    manager?: EntityManager,
  ): Promise<ProgressSummary> {
    const taskRepository = this.getOffboardingTaskRepository(manager);
    const actionRepository = this.getOffboardingActionRepository(manager);
    const assetReturnRepository =
      this.getOffboardingAssetReturnRepository(manager);
    const settlementItemRepository =
      this.getOffboardingSettlementItemRepository(manager);
    const approvalRepository = this.getOffboardingApprovalRepository(manager);
    const clearanceRepository = this.getOffboardingClearanceRepository(manager);
    const requestRepository = this.getOffboardingRequestRepository(manager);

    const [
      tasks,
      actions,
      assetReturns,
      settlementItems,
      approvals,
      clearances,
    ] = await Promise.all([
      taskRepository.find({ where: { offboarding_request_id: request.id } }),
      actionRepository.find({ where: { offboarding_request_id: request.id } }),
      assetReturnRepository.find({
        where: { offboarding_request_id: request.id },
      }),
      settlementItemRepository.find({
        where: { offboarding_request_id: request.id },
      }),
      approvalRepository.find({
        where: { offboarding_request_id: request.id },
      }),
      clearanceRepository.find({
        where: { offboarding_request_id: request.id },
      }),
    ]);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (task) => task.status === OffboardingTaskStatusEnum.COMPLETED,
    ).length;
    const overdueTasks = tasks.filter((task) =>
      this.isTaskOverdue(task),
    ).length;
    const totalActions = actions.length;
    const completedActions = actions.filter((action) =>
      this.isActionComplete(action),
    ).length;
    const failedActions = actions.filter((action) =>
      this.isActionFailed(action),
    ).length;
    const totalApprovals = approvals.length;
    const approvedApprovals = approvals.filter(
      (approval) =>
        approval.status === OffboardingApprovalStatusEnum.APPROVED ||
        approval.status === OffboardingApprovalStatusEnum.SKIPPED,
    ).length;
    const totalClearances = clearances.length;
    const clearedClearances = clearances.filter(
      (clearance) =>
        clearance.status === OffboardingClearanceStatusEnum.CLEARED,
    ).length;
    const overdueClearances = clearances.filter((clearance) =>
      this.isClearanceOverdue(clearance),
    ).length;
    const totalAssets = assetReturns.length;
    const returnedAssets = assetReturns.filter((assetReturn) =>
      this.isAssetResolved(assetReturn),
    ).length;
    const totalSettlements = settlementItems.length;
    const completedSettlements = settlementItems.filter((settlementItem) =>
      this.isSettlementResolved(settlementItem),
    ).length;

    const ratios: number[] = [];
    if (totalTasks > 0) {
      ratios.push(completedTasks / totalTasks);
    }
    if (totalActions > 0) {
      ratios.push(completedActions / totalActions);
    }
    if (totalApprovals > 0) {
      ratios.push(approvedApprovals / totalApprovals);
    }
    if (totalClearances > 0) {
      ratios.push(clearedClearances / totalClearances);
    }
    if (totalAssets > 0) {
      ratios.push(returnedAssets / totalAssets);
    }
    if (totalSettlements > 0) {
      ratios.push(completedSettlements / totalSettlements);
    }

    const progressValue = ratios.length
      ? (ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 100
      : 0;
    request.progress_percentage = progressValue.toFixed(2);

    if (
      request.status !== OffboardingRequestStatusEnum.CANCELLED &&
      request.status !== OffboardingRequestStatusEnum.REJECTED &&
      request.status !== OffboardingRequestStatusEnum.COMPLETED &&
      request.status !== OffboardingRequestStatusEnum.TERMINATION_SCHEDULED &&
      request.status !== OffboardingRequestStatusEnum.TERMINATING_ACCESS &&
      request.status !==
        OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED &&
      request.status !== OffboardingRequestStatusEnum.READY_FOR_FINALIZATION
    ) {
      const hasPendingApprovals = approvals.some(
        (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
      );

      if (hasPendingApprovals) {
        request.status = OffboardingRequestStatusEnum.WAITING_APPROVAL;
      } else {
        const hasOpenTasks = tasks.some(
          (task) =>
            task.status === OffboardingTaskStatusEnum.PENDING ||
            task.status === OffboardingTaskStatusEnum.IN_PROGRESS,
        );
        const hasOpenActions = actions.some((action) =>
          this.isActionOpen(action),
        );
        const hasOpenClearances = clearances.some(
          (clearance) =>
            clearance.status === OffboardingClearanceStatusEnum.PENDING,
        );
        const hasOpenAssets = assetReturns.some(
          (assetReturn) => !this.isAssetResolved(assetReturn),
        );
        const hasOpenSettlements = settlementItems.some(
          (settlementItem) => !this.isSettlementResolved(settlementItem),
        );

        if (
          hasOpenTasks ||
          hasOpenActions ||
          hasOpenClearances ||
          hasOpenAssets ||
          hasOpenSettlements
        ) {
          request.status = OffboardingRequestStatusEnum.IN_PROGRESS;
        } else {
          request.status = OffboardingRequestStatusEnum.READY_FOR_TERMINATION;
        }
      }
    }

    await requestRepository.save(request);

    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      overdue_tasks: overdueTasks,
      total_actions: totalActions,
      completed_actions: completedActions,
      failed_actions: failedActions,
      total_approvals: totalApprovals,
      approved_approvals: approvedApprovals,
      total_clearances: totalClearances,
      cleared_clearances: clearedClearances,
      overdue_clearances: overdueClearances,
      total_assets: totalAssets,
      returned_assets: returnedAssets,
      total_settlements: totalSettlements,
      completed_settlements: completedSettlements,
      progress_percentage: request.progress_percentage,
    };
  }

  private async validateReferenceIds(
    companyId: number,
    payload: {
      branch_id?: number | null;
      department_id?: number | null;
      workflow_id?: number | null;
      assigned_to_company_user_id?: number | null;
      owner_company_user_id?: number | null;
      received_by_company_user_id?: number | null;
      conducted_by_company_user_id?: number | null;
    },
    manager?: EntityManager,
  ): Promise<void> {
    if (payload.branch_id) {
      const branch = await this.getBranchRepository(manager).findOne({
        where: { id: payload.branch_id, company_id: companyId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    if (payload.department_id) {
      const department = await this.getDepartmentRepository(manager).findOne({
        where: { id: payload.department_id, company_id: companyId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    if (payload.workflow_id) {
      const workflow = await this.getOffboardingWorkflowRepository(
        manager,
      ).findOne({
        where: { id: payload.workflow_id, company_id: companyId },
      });
      if (!workflow) {
        throw new NotFoundException('Offboarding workflow not found');
      }
    }

    if (payload.assigned_to_company_user_id) {
      const companyUser = await this.getCompanyUserRepository(manager).findOne({
        where: {
          id: payload.assigned_to_company_user_id,
          company_id: companyId,
        },
      });
      if (!companyUser) {
        throw new NotFoundException('Assigned company user not found');
      }
    }

    if (payload.owner_company_user_id) {
      const companyUser = await this.getCompanyUserRepository(manager).findOne({
        where: {
          id: payload.owner_company_user_id,
          company_id: companyId,
        },
      });
      if (!companyUser) {
        throw new NotFoundException('Clearance owner not found');
      }
    }

    if (payload.received_by_company_user_id) {
      const companyUser = await this.getCompanyUserRepository(manager).findOne({
        where: {
          id: payload.received_by_company_user_id,
          company_id: companyId,
        },
      });
      if (!companyUser) {
        throw new NotFoundException('Receiving company user not found');
      }
    }

    if (payload.conducted_by_company_user_id) {
      const companyUser = await this.getCompanyUserRepository(manager).findOne({
        where: {
          id: payload.conducted_by_company_user_id,
          company_id: companyId,
        },
      });
      if (!companyUser) {
        throw new NotFoundException('Interview conductor not found');
      }
    }
  }

  async createOffboardingWorkflow(
    companyId: number,
    dto: CreateOffboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    this.validateWorkflowStepOrder(dto.steps);
    await this.validateWorkflowStepReferences(companyId, dto.steps);

    const created = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOffboardingWorkflowRepository(manager);
      const workflowStepRepository =
        this.getOffboardingWorkflowStepRepository(manager);

      if (dto.is_default) {
        await workflowRepository.update(
          { company_id: companyId, is_default: true },
          { is_default: false },
        );
      }

      const workflow = await workflowRepository.save(
        workflowRepository.create({
          company_id: companyId,
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          is_default: dto.is_default ?? false,
          status: dto.status ?? OffboardingRecordStatusEnum.ACTIVE,
          created_by_company_user_id: actor.companyMembershipId ?? null,
        }),
      );

      await workflowStepRepository.save(
        dto.steps.map((step) =>
          workflowStepRepository.create({
            workflow_id: workflow.id,
            approval_level: step.approval_level,
            step_name: step.step_name.trim(),
            task_title: step.task_title.trim(),
            task_description: this.normalizeOptionalString(
              step.task_description,
            ),
            task_type: step.task_type ?? OffboardingTaskTypeEnum.GENERAL,
            assigned_branch_id: step.assigned_branch_id ?? null,
            assigned_department_id: step.assigned_department_id ?? null,
            approver_type: step.approver_type,
            role_id: step.role_id ?? null,
            position_id: step.position_id ?? null,
            company_user_id: step.company_user_id ?? null,
            action_type: step.action_type,
            is_required: step.is_required ?? true,
            expected_duration_days: step.expected_duration_days ?? null,
          }),
        ),
      );

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CREATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow created',
      metadata: {
        workflow_id: created.id,
      },
    });

    return this.mapWorkflow(created);
  }

  async findAllOffboardingWorkflows(
    companyId: number,
    query: OffboardingWorkflowQueryDto,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
    } = query;

    const qb = this.offboardingWorkflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.steps', 'steps')
      .where('workflow.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('workflow.status = :status', { status: status.trim() });
    }

    if (search?.trim()) {
      qb.andWhere(
        '(workflow.name LIKE :term OR workflow.description LIKE :term)',
        {
          term: `%${search.trim()}%`,
        },
      );
    }

    const allowedSortFields = [
      'id',
      'name',
      'status',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`workflow.${safeSortBy}`, direction)
      .addOrderBy('steps.approval_level', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapWorkflow(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneOffboardingWorkflow(companyId: number, workflowId: number) {
    const workflow = await this.offboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
      relations: { steps: true },
      order: { steps: { approval_level: 'ASC' } },
    });

    if (!workflow) {
      throw new NotFoundException('Offboarding workflow not found');
    }

    return this.mapWorkflow(workflow);
  }

  async updateOffboardingWorkflow(
    companyId: number,
    workflowId: number,
    dto: UpdateOffboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOffboardingWorkflowRepository(manager);
      const stepRepository = this.getOffboardingWorkflowStepRepository(manager);
      const workflow = await workflowRepository.findOne({
        where: {
          id: workflowId,
          company_id: companyId,
        },
        relations: { steps: true },
      });

      if (!workflow) {
        throw new NotFoundException('Offboarding workflow not found');
      }

      if (dto.steps) {
        this.validateWorkflowStepOrder(dto.steps);
        await this.validateWorkflowStepReferences(
          companyId,
          dto.steps,
          manager,
        );
      }

      if (dto.name !== undefined) {
        workflow.name = dto.name.trim();
      }
      if (dto.description !== undefined) {
        workflow.description = this.normalizeOptionalString(dto.description);
      }
      if (dto.status !== undefined) {
        workflow.status = dto.status;
      }

      if (dto.is_default !== undefined) {
        workflow.is_default = dto.is_default;
        if (dto.is_default) {
          await workflowRepository.update(
            { company_id: companyId, is_default: true },
            { is_default: false },
          );
          workflow.is_default = true;
        }
      }

      await workflowRepository.save(workflow);

      if (dto.steps) {
        await stepRepository.delete({ workflow_id: workflow.id });
        await stepRepository.save(
          dto.steps.map((step) =>
            stepRepository.create({
              workflow_id: workflow.id,
              approval_level: step.approval_level,
              step_name: step.step_name.trim(),
              task_title: step.task_title.trim(),
              task_description: this.normalizeOptionalString(
                step.task_description,
              ),
              task_type: step.task_type ?? OffboardingTaskTypeEnum.GENERAL,
              assigned_branch_id: step.assigned_branch_id ?? null,
              assigned_department_id: step.assigned_department_id ?? null,
              approver_type: step.approver_type,
              role_id: step.role_id ?? null,
              position_id: step.position_id ?? null,
              company_user_id: step.company_user_id ?? null,
              action_type: step.action_type,
              is_required: step.is_required ?? true,
              expected_duration_days: step.expected_duration_days ?? null,
            }),
          ),
        );
      }

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow updated',
      metadata: {
        workflow_id: updated.id,
      },
    });

    return this.mapWorkflow(updated);
  }

  async createOffboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    dto: CreateOffboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    await this.validateWorkflowStepReferences(companyId, [dto]);

    const createdStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOffboardingWorkflowOrFail(
        companyId,
        workflowId,
        manager,
      );
      const repository = this.getOffboardingWorkflowStepRepository(manager);

      const targetLevel = dto.approval_level;
      const maxAllowed = workflow.steps.length + 1;
      if (targetLevel < 1 || targetLevel > maxAllowed) {
        throw new BadRequestException(
          `approval_level must be between 1 and ${maxAllowed} for this workflow`,
        );
      }

      await this.shiftWorkflowStepLevelsUp(workflowId, targetLevel, manager);

      let roleId = dto.role_id ?? null;
      let positionId = dto.position_id ?? null;
      let companyUserId = dto.company_user_id ?? null;
      if (dto.approver_type === OffboardingApproverTypeEnum.ROLE) {
        positionId = null;
        companyUserId = null;
      } else if (dto.approver_type === OffboardingApproverTypeEnum.POSITION) {
        roleId = null;
        companyUserId = null;
      } else {
        roleId = null;
        positionId = null;
      }

      return repository.save(
        repository.create({
          workflow_id: workflowId,
          approval_level: targetLevel,
          step_name: dto.step_name.trim(),
          task_title: dto.task_title.trim(),
          task_description: this.normalizeOptionalString(dto.task_description),
          task_type: dto.task_type ?? OffboardingTaskTypeEnum.GENERAL,
          assigned_branch_id: dto.assigned_branch_id ?? null,
          assigned_department_id: dto.assigned_department_id ?? null,
          approver_type: dto.approver_type,
          role_id: roleId,
          position_id: positionId,
          company_user_id: companyUserId,
          action_type: dto.action_type,
          is_required: dto.is_required ?? true,
          expected_duration_days: dto.expected_duration_days ?? null,
        }),
      );
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CREATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow step created',
      metadata: {
        workflow_id: workflowId,
        step_id: createdStep.id,
        approval_level: createdStep.approval_level,
      },
    });

    return this.mapWorkflowStep(createdStep);
  }

  async updateOffboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    dto: UpdateOffboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const updatedStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOffboardingWorkflowOrFail(
        companyId,
        workflowId,
        manager,
      );
      const existingStep = await this.findOffboardingWorkflowStepOrFail(
        workflowId,
        stepId,
        manager,
      );

      const validationPayload = this.buildStepValidationPayload(
        existingStep,
        dto,
      );
      await this.validateWorkflowStepReferences(
        companyId,
        [validationPayload],
        manager,
      );

      const totalSteps = workflow.steps.length;
      const targetLevel = dto.approval_level ?? existingStep.approval_level;
      if (targetLevel < 1 || targetLevel > totalSteps) {
        throw new BadRequestException(
          `approval_level must be between 1 and ${totalSteps} for this workflow`,
        );
      }

      await this.moveWorkflowStepLevel(
        workflowId,
        stepId,
        existingStep.approval_level,
        targetLevel,
        manager,
      );

      existingStep.approval_level = targetLevel;
      if (dto.step_name !== undefined) {
        existingStep.step_name = dto.step_name.trim();
      }
      if (dto.task_title !== undefined) {
        existingStep.task_title = dto.task_title.trim();
      }
      if (dto.task_description !== undefined) {
        existingStep.task_description = this.normalizeOptionalString(
          dto.task_description,
        );
      }
      if (dto.task_type !== undefined) {
        existingStep.task_type = dto.task_type;
      }
      if (dto.assigned_department_id !== undefined) {
        existingStep.assigned_department_id =
          dto.assigned_department_id ?? null;
      }
      if (dto.assigned_branch_id !== undefined) {
        existingStep.assigned_branch_id = dto.assigned_branch_id ?? null;
      }
      if (dto.approver_type !== undefined) {
        existingStep.approver_type = dto.approver_type;
      }
      if (dto.role_id !== undefined) {
        existingStep.role_id = dto.role_id ?? null;
      }
      if (dto.position_id !== undefined) {
        existingStep.position_id = dto.position_id ?? null;
      }
      if (dto.company_user_id !== undefined) {
        existingStep.company_user_id = dto.company_user_id ?? null;
      }
      if (dto.action_type !== undefined) {
        existingStep.action_type = dto.action_type;
      }
      if (dto.is_required !== undefined) {
        existingStep.is_required = dto.is_required;
      }
      if (dto.expected_duration_days !== undefined) {
        existingStep.expected_duration_days =
          dto.expected_duration_days ?? null;
      }

      if (existingStep.approver_type === OffboardingApproverTypeEnum.ROLE) {
        existingStep.position_id = null;
        existingStep.company_user_id = null;
      } else if (
        existingStep.approver_type === OffboardingApproverTypeEnum.POSITION
      ) {
        existingStep.role_id = null;
        existingStep.company_user_id = null;
      } else {
        existingStep.role_id = null;
        existingStep.position_id = null;
      }

      return this.getOffboardingWorkflowStepRepository(manager).save(
        existingStep,
      );
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow step updated',
      metadata: {
        workflow_id: workflowId,
        step_id: updatedStep.id,
        approval_level: updatedStep.approval_level,
      },
    });

    return this.mapWorkflowStep(updatedStep);
  }

  async removeOffboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const deletedPayload = await this.dataSource.transaction(
      async (manager) => {
        const workflow = await this.findOffboardingWorkflowOrFail(
          companyId,
          workflowId,
          manager,
        );
        if (workflow.steps.length <= 1) {
          throw new BadRequestException(
            'Workflow must contain at least one step',
          );
        }

        const step = await this.findOffboardingWorkflowStepOrFail(
          workflowId,
          stepId,
          manager,
        );
        const deletedLevel = step.approval_level;

        await this.getOffboardingWorkflowStepRepository(manager).delete({
          id: step.id,
        });
        await this.shiftWorkflowStepLevelsDown(
          workflowId,
          deletedLevel,
          manager,
        );

        return {
          stepId: step.id,
          deletedLevel,
        };
      },
    );

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow step deleted',
      metadata: {
        workflow_id: workflowId,
        step_id: deletedPayload.stepId,
        deleted_level: deletedPayload.deletedLevel,
      },
    });

    return { message: 'Offboarding workflow step deleted successfully' };
  }

  async removeOffboardingWorkflow(
    companyId: number,
    workflowId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const workflow = await this.offboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
    });
    if (!workflow) {
      throw new NotFoundException('Offboarding workflow not found');
    }

    workflow.status = OffboardingRecordStatusEnum.INACTIVE;
    workflow.is_default = false;
    await this.offboardingWorkflowRepository.save(workflow);

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow deactivated',
      metadata: {
        workflow_id: workflow.id,
      },
    });

    return { message: 'Offboarding workflow deactivated successfully' };
  }

  // The public API methods are intentionally long because they coordinate
  // workflow, approval, task, clearance, document, and audit orchestration.
  // Keeping them in one service mirrors existing onboarding/leave patterns.

  async createOffboardingRequest(
    companyId: number,
    dto: CreateOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    if (
      dto.notice_period_waived &&
      !actor.permissions?.includes('offboarding_requests:update')
    ) {
      throw new ForbiddenException(
        'Only users with offboarding request update permission can waive notice',
      );
    }
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.assertCanAccessOffboardingEmployee(actor, employee);

    await this.ensureNoActiveOffboarding(companyId, dto.employee_id);
    await this.validateReferenceIds(companyId, {
      branch_id: dto.branch_id ?? null,
      department_id: dto.department_id ?? null,
      workflow_id: dto.workflow_id ?? null,
    });

    if (
      dto.notice_date &&
      dto.last_working_date &&
      new Date(dto.notice_date) > new Date(dto.last_working_date)
    ) {
      throw new BadRequestException(
        'notice_date cannot be after last_working_date',
      );
    }

    const noticeCalculation = await this.offboardingNoticeService.calculate({
      companyId,
      employee,
      noticeDate: dto.notice_date ?? null,
      lastWorkingDate: dto.last_working_date ?? null,
      waived: dto.notice_period_waived ?? false,
      waiverReason: dto.notice_period_waiver_reason,
    });
    const accessTerminationMode =
      dto.access_termination_mode ??
      this.resolveDefaultTerminationMode(dto.offboarding_type);

    const created = await this.dataSource.transaction(async (manager) => {
      const repository = this.getOffboardingRequestRepository(manager);
      const entity = repository.create({
        company_id: companyId,
        employee_id: dto.employee_id,
        branch_id: dto.branch_id ?? employee.primary_branch_id ?? null,
        department_id:
          dto.department_id ?? employee.primary_department_id ?? null,
        workflow_id: dto.workflow_id ?? null,
        created_by_company_user_id: actor.companyMembershipId ?? null,
        offboarding_code: await this.generateOffboardingCode(
          companyId,
          manager,
        ),
        title: dto.title.trim(),
        description: this.normalizeOptionalString(dto.description),
        offboarding_type: dto.offboarding_type,
        reason: dto.reason.trim(),
        notice_date: this.normalizeOptionalDate(dto.notice_date),
        last_working_date: noticeCalculation.last_working_date,
        notice_period_days: noticeCalculation.notice_period_days,
        notice_period_shortfall_days: noticeCalculation.shortfall_days,
        notice_period_excess_days: noticeCalculation.excess_days,
        notice_period_waived: dto.notice_period_waived ?? false,
        notice_period_waiver_reason: this.normalizeOptionalString(
          dto.notice_period_waiver_reason,
        ),
        access_termination_mode: accessTerminationMode,
        status: dto.submit
          ? OffboardingRequestStatusEnum.PENDING_MANAGER
          : OffboardingRequestStatusEnum.DRAFT,
        metadata: dto.metadata ?? null,
      });

      const saved = await repository.save(entity);
      await this.createReturnsForIssuedAssets(
        companyId,
        saved.id,
        employee.id,
        manager,
      );
      if (dto.submit) {
        await this.submitOffboardingInternal(
          companyId,
          saved.id,
          actor,
          dto.workflow_id ?? null,
          manager,
        );
      }

      return this.findOffboardingRequestOrFail(companyId, saved.id, manager);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CREATED,
      offboarding_request_id: created.id,
      actor,
      description: 'Offboarding request created',
      new_values: {
        offboarding_code: created.offboarding_code,
        status: created.status,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: created.id,
      },
      order: { id: 'DESC' },
    });

    return this.mapRequest(created, documents);
  }

  private async createReturnsForIssuedAssets(
    companyId: number,
    offboardingRequestId: number,
    employeeId: number,
    manager: EntityManager,
  ): Promise<void> {
    const employeeAssets = await manager.getRepository(EmployeeAsset).find({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        status: EmployeeAssetStatusEnum.ACTIVE,
      },
      order: { id: 'ASC' },
    });
    const returnRepository = manager.getRepository(OffboardingAssetReturn);
    for (const asset of employeeAssets) {
      const normalizedType = asset.asset_type.toLowerCase();
      const assetType = Object.values(OffboardingAssetTypeEnum).includes(
        normalizedType as OffboardingAssetTypeEnum,
      )
        ? (normalizedType as OffboardingAssetTypeEnum)
        : OffboardingAssetTypeEnum.OTHER;
      await returnRepository.upsert(
        {
          company_id: companyId,
          offboarding_request_id: offboardingRequestId,
          employee_asset_id: asset.id,
          asset_type: assetType,
          asset_label: asset.asset_label,
          ...(asset.asset_identifier
            ? { asset_identifier: asset.asset_identifier }
            : {}),
          status: OffboardingAssetStatusEnum.PENDING,
          metadata: {
            source: 'EMPLOYEE_ASSET_REGISTER',
            issued_at: asset.issued_at,
            ...(asset.condition_at_issue
              ? { condition_at_issue: asset.condition_at_issue }
              : {}),
          },
        },
        ['offboarding_request_id', 'employee_asset_id'],
      );
    }
  }

  async submitOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    dto: SubmitOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    await this.dataSource.transaction(async (manager) => {
      await this.submitOffboardingInternal(
        companyId,
        offboardingRequestId,
        actor,
        dto.workflow_id,
        manager,
      );
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.SUBMITTED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding request submitted',
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    this.emitOffboardingSubmitted(companyId, offboardingRequestId).catch(
      () => {},
    );

    return this.findOneOffboardingRequest(
      companyId,
      offboardingRequestId,
      actor,
    );
  }

  private async submitOffboardingInternal(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
    workflowId?: number | null,
    manager?: EntityManager,
  ) {
    const requestRepository = this.getOffboardingRequestRepository(manager);
    const request = await requestRepository.findOneOrFail({
      where: { id: offboardingRequestId, company_id: companyId },
      relations: { employee: { company_user: true } },
    });

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot submit a closed offboarding request',
      );
    }

    request.submitted_at = new Date();
    request.status = OffboardingRequestStatusEnum.PENDING_MANAGER;

    const workflowResult =
      await this.offboardingWorkflowService.initializeForRequest(
        companyId,
        request,
        workflowId ?? request.workflow_id,
        manager,
      );

    if (!workflowResult.pending_approvals) {
      request.status = OffboardingRequestStatusEnum.IN_PROGRESS;
      await requestRepository.save(request);
    }

    await this.updateRequestProgress(request, manager);
    void actor;
  }

  async updateOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    dto: UpdateOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    if (
      dto.notice_period_waived !== undefined &&
      !actor.permissions?.includes('offboarding_requests:update')
    ) {
      throw new ForbiddenException(
        'Only users with offboarding request update permission can change notice waiver status',
      );
    }
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot update a closed offboarding request',
      );
    }

    if (
      ![
        OffboardingRequestStatusEnum.DRAFT,
        OffboardingRequestStatusEnum.REJECTED,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        'Only draft or rejected offboarding requests can be edited; use the workflow actions after submission',
      );
    }

    if (
      dto.notice_date &&
      dto.last_working_date &&
      new Date(dto.notice_date) > new Date(dto.last_working_date)
    ) {
      throw new BadRequestException(
        'notice_date cannot be after last_working_date',
      );
    }

    const oldValues = {
      title: request.title,
      description: request.description,
      offboarding_type: request.offboarding_type,
      reason: request.reason,
      notice_date: request.notice_date,
      last_working_date: request.last_working_date,
      workflow_id: request.workflow_id,
      branch_id: request.branch_id,
      department_id: request.department_id,
      notice_period_waived: request.notice_period_waived,
      notice_period_waiver_reason: request.notice_period_waiver_reason,
      access_termination_mode: request.access_termination_mode,
    };

    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = this.getOffboardingRequestRepository(manager);
      const current = await repository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });

      await this.validateReferenceIds(
        companyId,
        {
          branch_id: dto.branch_id ?? current.branch_id,
          department_id: dto.department_id ?? current.department_id,
          workflow_id: dto.workflow_id ?? current.workflow_id,
        },
        manager,
      );

      if (dto.branch_id !== undefined) current.branch_id = dto.branch_id;
      if (dto.department_id !== undefined)
        current.department_id = dto.department_id;
      if (dto.workflow_id !== undefined) current.workflow_id = dto.workflow_id;
      if (dto.title !== undefined) current.title = dto.title.trim();
      if (dto.description !== undefined)
        current.description = this.normalizeOptionalString(dto.description);
      if (dto.offboarding_type !== undefined)
        current.offboarding_type = dto.offboarding_type;
      if (dto.reason !== undefined) current.reason = dto.reason.trim();
      if (dto.notice_date !== undefined)
        current.notice_date = this.normalizeOptionalDate(dto.notice_date);
      if (dto.last_working_date !== undefined)
        current.last_working_date = dto.last_working_date;
      if (dto.notice_period_waived !== undefined) {
        if (
          dto.notice_period_waived &&
          !(
            dto.notice_period_waiver_reason ??
            current.notice_period_waiver_reason
          )?.trim()
        ) {
          throw new BadRequestException(
            'A reason is required when waiving the notice period',
          );
        }
        current.notice_period_waived = dto.notice_period_waived;
      }
      if (dto.notice_period_waiver_reason !== undefined) {
        current.notice_period_waiver_reason = this.normalizeOptionalString(
          dto.notice_period_waiver_reason,
        );
      }
      if (dto.access_termination_mode !== undefined) {
        current.access_termination_mode = dto.access_termination_mode;
      }
      if (
        dto.notice_period_waived === false &&
        dto.notice_period_waiver_reason === undefined
      ) {
        current.notice_period_waiver_reason = null;
      }
      if (
        dto.notice_date !== undefined ||
        dto.last_working_date !== undefined ||
        dto.notice_period_waived !== undefined
      ) {
        const notice = await this.offboardingNoticeService.calculate({
          companyId,
          employee: current.employee ?? request.employee,
          noticeDate: current.notice_date,
          lastWorkingDate: current.last_working_date,
          waived: current.notice_period_waived,
          waiverReason: current.notice_period_waiver_reason ?? undefined,
        });
        current.notice_period_days = notice.notice_period_days;
        current.notice_period_shortfall_days = notice.shortfall_days;
        current.notice_period_excess_days = notice.excess_days;
      }
      if (dto.metadata !== undefined) current.metadata = dto.metadata ?? null;

      await repository.save(current);
      await this.updateRequestProgress(current, manager);

      return this.findOffboardingRequestOrFail(companyId, current.id, manager);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: updated.id,
      actor,
      description: 'Offboarding request updated',
      old_values: oldValues,
      new_values: {
        title: updated.title,
        description: updated.description,
        offboarding_type: updated.offboarding_type,
        reason: updated.reason,
        notice_date: updated.notice_date,
        last_working_date: updated.last_working_date,
        workflow_id: updated.workflow_id,
        branch_id: updated.branch_id,
        department_id: updated.department_id,
        notice_period_waived: updated.notice_period_waived,
        notice_period_waiver_reason: updated.notice_period_waiver_reason,
        access_termination_mode: updated.access_termination_mode,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: updated.id,
      },
      order: { id: 'DESC' },
    });

    return this.mapRequest(updated, documents);
  }

  async cancelOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    dto: CancelOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Offboarding request is already closed');
    }

    await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const taskRepository = this.getOffboardingTaskRepository(manager);

      const current = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });

      await this.offboardingWorkflowService.closeAllPendingApprovals(
        current.id,
        'Skipped after offboarding cancellation',
        manager,
      );

      const openTasks = await taskRepository.find({
        where: {
          offboarding_request_id: current.id,
          status: In([
            OffboardingTaskStatusEnum.PENDING,
            OffboardingTaskStatusEnum.IN_PROGRESS,
          ]),
        },
      });

      if (openTasks.length) {
        openTasks.forEach((task) => {
          task.status = OffboardingTaskStatusEnum.CANCELLED;
          task.remarks =
            task.remarks ?? 'Task cancelled with offboarding request';
        });
        await taskRepository.save(openTasks);
      }

      current.status = OffboardingRequestStatusEnum.CANCELLED;
      current.cancelled_at = new Date();
      current.metadata = {
        ...(current.metadata ?? {}),
        cancellation_reason: this.normalizeOptionalString(dto.reason),
      };

      await requestRepository.save(current);
      await this.updateRequestProgress(current, manager);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CANCELLED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding request cancelled',
      metadata: { reason: dto.reason ?? null },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return { message: 'Offboarding request cancelled successfully' };
  }

  private assertReadyForTermination(request: OffboardingRequest): void {
    if (
      ![
        OffboardingRequestStatusEnum.IN_PROGRESS,
        OffboardingRequestStatusEnum.APPROVED,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        'Only approved, started offboarding requests can be completed',
      );
    }

    const hasOpenTasks = request.tasks.some(
      (task) =>
        task.is_required !== false &&
        task.status !== OffboardingTaskStatusEnum.COMPLETED,
    );
    if (hasOpenTasks) {
      throw new BadRequestException(
        'All required offboarding tasks must be completed before finalization',
      );
    }

    if (
      this.configService.get<boolean>(
        'OFFBOARDING_REQUIRE_EXIT_INTERVIEW',
        false,
      ) &&
      request.exit_interview?.status !==
        OffboardingExitInterviewStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'A completed exit interview is required before access termination',
      );
    }

    const hasRejectedApproval = request.approvals.some(
      (approval) => approval.status === OffboardingApprovalStatusEnum.REJECTED,
    );
    if (hasRejectedApproval) {
      throw new BadRequestException(
        'Cannot complete offboarding with rejected approvals',
      );
    }

    const hasPendingApproval = request.approvals.some(
      (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
    );
    if (hasPendingApproval) {
      throw new BadRequestException(
        'All approvals must be resolved before finalization',
      );
    }

    const hasPendingClearance = request.clearances.some(
      (clearance) =>
        clearance.status === OffboardingClearanceStatusEnum.PENDING,
    );
    if (hasPendingClearance) {
      throw new BadRequestException(
        'All clearances must be resolved before finalization',
      );
    }

    const hasFailedClearance = request.clearances.some(
      (clearance) =>
        clearance.status === OffboardingClearanceStatusEnum.NOT_CLEARED,
    );
    if (hasFailedClearance) {
      throw new BadRequestException(
        'Cannot complete offboarding with uncleared assets/access',
      );
    }

    const hasOpenActions = (request.actions ?? []).some((action) =>
      this.isActionOpen(action),
    );
    if (hasOpenActions) {
      throw new BadRequestException(
        'All access-revocation actions must be completed before finalization',
      );
    }

    const hasFailedAction = (request.actions ?? []).some((action) =>
      this.isActionFailed(action),
    );
    if (hasFailedAction) {
      throw new BadRequestException(
        'Cannot complete offboarding with failed operational actions',
      );
    }

    const hasPendingAssets = (request.asset_returns ?? []).some(
      (assetReturn) => !this.isAssetResolved(assetReturn),
    );
    if (hasPendingAssets) {
      throw new BadRequestException(
        'All asset-return items must be resolved before finalization',
      );
    }

    const hasBlockingAsset = (request.asset_returns ?? []).some((assetReturn) =>
      this.isAssetBlocking(assetReturn),
    );
    if (hasBlockingAsset) {
      throw new BadRequestException(
        'Cannot complete offboarding with missing or unresolved assets',
      );
    }

    const hasPendingSettlements = (request.settlement_items ?? []).some(
      (settlementItem) => !this.isSettlementResolved(settlementItem),
    );
    if (hasPendingSettlements) {
      throw new BadRequestException(
        'All settlement items must be resolved before finalization',
      );
    }

    const hasBlockedSettlements = (request.settlement_items ?? []).some(
      (settlementItem) => this.isSettlementBlocking(settlementItem),
    );
    if (hasBlockedSettlements) {
      throw new BadRequestException(
        'Cannot complete offboarding with blocked settlement items',
      );
    }
  }

  async completeOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    this.assertReadyForTermination(request);

    const scheduled = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOffboardingRequestRepository(manager);

      await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });

      const current = await this.findOffboardingRequestOrFail(
        companyId,
        offboardingRequestId,
        manager,
      );
      this.assertReadyForTermination(current);

      const scheduledAt = this.calculateAccessTerminationAt(current);
      current.status = scheduledAt
        ? OffboardingRequestStatusEnum.TERMINATION_SCHEDULED
        : OffboardingRequestStatusEnum.READY_FOR_TERMINATION;
      current.readiness_snapshot = this.buildReadinessSnapshot(current);
      current.readiness_checked_at = new Date();
      current.access_termination_scheduled_at = scheduledAt;
      current.progress_percentage = '100.00';
      await requestRepository.save(current);

      await this.prepareLeaveSettlement(current, manager);

      await this.createAccessTerminationOperations(
        companyId,
        current,
        scheduledAt,
        manager,
      );

      return this.findOffboardingRequestOrFail(companyId, current.id, manager);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description:
        'Offboarding readiness confirmed and access termination scheduled',
      metadata: {
        status: scheduled.status,
        access_termination_scheduled_at:
          scheduled.access_termination_scheduled_at,
        readiness_snapshot: scheduled.readiness_snapshot,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: scheduled.id,
      },
      order: { id: 'DESC' },
    });

    return {
      message: scheduled.access_termination_scheduled_at
        ? 'Offboarding access termination scheduled'
        : 'Offboarding is ready for manual access termination',
      data: this.mapRequest(scheduled, documents),
    };
  }

  async findOneOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: request.id,
      },
      order: { created_at: 'DESC' },
    });

    return this.mapRequest(request, documents);
  }

  async findAllOffboardingRequests(
    companyId: number,
    query: OffboardingRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'created_at';
    const sortOrder = query.sortOrder ?? SortDirection.DESC;
    const { employee_id, status, offboarding_type, search } = query;
    const isSelfServiceOnlyActor =
      this.isSelfServiceOnlyOffboardingActor(actor);

    const qb = this.offboardingRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('request.company_id = :companyId', { companyId });

    if (isSelfServiceOnlyActor) {
      if (!actor.employeeId) {
        throw new ForbiddenException(
          'Employee context is required to access self-service offboarding records',
        );
      }

      if (typeof employee_id === 'number' && employee_id !== actor.employeeId) {
        throw new ForbiddenException(
          'Employees can only query their own offboarding records',
        );
      }

      qb.andWhere('request.employee_id = :actorEmployeeId', {
        actorEmployeeId: actor.employeeId,
      });
    }

    if (!isSelfServiceOnlyActor && typeof employee_id === 'number') {
      qb.andWhere('request.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    }

    if (status) {
      qb.andWhere('request.status = :status', { status });
    }

    if (offboarding_type) {
      qb.andWhere('request.offboarding_type = :offboardingType', {
        offboardingType: offboarding_type,
      });
    }

    if (search) {
      qb.andWhere(
        '(request.offboarding_code LIKE :search OR request.title LIKE :search OR employee.first_name LIKE :search OR employee.last_name LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    const sortableColumns = new Set([
      'id',
      'created_at',
      'updated_at',
      'offboarding_code',
      'last_working_date',
      'status',
      'progress_percentage',
    ]);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'created_at';

    const [items, total] = await qb
      .orderBy(
        `request.${safeSortBy}`,
        sortOrder === SortDirection.ASC ? 'ASC' : 'DESC',
      )
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (!isSelfServiceOnlyActor && typeof employee_id === 'number') {
      const employee = await this.findEmployeeOrFail(companyId, employee_id);
      await this.assertCanAccessOffboardingEmployee(actor, employee);
    }

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: In(items.map((item) => item.id)),
      },
    });

    const documentsMap = new Map<number, Document[]>();
    documents.forEach((document) => {
      const current = documentsMap.get(document.entity_id) ?? [];
      current.push(document);
      documentsMap.set(document.entity_id, current);
    });

    return {
      data: items.map((item) =>
        this.mapRequest(item, documentsMap.get(item.id) ?? []),
      ),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findMyOffboardingTasks(
    actor: AuthenticatedUser,
    query: MyOffboardingTaskQueryDto,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    if (!actor.companyMembershipId || !actor.companyId) {
      throw new ForbiddenException(
        'Company membership is required to access assigned offboarding tasks',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'due_date';
    const sortOrder = query.sortOrder ?? SortDirection.ASC;
    const qb = this.offboardingTaskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assigned_to_company_user', 'assignedMembership')
      .leftJoinAndSelect('assignedMembership.user', 'assignedUser')
      .leftJoinAndSelect('task.reopened_by_company_user', 'reopenedMembership')
      .leftJoinAndSelect('reopenedMembership.user', 'reopenedUser')
      .leftJoinAndSelect(
        'task.last_reassigned_by_company_user',
        'reassignedMembership',
      )
      .leftJoinAndSelect('reassignedMembership.user', 'reassignedUser')
      .leftJoinAndSelect('task.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('task.company_id = :companyId', { companyId: actor.companyId })
      .andWhere('task.assigned_to_company_user_id = :membershipId', {
        membershipId: actor.companyMembershipId,
      });

    if (query.status) {
      qb.andWhere('task.status = :status', { status: query.status });
    }

    if (query.priority) {
      qb.andWhere('task.priority = :priority', { priority: query.priority });
    }

    if (query.search) {
      qb.andWhere(
        '(task.title LIKE :search OR request.offboarding_code LIKE :search OR employee.first_name LIKE :search OR employee.last_name LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    const sortableColumns = new Set([
      'id',
      'created_at',
      'updated_at',
      'due_date',
      'priority',
      'status',
      'title',
    ]);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'due_date';

    const [items, total] = await qb
      .orderBy(
        `task.${safeSortBy}`,
        sortOrder === SortDirection.DESC ? 'DESC' : 'ASC',
        safeSortBy === 'due_date' ? 'NULLS LAST' : undefined,
      )
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => ({
        ...this.mapTask(item),
        request: this.mapQueueRequestSummary(item.offboarding_request),
      })),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findMyOffboardingClearances(
    actor: AuthenticatedUser,
    query: MyOffboardingClearanceQueryDto,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    if (!actor.companyMembershipId || !actor.companyId) {
      throw new ForbiddenException(
        'Company membership is required to access assigned offboarding clearances',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'due_date';
    const sortOrder = query.sortOrder ?? SortDirection.ASC;
    const qb = this.offboardingClearanceRepository
      .createQueryBuilder('clearance')
      .leftJoinAndSelect('clearance.owner_company_user', 'ownerMembership')
      .leftJoinAndSelect('ownerMembership.user', 'ownerUser')
      .leftJoinAndSelect(
        'clearance.cleared_by_company_user',
        'clearedMembership',
      )
      .leftJoinAndSelect('clearedMembership.user', 'clearedUser')
      .leftJoinAndSelect('clearance.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('request.company', 'company')
      .where('request.company_id = :companyId', { companyId: actor.companyId })
      .andWhere('clearance.owner_company_user_id = :membershipId', {
        membershipId: actor.companyMembershipId,
      });

    if (query.status) {
      qb.andWhere('clearance.status = :status', { status: query.status });
    }

    if (query.clearance_type) {
      qb.andWhere('clearance.clearance_type = :clearanceType', {
        clearanceType: query.clearance_type,
      });
    }

    if (query.search) {
      qb.andWhere(
        '(request.offboarding_code LIKE :search OR employee.first_name LIKE :search OR employee.last_name LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    const sortableColumns = new Set([
      'id',
      'created_at',
      'due_date',
      'status',
      'clearance_type',
    ]);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'due_date';

    const [items, total] = await qb
      .orderBy(
        `clearance.${safeSortBy}`,
        sortOrder === SortDirection.DESC ? 'DESC' : 'ASC',
        safeSortBy === 'due_date' ? 'NULLS LAST' : undefined,
      )
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => ({
        ...this.mapClearance(item),
        request: this.mapQueueRequestSummary(item.offboarding_request),
      })),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findMyOffboardingApprovals(
    actor: AuthenticatedUser,
    query: MyOffboardingApprovalQueryDto,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    if (!actor.companyMembershipId || !actor.companyId) {
      throw new ForbiddenException(
        'Company membership is required to access offboarding approvals',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'created_at';
    const sortOrder = query.sortOrder ?? SortDirection.ASC;
    const qb = this.offboardingApprovalRepository
      .createQueryBuilder('approval')
      .leftJoinAndSelect('approval.workflow_step', 'workflowStep')
      .leftJoinAndSelect('approval.approver_company_user', 'approverMembership')
      .leftJoinAndSelect('approverMembership.user', 'approverUser')
      .leftJoinAndSelect('approval.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('request.approvals', 'requestApproval')
      .leftJoinAndSelect('requestApproval.workflow_step', 'requestApprovalStep')
      .where('approval.approver_company_user_id = :membershipId', {
        membershipId: actor.companyMembershipId,
      })
      .andWhere('request.company_id = :companyId', {
        companyId: actor.companyId,
      });

    if (query.status) {
      qb.andWhere('approval.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(request.offboarding_code LIKE :search OR request.title LIKE :search OR employee.first_name LIKE :search OR employee.last_name LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    const sortableColumns = new Set([
      'id',
      'created_at',
      'updated_at',
      'status',
      'acted_at',
    ]);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'created_at';

    const [items, total] = await qb
      .orderBy(
        `approval.${safeSortBy}`,
        sortOrder === SortDirection.DESC ? 'DESC' : 'ASC',
      )
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => ({
        ...this.mapApproval(item),
        is_actionable:
          item.status === OffboardingApprovalStatusEnum.PENDING &&
          item.workflow_step?.approval_level ===
            Math.min(
              ...item.offboarding_request.approvals
                .filter(
                  (approval) =>
                    approval.status === OffboardingApprovalStatusEnum.PENDING,
                )
                .map(
                  (approval) =>
                    approval.workflow_step?.approval_level ??
                    Number.MAX_SAFE_INTEGER,
                ),
            ) &&
          [
            OffboardingRequestStatusEnum.WAITING_APPROVAL,
            OffboardingRequestStatusEnum.IN_PROGRESS,
          ].includes(item.offboarding_request.status),
        request: this.mapQueueRequestSummary(item.offboarding_request),
      })),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async getDashboard(
    companyId: number,
    query: OffboardingDashboardQueryDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    if (!this.hasElevatedOffboardingAccess(actor)) {
      throw new ForbiddenException(
        'Elevated offboarding access is required to view the dashboard',
      );
    }

    await this.validateReferenceIds(companyId, {
      branch_id: query.branch_id ?? null,
      department_id: query.department_id ?? null,
    });

    const qb = this.offboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId });

    if (query.branch_id) {
      qb.andWhere('request.branch_id = :branchId', {
        branchId: query.branch_id,
      });
    }

    if (query.department_id) {
      qb.andWhere('request.department_id = :departmentId', {
        departmentId: query.department_id,
      });
    }

    if (query.status) {
      qb.andWhere('request.status = :status', { status: query.status });
    }

    if (query.offboarding_type) {
      qb.andWhere('request.offboarding_type = :offboardingType', {
        offboardingType: query.offboarding_type,
      });
    }

    if (query.date_from) {
      qb.andWhere('request.created_at >= :dateFrom', {
        dateFrom: `${query.date_from} 00:00:00`,
      });
    }

    if (query.date_to) {
      qb.andWhere('request.created_at <= :dateTo', {
        dateTo: `${query.date_to} 23:59:59`,
      });
    }

    const requests = await qb.getMany();
    const requestIds = requests.map((request) => request.id);

    const [actions, assetReturns, settlementItems, tasks, clearances] =
      requestIds.length > 0
        ? await Promise.all([
            this.offboardingActionRepository.find({
              where: { offboarding_request_id: In(requestIds) },
            }),
            this.offboardingAssetReturnRepository.find({
              where: { offboarding_request_id: In(requestIds) },
            }),
            this.offboardingSettlementItemRepository.find({
              where: { offboarding_request_id: In(requestIds) },
            }),
            this.offboardingTaskRepository.find({
              where: { offboarding_request_id: In(requestIds) },
            }),
            this.offboardingClearanceRepository.find({
              where: { offboarding_request_id: In(requestIds) },
            }),
          ])
        : [[], [], [], [], []];

    const status_counts = Object.values(OffboardingRequestStatusEnum).reduce(
      (acc, status) => ({
        ...acc,
        [status]: requests.filter((request) => request.status === status)
          .length,
      }),
      {} as Record<string, number>,
    );

    const type_counts = Object.values(OffboardingTypeEnum).reduce(
      (acc, type) => ({
        ...acc,
        [type]: requests.filter((request) => request.offboarding_type === type)
          .length,
      }),
      {} as Record<string, number>,
    );

    const completedRequests = requests.filter(
      (request) =>
        request.status === OffboardingRequestStatusEnum.COMPLETED &&
        request.completed_at,
    );
    const average_completion_days = completedRequests.length
      ? Number(
          (
            completedRequests.reduce((sum, request) => {
              const completedAt = request.completed_at!;
              const createdAt = request.created_at;
              return (
                sum + (completedAt.getTime() - createdAt.getTime()) / 86400000
              );
            }, 0) / completedRequests.length
          ).toFixed(2),
        )
      : 0;

    return {
      filters: query,
      totals: {
        requests: requests.length,
        overdue_tasks: tasks.filter((task) => this.isTaskOverdue(task)).length,
        overdue_clearances: clearances.filter((clearance) =>
          this.isClearanceOverdue(clearance),
        ).length,
        failed_actions: actions.filter((action) => this.isActionFailed(action))
          .length,
        blocked_assets: assetReturns.filter((assetReturn) =>
          this.isAssetBlocking(assetReturn),
        ).length,
        blocked_settlements: settlementItems.filter((settlementItem) =>
          this.isSettlementBlocking(settlementItem),
        ).length,
      },
      status_counts,
      type_counts,
      averages: {
        completion_days: average_completion_days,
      },
      work_queues: {
        actions: {
          total: actions.length,
          pending: actions.filter((action) => this.isActionOpen(action)).length,
          completed: actions.filter((action) => this.isActionComplete(action))
            .length,
        },
        assets: {
          total: assetReturns.length,
          resolved: assetReturns.filter((assetReturn) =>
            this.isAssetResolved(assetReturn),
          ).length,
        },
        settlements: {
          total: settlementItems.length,
          resolved: settlementItems.filter((settlementItem) =>
            this.isSettlementResolved(settlementItem),
          ).length,
        },
      },
    };
  }

  async listActions(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    return request.actions?.map((action) => this.mapAction(action)) ?? [];
  }

  async createAction(
    companyId: number,
    offboardingRequestId: number,
    dto: CreateOffboardingActionDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot add actions to a closed offboarding request',
      );
    }

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: dto.owner_company_user_id ?? null,
    });

    const created = await this.dataSource.transaction(async (manager) => {
      const actionRepository = this.getOffboardingActionRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const status = dto.status ?? OffboardingActionStatusEnum.PENDING;

      const action = await actionRepository.save(
        actionRepository.create({
          company_id: companyId,
          offboarding_request_id: offboardingRequestId,
          action_type: dto.action_type,
          system_name: this.normalizeOptionalString(dto.system_name),
          owner_company_user_id: dto.owner_company_user_id ?? null,
          status,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          requested_at: dto.requested_at
            ? new Date(dto.requested_at)
            : new Date(),
          completed_at:
            status === OffboardingActionStatusEnum.COMPLETED
              ? new Date()
              : null,
          external_reference: this.normalizeOptionalString(
            dto.external_reference,
          ),
          error_message: this.normalizeOptionalString(dto.error_message),
          notes: this.normalizeOptionalString(dto.notes),
          metadata: dto.metadata ?? null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return action;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding action created',
      metadata: { action_id: created.id, action_type: created.action_type },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapAction(created);
  }

  async updateAction(
    companyId: number,
    offboardingRequestId: number,
    actionId: number,
    dto: UpdateOffboardingActionDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: dto.owner_company_user_id ?? null,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const actionRepository = this.getOffboardingActionRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const action = await actionRepository.findOneOrFail({
        where: { id: actionId, offboarding_request_id: offboardingRequestId },
      });

      if (dto.action_type !== undefined) action.action_type = dto.action_type;
      if (dto.system_name !== undefined)
        action.system_name = this.normalizeOptionalString(dto.system_name);
      if (dto.owner_company_user_id !== undefined)
        action.owner_company_user_id = dto.owner_company_user_id ?? null;
      if (dto.status !== undefined) action.status = dto.status;
      if (dto.due_date !== undefined)
        action.due_date = dto.due_date ? new Date(dto.due_date) : null;
      if (dto.requested_at !== undefined)
        action.requested_at = dto.requested_at
          ? new Date(dto.requested_at)
          : null;
      if (dto.external_reference !== undefined)
        action.external_reference = this.normalizeOptionalString(
          dto.external_reference,
        );
      if (dto.error_message !== undefined)
        action.error_message = this.normalizeOptionalString(dto.error_message);
      if (dto.notes !== undefined)
        action.notes = this.normalizeOptionalString(dto.notes);
      if (dto.metadata !== undefined) action.metadata = dto.metadata ?? null;

      action.completed_at =
        action.status === OffboardingActionStatusEnum.COMPLETED
          ? (action.completed_at ?? new Date())
          : null;

      const persisted = await actionRepository.save(action);
      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return persisted;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding action updated',
      metadata: { action_id: saved.id, status: saved.status },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapAction(saved);
  }

  async listAssetReturns(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    return (
      request.asset_returns?.map((assetReturn) =>
        this.mapAssetReturn(assetReturn),
      ) ?? []
    );
  }

  private assertAssetReturnRules(
    status: OffboardingAssetStatusEnum,
    input: {
      received_by_company_user_id: number | null;
      condition_at_return: string | null;
      liability_amount: string | null;
      liability_acknowledged: boolean;
      remarks: string | null;
    },
  ): void {
    if (status === OffboardingAssetStatusEnum.RETURNED) {
      if (!input.received_by_company_user_id || !input.condition_at_return) {
        throw new BadRequestException(
          'Returning an asset requires a receiver and a return condition',
        );
      }
    }

    if (status === OffboardingAssetStatusEnum.MISSING) {
      if (!input.liability_amount && !input.liability_acknowledged) {
        throw new BadRequestException(
          'A missing asset requires either a recorded liability amount or an explicit no-liability acknowledgement',
        );
      }
    }

    if (
      status === OffboardingAssetStatusEnum.WAIVED &&
      !input.remarks?.trim()
    ) {
      throw new BadRequestException(
        'Waiving an asset requires a waiver reason in remarks',
      );
    }
  }

  /**
   * A missing asset carries a financial liability that must be tracked
   * through settlement, not silently dropped once the asset record itself
   * is resolved. Idempotent: re-saving a MISSING asset links the same item.
   */
  private async ensureAssetLiabilitySettlementItem(
    companyId: number,
    offboardingRequestId: number,
    assetReturn: OffboardingAssetReturn,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    if (assetReturn.status !== OffboardingAssetStatusEnum.MISSING) {
      return;
    }

    const settlementRepository =
      this.getOffboardingSettlementItemRepository(manager);
    const sourceReference = `asset-return:${assetReturn.id}`;
    const existing = await settlementRepository.findOne({
      where: {
        offboarding_request_id: offboardingRequestId,
        source_reference: sourceReference,
      },
    });

    if (existing) {
      existing.amount = assetReturn.liability_amount ?? existing.amount;
      existing.currency = assetReturn.liability_currency ?? existing.currency;
      existing.calculation_snapshot = {
        asset_return_id: assetReturn.id,
        asset_label: assetReturn.asset_label,
        liability_acknowledged: assetReturn.liability_acknowledged,
        updated_at: new Date().toISOString(),
      };
      await settlementRepository.save(existing);
      return;
    }

    await settlementRepository.save(
      settlementRepository.create({
        company_id: companyId,
        offboarding_request_id: offboardingRequestId,
        item_type: OffboardingSettlementItemTypeEnum.OTHER,
        title: `Missing asset liability: ${assetReturn.asset_label}`,
        source_type: OffboardingSettlementSourceEnum.ASSET_LIABILITY,
        source_reference: sourceReference,
        status: assetReturn.liability_acknowledged
          ? OffboardingSettlementStatusEnum.WAIVED
          : OffboardingSettlementStatusEnum.IN_PROGRESS,
        amount: assetReturn.liability_amount,
        currency: assetReturn.liability_currency,
        owner_company_user_id: actor.companyMembershipId ?? null,
        calculation_snapshot: {
          asset_return_id: assetReturn.id,
          asset_label: assetReturn.asset_label,
          liability_acknowledged: assetReturn.liability_acknowledged,
          created_at: new Date().toISOString(),
        },
      }),
    );
  }

  async createAssetReturn(
    companyId: number,
    offboardingRequestId: number,
    dto: CreateOffboardingAssetReturnDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: dto.owner_company_user_id ?? null,
      received_by_company_user_id: dto.received_by_company_user_id ?? null,
    });

    const created = await this.dataSource.transaction(async (manager) => {
      const assetReturnRepository =
        this.getOffboardingAssetReturnRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const status = dto.status ?? OffboardingAssetStatusEnum.PENDING;
      const remarks = this.normalizeOptionalString(dto.remarks);
      const conditionAtReturn = this.normalizeOptionalString(
        dto.condition_at_return,
      );

      this.assertAssetReturnRules(status, {
        received_by_company_user_id: dto.received_by_company_user_id ?? null,
        condition_at_return: conditionAtReturn,
        liability_amount: dto.liability_amount ?? null,
        liability_acknowledged: dto.liability_acknowledged ?? false,
        remarks,
      });

      const assetReturn = await assetReturnRepository.save(
        assetReturnRepository.create({
          company_id: companyId,
          offboarding_request_id: offboardingRequestId,
          employee_asset_id: null,
          asset_type: dto.asset_type,
          asset_label: dto.asset_label.trim(),
          asset_identifier: this.normalizeOptionalString(dto.asset_identifier),
          owner_company_user_id: dto.owner_company_user_id ?? null,
          status,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          returned_at:
            status === OffboardingAssetStatusEnum.RETURNED ? new Date() : null,
          received_by_company_user_id: dto.received_by_company_user_id ?? null,
          condition_notes: this.normalizeOptionalString(dto.condition_notes),
          condition_at_return: conditionAtReturn,
          return_evidence_document_id: dto.return_evidence_document_id ?? null,
          liability_amount: dto.liability_amount ?? null,
          liability_currency: dto.liability_currency ?? null,
          liability_acknowledged: dto.liability_acknowledged ?? false,
          remarks,
          metadata: dto.metadata ?? null,
        }),
      );

      await this.ensureAssetLiabilitySettlementItem(
        companyId,
        offboardingRequestId,
        assetReturn,
        actor,
        manager,
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return assetReturn;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding asset return created',
      metadata: { asset_return_id: created.id, asset_type: created.asset_type },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapAssetReturn(created);
  }

  async updateAssetReturn(
    companyId: number,
    offboardingRequestId: number,
    assetReturnId: number,
    dto: UpdateOffboardingAssetReturnDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: dto.owner_company_user_id ?? null,
      received_by_company_user_id: dto.received_by_company_user_id ?? null,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const assetReturnRepository =
        this.getOffboardingAssetReturnRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const assetReturn = await assetReturnRepository.findOneOrFail({
        where: {
          id: assetReturnId,
          offboarding_request_id: offboardingRequestId,
        },
      });

      if (dto.asset_type !== undefined) assetReturn.asset_type = dto.asset_type;
      if (dto.asset_label !== undefined)
        assetReturn.asset_label = dto.asset_label.trim();
      if (dto.asset_identifier !== undefined)
        assetReturn.asset_identifier = this.normalizeOptionalString(
          dto.asset_identifier,
        );
      if (dto.owner_company_user_id !== undefined)
        assetReturn.owner_company_user_id = dto.owner_company_user_id ?? null;
      if (dto.status !== undefined) assetReturn.status = dto.status;
      if (dto.due_date !== undefined)
        assetReturn.due_date = dto.due_date ? new Date(dto.due_date) : null;
      if (dto.received_by_company_user_id !== undefined)
        assetReturn.received_by_company_user_id =
          dto.received_by_company_user_id ?? null;
      if (dto.condition_notes !== undefined)
        assetReturn.condition_notes = this.normalizeOptionalString(
          dto.condition_notes,
        );
      if (dto.condition_at_return !== undefined)
        assetReturn.condition_at_return = this.normalizeOptionalString(
          dto.condition_at_return,
        );
      if (dto.return_evidence_document_id !== undefined)
        assetReturn.return_evidence_document_id =
          dto.return_evidence_document_id ?? null;
      if (dto.liability_amount !== undefined)
        assetReturn.liability_amount = dto.liability_amount ?? null;
      if (dto.liability_currency !== undefined)
        assetReturn.liability_currency = dto.liability_currency ?? null;
      if (dto.liability_acknowledged !== undefined)
        assetReturn.liability_acknowledged = dto.liability_acknowledged;
      if (dto.remarks !== undefined)
        assetReturn.remarks = this.normalizeOptionalString(dto.remarks);
      if (dto.metadata !== undefined)
        assetReturn.metadata = dto.metadata ?? null;

      this.assertAssetReturnRules(assetReturn.status, {
        received_by_company_user_id: assetReturn.received_by_company_user_id,
        condition_at_return: assetReturn.condition_at_return,
        liability_amount: assetReturn.liability_amount,
        liability_acknowledged: assetReturn.liability_acknowledged,
        remarks: assetReturn.remarks,
      });

      assetReturn.returned_at =
        assetReturn.status === OffboardingAssetStatusEnum.RETURNED
          ? (assetReturn.returned_at ?? new Date())
          : null;

      const persisted = await assetReturnRepository.save(assetReturn);

      if (persisted.employee_asset_id) {
        const employeeAssetRepository = manager.getRepository(EmployeeAsset);
        const employeeAsset = await employeeAssetRepository.findOne({
          where: {
            id: persisted.employee_asset_id,
            company_id: companyId,
            employee_id: request.employee_id,
          },
        });
        if (employeeAsset) {
          employeeAsset.status =
            persisted.status === OffboardingAssetStatusEnum.RETURNED
              ? EmployeeAssetStatusEnum.RETURNED
              : persisted.status === OffboardingAssetStatusEnum.MISSING
                ? EmployeeAssetStatusEnum.MISSING
                : EmployeeAssetStatusEnum.ACTIVE;
          await employeeAssetRepository.save(employeeAsset);
        }
      }

      await this.ensureAssetLiabilitySettlementItem(
        companyId,
        offboardingRequestId,
        persisted,
        actor,
        manager,
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return persisted;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding asset return updated',
      metadata: { asset_return_id: saved.id, status: saved.status },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapAssetReturn(saved);
  }

  async listSettlementItems(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    return (
      request.settlement_items?.map((settlementItem) =>
        this.mapSettlementItem(settlementItem),
      ) ?? []
    );
  }

  async createSettlementItem(
    companyId: number,
    offboardingRequestId: number,
    dto: CreateOffboardingSettlementItemDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: dto.owner_company_user_id ?? null,
    });

    const created = await this.dataSource.transaction(async (manager) => {
      const settlementItemRepository =
        this.getOffboardingSettlementItemRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const status = dto.status ?? OffboardingSettlementStatusEnum.PENDING;
      let amount = this.normalizeOptionalString(dto.amount);
      let currency = this.normalizeOptionalString(dto.currency);
      let sourceType = OffboardingSettlementSourceEnum.MANUAL;
      let sourceReference: string | null = null;
      let calculationSnapshot: Record<string, unknown> | null =
        dto.metadata ?? null;
      if (dto.item_type === OffboardingSettlementItemTypeEnum.FINAL_SALARY) {
        const employee = await manager.getRepository(Employee).findOneOrFail({
          where: { id: request.employee_id, company_id: companyId },
        });
        const profile = await manager
          .getRepository(EmployeePayrollProfile)
          .findOne({ where: { companyId, employeeId: employee.id } });
        const compensation = await manager
          .getRepository(EmployeeCompensationVersion)
          .findOne({
            where: [
              {
                companyId,
                employeeId: employee.id,
                status: In([
                  EmployeeCompensationVersionStatusEnum.ACTIVE,
                  EmployeeCompensationVersionStatusEnum.SUPERSEDED,
                ]),
                effectiveFrom: LessThanOrEqual(request.last_working_date),
                effectiveTo: IsNull(),
              },
              {
                companyId,
                employeeId: employee.id,
                status: In([
                  EmployeeCompensationVersionStatusEnum.ACTIVE,
                  EmployeeCompensationVersionStatusEnum.SUPERSEDED,
                ]),
                effectiveFrom: LessThanOrEqual(request.last_working_date),
                effectiveTo: MoreThanOrEqual(request.last_working_date),
              },
            ],
            order: { effectiveFrom: 'DESC', id: 'DESC' },
          });
        if (
          !profile?.currency ||
          !compensation ||
          compensation.currency !== profile.currency
        ) {
          throw new BadRequestException(
            'An effective compensation version matching payroll currency is required for final salary.',
          );
        }
        const lastDate = request.last_working_date;
        const periodStart = `${lastDate.slice(0, 7)}-01`;
        const periodEnd = `${lastDate.slice(0, 7)}-${new Date(Date.UTC(Number(lastDate.slice(0, 4)), Number(lastDate.slice(5, 7)), 0)).getUTCDate().toString().padStart(2, '0')}`;
        const prorationMethod = this.configService.get<string>(
          'PAYROLL_DEFAULT_PRORATION_METHOD',
          'CALENDAR_DAYS',
        );
        const ratio = this.payrollProrationService.calculateRatio({
          periodStart,
          periodEnd,
          hireDate: employee.hire_date,
          exitDate: lastDate,
          compensationEffectiveFrom: compensation.effectiveFrom,
          method: prorationMethod,
        });
        amount = PayrollMoney.multiplyRatio(
          compensation.baseSalary,
          ratio.numerator,
          ratio.denominator,
        );
        currency = profile.currency;
        sourceType = OffboardingSettlementSourceEnum.PAYROLL_EXTERNAL;
        sourceReference = `FINAL-SALARY:${employee.id}:${lastDate}:${compensation.id}`;
        calculationSnapshot = {
          calculation: 'PAYROLL_POLICY_PRORATION',
          compensation_version_id: compensation.id,
          base_salary: compensation.baseSalary,
          pay_frequency: compensation.payFrequency,
          effective_from: compensation.effectiveFrom,
          period_start: periodStart,
          period_end: periodEnd,
          proration_method: prorationMethod,
          proration_ratio: ratio,
          currency,
        };
      }

      const settlementItem = await settlementItemRepository.save(
        settlementItemRepository.create({
          company_id: companyId,
          offboarding_request_id: offboardingRequestId,
          item_type: dto.item_type,
          title: dto.title.trim(),
          owner_company_user_id: dto.owner_company_user_id ?? null,
          status,
          amount,
          currency,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          completed_at:
            status === OffboardingSettlementStatusEnum.COMPLETED
              ? new Date()
              : null,
          remarks: this.normalizeOptionalString(dto.remarks),
          source_type: sourceType,
          source_reference: sourceReference,
          calculation_snapshot: calculationSnapshot,
          metadata: dto.metadata ?? null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return settlementItem;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding settlement item created',
      metadata: {
        settlement_item_id: created.id,
        item_type: created.item_type,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapSettlementItem(created);
  }

  async updateSettlementItem(
    companyId: number,
    offboardingRequestId: number,
    itemId: number,
    dto: UpdateOffboardingSettlementItemDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: dto.owner_company_user_id ?? null,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const settlementItemRepository =
        this.getOffboardingSettlementItemRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const settlementItem = await settlementItemRepository.findOneOrFail({
        where: { id: itemId, offboarding_request_id: offboardingRequestId },
      });

      if (
        settlementItem.item_type ===
        OffboardingSettlementItemTypeEnum.FINAL_SALARY
      ) {
        if (dto.status !== undefined && dto.status !== settlementItem.status) {
          throw new BadRequestException(
            'Final salary status is controlled by payroll reconciliation.',
          );
        }
      }

      if (dto.item_type !== undefined) settlementItem.item_type = dto.item_type;
      if (
        settlementItem.item_type ===
        OffboardingSettlementItemTypeEnum.FINAL_SALARY
      ) {
        throw new BadRequestException(
          'Final salary is payroll-calculated and cannot be edited manually; remove and recreate it from the current effective payroll rule.',
        );
      }
      if (dto.title !== undefined) settlementItem.title = dto.title.trim();
      if (dto.owner_company_user_id !== undefined)
        settlementItem.owner_company_user_id =
          dto.owner_company_user_id ?? null;
      if (dto.status !== undefined) settlementItem.status = dto.status;
      if (dto.amount !== undefined)
        settlementItem.amount = this.normalizeOptionalString(dto.amount);
      if (dto.currency !== undefined)
        settlementItem.currency = this.normalizeOptionalString(dto.currency);
      if (dto.due_date !== undefined)
        settlementItem.due_date = dto.due_date ? new Date(dto.due_date) : null;
      if (dto.remarks !== undefined)
        settlementItem.remarks = this.normalizeOptionalString(dto.remarks);
      if (dto.metadata !== undefined)
        settlementItem.metadata = dto.metadata ?? null;

      settlementItem.completed_at = this.isSettlementResolved(settlementItem)
        ? (settlementItem.completed_at ?? new Date())
        : null;

      const persisted = await settlementItemRepository.save(settlementItem);
      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return persisted;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding settlement item updated',
      metadata: { settlement_item_id: saved.id, status: saved.status },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapSettlementItem(saved);
  }

  async getExitInterview(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    return this.mapExitInterview(request.exit_interview);
  }

  async upsertExitInterview(
    companyId: number,
    offboardingRequestId: number,
    dto: UpsertOffboardingExitInterviewDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    await this.validateReferenceIds(companyId, {
      conducted_by_company_user_id: actor.companyMembershipId ?? null,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const exitInterviewRepository =
        this.getOffboardingExitInterviewRepository(manager);

      let exitInterview = await exitInterviewRepository.findOne({
        where: { offboarding_request_id: offboardingRequestId },
      });

      if (!exitInterview) {
        exitInterview = exitInterviewRepository.create({
          offboarding_request_id: offboardingRequestId,
          conducted_by_company_user_id: actor.companyMembershipId ?? null,
          status: OffboardingExitInterviewStatusEnum.DRAFT,
          exit_reason_category: null,
          employee_feedback: null,
          manager_feedback: null,
          rehire_eligible: null,
          knowledge_transfer_status:
            OffboardingKnowledgeTransferStatusEnum.NOT_STARTED,
          handover_notes: null,
          final_notes: null,
          submitted_at: new Date(),
          completed_at: null,
          metadata: null,
        });
      }

      exitInterview.conducted_by_company_user_id =
        actor.companyMembershipId ?? null;
      if (dto.status !== undefined) exitInterview.status = dto.status;
      if (dto.exit_reason_category !== undefined)
        exitInterview.exit_reason_category = this.normalizeOptionalString(
          dto.exit_reason_category,
        );
      if (dto.employee_feedback !== undefined)
        exitInterview.employee_feedback = this.normalizeOptionalString(
          dto.employee_feedback,
        );
      if (dto.manager_feedback !== undefined)
        exitInterview.manager_feedback = this.normalizeOptionalString(
          dto.manager_feedback,
        );
      if (dto.rehire_eligible !== undefined)
        exitInterview.rehire_eligible = dto.rehire_eligible;
      if (dto.knowledge_transfer_status !== undefined)
        exitInterview.knowledge_transfer_status = dto.knowledge_transfer_status;
      if (dto.handover_notes !== undefined)
        exitInterview.handover_notes = this.normalizeOptionalString(
          dto.handover_notes,
        );
      if (dto.final_notes !== undefined)
        exitInterview.final_notes = this.normalizeOptionalString(
          dto.final_notes,
        );
      if (dto.metadata !== undefined)
        exitInterview.metadata = dto.metadata ?? null;

      exitInterview.submitted_at = exitInterview.submitted_at ?? new Date();
      exitInterview.completed_at =
        exitInterview.status === OffboardingExitInterviewStatusEnum.COMPLETED
          ? (exitInterview.completed_at ?? new Date())
          : null;

      return exitInterviewRepository.save(exitInterview);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding exit interview updated',
      metadata: { exit_interview_id: saved.id, status: saved.status },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const loaded = await this.getOffboardingExitInterviewRepository().findOne({
      where: { id: saved.id },
      relations: { conducted_by_company_user: { user: true } },
    });

    return this.mapExitInterview(loaded ?? saved);
  }

  async addDocument(
    companyId: number,
    offboardingRequestId: number,
    dto: UploadOffboardingDocumentDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    const storedFile = await this.filesService.savePrivateBase64File(dto.file, {
      directorySegments: ['documents', 'offboarding', `company-${companyId}`],
      fileNamePrefix: `offboarding-${offboardingRequestId}`,
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES],
      maxFileSizeBytes: HR_PRIVATE_DOCUMENT_MAX_BYTES,
      validateFileSignature: true,
    });

    const document = await this.getDocumentRepository().save(
      this.getDocumentRepository().create({
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
        module: DocumentModuleEnum.OFFBOARDING,
        document_type: this.normalizeOptionalString(dto.document_type),
        title: dto.title.trim(),
        description: this.normalizeOptionalString(dto.description),
        file_name: storedFile.storedFileName,
        original_file_name: storedFile.originalFileName,
        mime_type: storedFile.mimeType,
        file_extension: storedFile.fileExtension,
        file_size: String(storedFile.fileSize),
        file_path: storedFile.publicPath,
        uploaded_by_company_user_id: actor.companyMembershipId ?? null,
        expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
      }),
    );

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding document uploaded',
      metadata: {
        document_id: document.id,
        title: document.title,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapDocument(document);
  }

  async downloadDocument(
    companyId: number,
    offboardingRequestId: number,
    documentId: number,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );

    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
      },
    });

    if (!document) {
      throw new NotFoundException('Offboarding document not found');
    }

    const buffer = await this.filesService.readManagedFile(document.file_path);

    if (!buffer) {
      throw new NotFoundException(
        'Offboarding document file was not found in storage',
      );
    }

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding document downloaded',
      metadata: {
        document_id: document.id,
        title: document.title,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return {
      buffer,
      fileName: document.original_file_name ?? document.file_name,
      mimeType: document.mime_type ?? 'application/octet-stream',
    };
  }

  async listDocuments(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
      },
      order: { created_at: 'DESC' },
    });

    return documents.map((document) => this.mapDocument(document));
  }

  async listLetters(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const letterDocumentTypes = ['RELIEVING_LETTER', 'SERVICE_LETTER'];
    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
        document_type: In(letterDocumentTypes),
      },
      order: { created_at: 'DESC' },
    });

    return documents.map((document) => this.mapDocument(document));
  }

  async updateDocument(
    companyId: number,
    offboardingRequestId: number,
    documentId: number,
    dto: {
      title?: string;
      description?: string | null;
      expiry_date?: string | null;
    },
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (dto.title !== undefined) document.title = dto.title.trim();
    if (dto.description !== undefined)
      document.description = dto.description?.trim() ?? null;
    if (dto.expiry_date !== undefined)
      document.expiry_date = dto.expiry_date ? new Date(dto.expiry_date) : null;

    const saved = await this.documentRepository.save(document);

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding document updated',
      metadata: { document_id: saved.id, title: saved.title },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapDocument(saved);
  }

  async removeDocument(
    companyId: number,
    offboardingRequestId: number,
    documentId: number,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const title = document.title;
    const filePath = document.file_path;
    await this.documentRepository.remove(document);
    await this.filesService.removeManagedFile(filePath);

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding document deleted',
      metadata: { document_id: documentId, title },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });
  }

  async createTask(
    companyId: number,
    offboardingRequestId: number,
    dto: CreateOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot add tasks to a closed offboarding request',
      );
    }

    await this.validateReferenceIds(companyId, {
      assigned_to_company_user_id: dto.assigned_to_company_user_id ?? null,
    });

    const created = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const task = await taskRepository.save(
        taskRepository.create({
          company_id: companyId,
          offboarding_request_id: offboardingRequestId,
          workflow_step_id: null,
          assigned_to_company_user_id: dto.assigned_to_company_user_id ?? null,
          title: dto.title.trim(),
          description: this.normalizeOptionalString(dto.description),
          task_type: dto.task_type ?? OffboardingTaskTypeEnum.GENERAL,
          status: OffboardingTaskStatusEnum.PENDING,
          priority: dto.priority ?? OffboardingTaskPriorityEnum.MEDIUM,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          reopened_at: null,
          reopened_by_company_user_id: null,
          reassigned_at: null,
          last_reassigned_by_company_user_id: null,
          remarks: null,
          metadata: dto.metadata ?? null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return task;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.TASK_CREATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task created',
      metadata: { task_id: created.id },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const assigneeRecipient = await this.findMembershipRecipient(
      companyId,
      created.assigned_to_company_user_id,
    );
    if (assigneeRecipient) {
      this.eventEmitter.emit(
        OffboardingTaskAssignedEvent.EVENT,
        new OffboardingTaskAssignedEvent(
          assigneeRecipient.name,
          assigneeRecipient.email,
          `${request.employee.first_name} ${request.employee.last_name}`.trim(),
          created.title,
          created.description,
          created.due_date,
          request.last_working_date ?? null,
          `${this.configService.get<string>(
            'APP_FRONTEND_URL',
          )!}/offboarding/${offboardingRequestId}/tasks`,
          companyId,
          offboardingRequestId,
          created.id,
          created.assigned_to_company_user_id,
          actor.companyMembershipId ?? null,
        ),
      );
    }

    return this.mapTask(created);
  }

  async completeTask(
    companyId: number,
    offboardingRequestId: number,
    taskId: number,
    dto: CompleteOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );

    const task = await this.offboardingTaskRepository.findOne({
      where: { id: taskId, offboarding_request_id: offboardingRequestId },
    });
    if (!task) {
      throw new NotFoundException('Offboarding task not found');
    }
    if (!this.canOperateAssignedTask(actor, task)) {
      await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    }

    if (task.status === OffboardingTaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Task is already completed');
    }
    if (task.status === OffboardingTaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Task is cancelled');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const currentTask = await taskRepository.findOneOrFail({
        where: { id: taskId, offboarding_request_id: offboardingRequestId },
      });

      if (currentTask.metadata?.is_system_operation === true) {
        throw new BadRequestException(
          'System offboarding tasks cannot be completed manually',
        );
      }

      if (
        currentTask.completion_evidence_required &&
        !dto.evidence_document_id
      ) {
        throw new BadRequestException(
          'evidence_document_id is required to complete this task',
        );
      }

      currentTask.status = OffboardingTaskStatusEnum.COMPLETED;
      currentTask.completed_at = new Date();
      currentTask.remarks = this.normalizeOptionalString(dto.remarks);
      currentTask.evidence_document_id = dto.evidence_document_id ?? null;
      currentTask.completion_data = dto.completion_data ?? null;
      currentTask.completed_by_company_user_id =
        actor.companyMembershipId ?? null;
      await taskRepository.save(currentTask);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return currentTask;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.TASK_COMPLETED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task completed',
      metadata: { task_id: saved.id },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    await this.eventEmitter.emitAsync(
      OffboardingTaskCompletedEvent.EVENT,
      new OffboardingTaskCompletedEvent(
        companyId,
        offboardingRequestId,
        saved.id,
        saved.title,
        `${request.employee.first_name} ${request.employee.last_name}`.trim(),
        actor.companyMembershipId ?? null,
        actor.employeeNo || actor.email,
      ),
    );

    return this.mapTask(saved);
  }

  async reassignTask(
    companyId: number,
    offboardingRequestId: number,
    taskId: number,
    dto: ReassignOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot reassign tasks on a closed offboarding request',
      );
    }

    await this.validateReferenceIds(companyId, {
      assigned_to_company_user_id: dto.assigned_to_company_user_id,
    });

    const currentTask = await this.offboardingTaskRepository.findOne({
      where: { id: taskId, offboarding_request_id: offboardingRequestId },
      relations: { assigned_to_company_user: { user: true } },
    });
    if (!currentTask) {
      throw new NotFoundException('Offboarding task not found');
    }

    if (currentTask.status === OffboardingTaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Cancelled task cannot be reassigned');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const task = await taskRepository.findOneOrFail({
        where: { id: taskId, offboarding_request_id: offboardingRequestId },
      });

      task.assigned_to_company_user_id = dto.assigned_to_company_user_id;
      if (dto.due_date !== undefined) {
        task.due_date = dto.due_date ? new Date(dto.due_date) : null;
      }
      task.reassigned_at = new Date();
      task.last_reassigned_by_company_user_id =
        actor.companyMembershipId ?? null;
      task.remarks = this.normalizeOptionalString(dto.remarks) ?? task.remarks;

      return taskRepository.save(task);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.TASK_REASSIGNED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task reassigned',
      metadata: {
        task_id: saved.id,
        assigned_to_company_user_id: saved.assigned_to_company_user_id,
        due_date: saved.due_date,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const assigneeRecipient = await this.findMembershipRecipient(
      companyId,
      saved.assigned_to_company_user_id,
    );
    if (assigneeRecipient) {
      this.eventEmitter.emit(
        OffboardingTaskAssignedEvent.EVENT,
        new OffboardingTaskAssignedEvent(
          assigneeRecipient.name,
          assigneeRecipient.email,
          `${request.employee.first_name} ${request.employee.last_name}`.trim(),
          saved.title,
          saved.description,
          saved.due_date,
          request.last_working_date ?? null,
          `${this.configService.get<string>(
            'APP_FRONTEND_URL',
          )!}/offboarding/${offboardingRequestId}/tasks`,
          companyId,
          offboardingRequestId,
          saved.id,
          saved.assigned_to_company_user_id,
          actor.companyMembershipId ?? null,
        ),
      );
    }

    return this.mapTask(saved);
  }

  async reopenTask(
    companyId: number,
    offboardingRequestId: number,
    taskId: number,
    dto: ReopenOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot reopen tasks on a closed offboarding request',
      );
    }

    if (dto.assigned_to_company_user_id !== undefined) {
      await this.validateReferenceIds(companyId, {
        assigned_to_company_user_id: dto.assigned_to_company_user_id,
      });
    }

    const currentTask = await this.offboardingTaskRepository.findOne({
      where: { id: taskId, offboarding_request_id: offboardingRequestId },
    });
    if (!currentTask) {
      throw new NotFoundException('Offboarding task not found');
    }

    if (currentTask.status === OffboardingTaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Cancelled task cannot be reopened');
    }

    if (
      currentTask.status !== OffboardingTaskStatusEnum.COMPLETED &&
      currentTask.status !== OffboardingTaskStatusEnum.REJECTED
    ) {
      throw new BadRequestException(
        'Only completed or rejected tasks can be reopened',
      );
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const task = await taskRepository.findOneOrFail({
        where: { id: taskId, offboarding_request_id: offboardingRequestId },
      });
      task.status = OffboardingTaskStatusEnum.PENDING;
      task.completed_at = null;
      task.reopened_at = new Date();
      task.reopened_by_company_user_id = actor.companyMembershipId ?? null;
      task.remarks = this.normalizeOptionalString(dto.remarks);

      if (dto.assigned_to_company_user_id !== undefined) {
        task.assigned_to_company_user_id = dto.assigned_to_company_user_id;
        task.reassigned_at = new Date();
        task.last_reassigned_by_company_user_id =
          actor.companyMembershipId ?? null;
      }
      if (dto.due_date !== undefined) {
        task.due_date = dto.due_date ? new Date(dto.due_date) : null;
      }

      await taskRepository.save(task);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      if (currentRequest.status === OffboardingRequestStatusEnum.REJECTED) {
        currentRequest.status = OffboardingRequestStatusEnum.IN_PROGRESS;
      }
      await this.updateRequestProgress(currentRequest, manager);

      return task;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.TASK_REOPENED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task reopened',
      metadata: {
        task_id: saved.id,
        assigned_to_company_user_id: saved.assigned_to_company_user_id,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapTask(saved);
  }

  async rejectTask(
    companyId: number,
    offboardingRequestId: number,
    taskId: number,
    dto: RejectOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );

    const task = await this.offboardingTaskRepository.findOne({
      where: { id: taskId, offboarding_request_id: offboardingRequestId },
    });
    if (!task) {
      throw new NotFoundException('Offboarding task not found');
    }
    if (!this.canOperateAssignedTask(actor, task)) {
      await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    }

    if (task.status === OffboardingTaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Completed task cannot be rejected');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const currentTask = await taskRepository.findOneOrFail({
        where: { id: taskId, offboarding_request_id: offboardingRequestId },
      });
      currentTask.status = OffboardingTaskStatusEnum.REJECTED;
      currentTask.remarks = this.normalizeOptionalString(dto.remarks);
      await taskRepository.save(currentTask);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      currentRequest.status = OffboardingRequestStatusEnum.REJECTED;
      await requestRepository.save(currentRequest);
      await this.offboardingWorkflowService.closeAllPendingApprovals(
        offboardingRequestId,
        'Skipped after task rejection',
        manager,
      );
      await this.updateRequestProgress(currentRequest, manager);

      return currentTask;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.REJECTED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task rejected',
      metadata: { task_id: saved.id, remarks: saved.remarks },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapTask(saved);
  }

  async applyApprovalAction(
    companyId: number,
    offboardingRequestId: number,
    dto: { approve: boolean; comments?: string },
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const membershipId = actor.companyMembershipId!;

    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    if (!this.isActorAssignedAtCurrentApprovalLevel(request, membershipId)) {
      await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    }

    await this.dataSource.transaction(async (manager) => {
      const current = await this.offboardingWorkflowService.applyApprovalAction(
        offboardingRequestId,
        membershipId,
        dto,
        manager,
      );
      await this.updateRequestProgress(current, manager);
    });

    await this.offboardingAuditService.log({
      action: dto.approve
        ? OffboardingAuditActionEnum.APPROVED
        : OffboardingAuditActionEnum.REJECTED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: dto.approve
        ? 'Offboarding approval action accepted'
        : 'Offboarding approval action rejected',
      metadata: { comments: dto.comments ?? null },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.findOneOffboardingRequest(
      companyId,
      offboardingRequestId,
      actor,
    );
  }

  async delegateApproval(
    companyId: number,
    offboardingRequestId: number,
    approvalId: number,
    dto: DelegateOffboardingApprovalDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const membershipId = actor.companyMembershipId!;
    const canDelegateAny = (actor.permissions ?? []).includes(
      'offboarding_approvals:delegate-any',
    );

    await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);

    await this.dataSource.transaction(async (manager) =>
      this.offboardingWorkflowService.delegateApproval(
        offboardingRequestId,
        approvalId,
        membershipId,
        dto.target_company_user_id,
        dto.reason,
        canDelegateAny,
        manager,
      ),
    );

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: `Offboarding approval ${approvalId} delegated to company user ${dto.target_company_user_id}`,
      metadata: { approval_id: approvalId, reason: dto.reason },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.findOneOffboardingRequest(
      companyId,
      offboardingRequestId,
      actor,
    );
  }

  async createClearance(
    companyId: number,
    offboardingRequestId: number,
    dto: CreateOffboardingClearanceDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const ownerCompanyUserId =
      dto.owner_company_user_id ?? actor.companyMembershipId ?? null;

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: ownerCompanyUserId,
    });

    const existing = await this.offboardingClearanceRepository.findOne({
      where: {
        offboarding_request_id: offboardingRequestId,
        clearance_type: dto.clearance_type,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Clearance entry for this type already exists',
      );
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const clearanceRepository =
        this.getOffboardingClearanceRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const clearance = await clearanceRepository.save(
        clearanceRepository.create({
          offboarding_request_id: offboardingRequestId,
          clearance_type: dto.clearance_type,
          status: dto.status ?? OffboardingClearanceStatusEnum.PENDING,
          remarks: this.normalizeOptionalString(dto.remarks),
          owner_company_user_id: ownerCompanyUserId,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          cleared_by_company_user_id:
            dto.status && dto.status !== OffboardingClearanceStatusEnum.PENDING
              ? (actor.companyMembershipId ?? null)
              : null,
          cleared_at:
            dto.status && dto.status !== OffboardingClearanceStatusEnum.PENDING
              ? new Date()
              : null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return clearance;
    });

    await this.offboardingAuditService.log({
      action:
        created.status === OffboardingClearanceStatusEnum.CLEARED
          ? OffboardingAuditActionEnum.CLEARANCE_COMPLETED
          : OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding clearance created',
      metadata: {
        clearance_id: created.id,
        clearance_type: created.clearance_type,
        status: created.status,
        owner_company_user_id: created.owner_company_user_id,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    if (created.status === OffboardingClearanceStatusEnum.PENDING) {
      const ownerRecipient = await this.findMembershipRecipient(
        companyId,
        created.owner_company_user_id,
      );
      if (ownerRecipient) {
        this.eventEmitter.emit(
          OffboardingClearanceRequiredEvent.EVENT,
          new OffboardingClearanceRequiredEvent(
            ownerRecipient.name,
            ownerRecipient.email,
            `${request.employee.first_name} ${request.employee.last_name}`.trim(),
            created.clearance_type,
            request.last_working_date ?? null,
            `${this.configService.get<string>(
              'APP_FRONTEND_URL',
            )!}/offboarding/${offboardingRequestId}/clearances`,
            companyId,
            offboardingRequestId,
            created.id,
            ownerRecipient.companyUserId ?? null,
            actor.companyMembershipId ?? null,
          ),
        );
      }
    }

    return this.mapClearance(created);
  }

  async completeClearance(
    companyId: number,
    offboardingRequestId: number,
    clearanceId: number,
    dto: CompleteOffboardingClearanceDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );

    const clearance = await this.offboardingClearanceRepository.findOne({
      where: { id: clearanceId, offboarding_request_id: offboardingRequestId },
      relations: { owner_company_user: true },
    });
    if (!clearance) {
      throw new NotFoundException('Offboarding clearance not found');
    }
    if (!this.canOperateOwnedClearance(actor, clearance)) {
      await this.assertCanAccessOffboardingEmployee(actor, request.employee);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const clearanceRepository =
        this.getOffboardingClearanceRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const currentClearance = await clearanceRepository.findOneOrFail({
        where: {
          id: clearanceId,
          offboarding_request_id: offboardingRequestId,
        },
      });

      currentClearance.status = dto.status;
      currentClearance.remarks = this.normalizeOptionalString(dto.remarks);
      currentClearance.cleared_by_company_user_id =
        dto.status === OffboardingClearanceStatusEnum.PENDING
          ? null
          : (actor.companyMembershipId ?? null);
      currentClearance.cleared_at =
        dto.status === OffboardingClearanceStatusEnum.PENDING
          ? null
          : new Date();
      await clearanceRepository.save(currentClearance);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return currentClearance;
    });

    await this.offboardingAuditService.log({
      action:
        saved.status === OffboardingClearanceStatusEnum.CLEARED
          ? OffboardingAuditActionEnum.CLEARANCE_COMPLETED
          : saved.status === OffboardingClearanceStatusEnum.NOT_CLEARED
            ? OffboardingAuditActionEnum.CLEARANCE_FAILED
            : OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding clearance updated',
      metadata: {
        clearance_id: saved.id,
        status: saved.status,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapClearance(saved);
  }

  async assignClearance(
    companyId: number,
    offboardingRequestId: number,
    clearanceId: number,
    dto: AssignOffboardingClearanceDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot assign clearance on a closed offboarding request',
      );
    }

    await this.validateReferenceIds(companyId, {
      owner_company_user_id: dto.owner_company_user_id,
    });

    const currentClearance = await this.offboardingClearanceRepository.findOne({
      where: { id: clearanceId, offboarding_request_id: offboardingRequestId },
    });
    if (!currentClearance) {
      throw new NotFoundException('Offboarding clearance not found');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const clearanceRepository =
        this.getOffboardingClearanceRepository(manager);
      const clearance = await clearanceRepository.findOneOrFail({
        where: {
          id: clearanceId,
          offboarding_request_id: offboardingRequestId,
        },
      });
      clearance.owner_company_user_id = dto.owner_company_user_id;
      if (dto.due_date !== undefined) {
        clearance.due_date = dto.due_date ? new Date(dto.due_date) : null;
      }
      if (dto.remarks !== undefined) {
        clearance.remarks = this.normalizeOptionalString(dto.remarks);
      }

      return clearanceRepository.save(clearance);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CLEARANCE_ASSIGNED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding clearance assigned',
      metadata: {
        clearance_id: saved.id,
        owner_company_user_id: saved.owner_company_user_id,
        due_date: saved.due_date,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const ownerRecipient = await this.findMembershipRecipient(
      companyId,
      saved.owner_company_user_id,
    );
    if (ownerRecipient) {
      this.eventEmitter.emit(
        OffboardingClearanceRequiredEvent.EVENT,
        new OffboardingClearanceRequiredEvent(
          ownerRecipient.name,
          ownerRecipient.email,
          `${request.employee.first_name} ${request.employee.last_name}`.trim(),
          saved.clearance_type,
          request.last_working_date ?? null,
          `${this.configService.get<string>(
            'APP_FRONTEND_URL',
          )!}/offboarding/${offboardingRequestId}/clearances`,
          companyId,
          offboardingRequestId,
          saved.id,
          ownerRecipient.companyUserId ?? null,
          actor.companyMembershipId ?? null,
        ),
      );
    }

    return this.mapClearance(saved);
  }

  async getProgress(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const summary = await this.dataSource.transaction(async (manager) => {
      const current = await this.getOffboardingRequestRepository(
        manager,
      ).findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      return this.updateRequestProgress(current, manager);
    });

    return {
      offboarding_request_id: offboardingRequestId,
      offboarding_code: request.offboarding_code,
      status: request.status,
      progress_percentage: summary.progress_percentage,
      tasks: {
        total: summary.total_tasks,
        completed: summary.completed_tasks,
        overdue: summary.overdue_tasks,
      },
      actions: {
        total: summary.total_actions,
        completed: summary.completed_actions,
        failed: summary.failed_actions,
      },
      approvals: {
        total: summary.total_approvals,
        approved: summary.approved_approvals,
      },
      clearances: {
        total: summary.total_clearances,
        cleared: summary.cleared_clearances,
        overdue: summary.overdue_clearances,
      },
      assets: {
        total: summary.total_assets,
        resolved: summary.returned_assets,
      },
      settlements: {
        total: summary.total_settlements,
        resolved: summary.completed_settlements,
      },
    };
  }

  async getApprovals(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const approvals = await this.offboardingApprovalRepository.find({
      where: { offboarding_request_id: offboardingRequestId },
      relations: {
        workflow_step: true,
        approver_company_user: { user: true },
      },
      order: {
        workflow_step: {
          approval_level: 'ASC',
        },
        id: 'ASC',
      },
    });

    return approvals.map((approval) => this.mapApproval(approval));
  }

  async getAuditLogs(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(
      companyId,
      offboardingRequestId,
    );
    await this.assertCanAccessOffboardingEmployee(actor, request.employee);

    const logs = await this.offboardingAuditLogRepository.find({
      where: { offboarding_request_id: offboardingRequestId },
      relations: {
        actor_company_user: { user: true },
      },
      order: { id: 'DESC' },
    });

    return logs.map((entry) => ({
      id: entry.id,
      offboarding_request_id: entry.offboarding_request_id,
      actor_company_user_id: entry.actor_company_user_id,
      action: entry.action,
      description: entry.description,
      old_values: entry.old_values,
      new_values: entry.new_values,
      metadata: entry.metadata,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      created_at: entry.created_at,
      actor: entry.actor_company_user?.user
        ? {
            id: entry.actor_company_user.user.id,
            first_name: entry.actor_company_user.user.first_name,
            last_name: entry.actor_company_user.user.last_name,
            email: entry.actor_company_user.user.email,
          }
        : null,
    }));
  }

  private async emitOffboardingSubmitted(
    companyId: number,
    offboardingRequestId: number,
  ): Promise<void> {
    try {
      const request = await this.offboardingRequestRepository.findOne({
        where: { id: offboardingRequestId, company_id: companyId },
        relations: {
          employee: { company_user: { user: true } },
          approvals: { approver_company_user: { user: true } },
        },
      });
      if (!request?.employee?.company_user?.user?.email) return;

      const employee = request.employee;
      const employeeName = `${employee.first_name} ${employee.last_name}`;
      const employeeEmail = employee.company_user!.user.email;
      const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;

      const approvers: NotificationRecipient[] = request.approvals
        .filter(
          (approval) =>
            approval.status === OffboardingApprovalStatusEnum.PENDING,
        )
        .flatMap((approval) => {
          const recipient = buildNotificationRecipient(
            approval.approver_company_user?.user,
            {
              companyUserId: approval.approver_company_user?.id,
            },
          );
          return recipient ? [recipient] : [];
        });

      this.eventEmitter.emit(
        OffboardingSubmittedEvent.EVENT,
        new OffboardingSubmittedEvent(
          companyId,
          employeeName,
          employeeEmail,
          request.last_working_date ?? null,
          approvers,
          `${frontendUrl}/offboarding/${offboardingRequestId}/review`,
          request.id,
          request.created_by_company_user_id ?? null,
          request.employee.company_user?.id ?? null,
        ),
      );
    } catch {
      // intentionally ignored
    }
  }

  private async emitOffboardingCompleted(
    companyId: number,
    request: OffboardingRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      const loaded = await this.offboardingRequestRepository.findOne({
        where: { id: request.id, company_id: companyId },
        relations: {
          employee: {
            company_user: { user: true },
            manager: { company_user: { user: true } },
          },
        },
      });
      if (!loaded?.employee?.company_user?.user?.email) return;

      const employee = loaded.employee;
      const employeeName = `${employee.first_name} ${employee.last_name}`;
      const employeeEmail = employee.company_user!.user.email;
      const managerEmail = employee.manager?.company_user?.user?.email ?? null;
      const managerName = employee.manager
        ? `${employee.manager.first_name} ${employee.manager.last_name}`
        : null;

      this.eventEmitter.emit(
        OffboardingCompletedEvent.EVENT,
        new OffboardingCompletedEvent(
          employeeName,
          employeeEmail,
          loaded.last_working_date ?? null,
          managerEmail,
          managerName,
          await this.resolveCompanyRoleRecipients(
            companyId,
            HR_NOTIFICATION_ROLE_NAMES,
          ),
          loaded.id,
          companyId,
          actor.companyMembershipId ?? null,
          employee.company_user!.id,
          employee.manager?.company_user?.id ?? null,
        ),
      );
    } catch {
      // intentionally ignored
    }
  }
}
