import { reportingManagerSql } from '../shared/reporting-manager';
import {
  LeaveSignatureService,
  parseSignatureMark,
  type SignatureView,
} from './services/leave-signature.service';
import {
  PayrollComponent,
  PayrollPeriod,
} from '../payroll/entities/payroll-configuration.entities';
import { PayrollInput } from '../payroll/entities/payroll-run.entities';
import {
  PayrollInputStatusEnum,
  PayrollPeriodStatusEnum,
  PayrollTaxTreatmentEnum,
} from '../payroll/payroll.enums';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  VERSIONED_POLICY_FIELDS,
  comparePolicyVersions,
  dayBefore,
} from './utils/leave-policy-version.util';
import {
  LeaveStatutoryService,
  assertFinanceReady,
} from './services/leave-statutory.service';
import { LeaveEncashmentCalculatorService } from './services/leave-encashment-calculator.service';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  MoreThan,
  Not,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  hasAnyPermission,
  hasPermission,
} from '../../../common/utils/permission.util';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Role } from '../../roles/entities/role.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta, normalizeDateInput } from '../shared/hr.utils';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { AddLeaveDocumentDto } from './dtos/add-leave-document.dto';
import { AdjustLeaveBalanceDto } from './dtos/adjust-leave-balance.dto';
import { CancelLeaveRequestDto } from './dtos/cancel-leave-request.dto';
import { CreateHolidayDto } from './dtos/create-holiday.dto';
import { CreateLeavePolicyDto } from './dtos/create-leave-policy.dto';
import { CreateLeaveRequestDto } from './dtos/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dtos/update-leave-request.dto';
import { accrualPeriodEnd, roundLeaveDays } from './utils/leave-accrual.util';
import { LeaveBalanceProjectionQueryDto } from './dtos/leave-balance-projection-query.dto';
import { CreateLeaveTypeDto } from './dtos/create-leave-type.dto';
import { CreateLeaveWorkflowDto } from './dtos/create-leave-workflow.dto';
import { CreateLeaveWorkflowStepDto } from './dtos/create-leave-workflow-step.dto';
import { GenerateLeaveBalancesDto } from './dtos/generate-leave-balances.dto';
import { HolidayQueryDto } from './dtos/holiday-query.dto';
import {
  BulkLeaveApprovalActionDto,
  LeaveApprovalActionDto,
} from './dtos/leave-approval-action.dto';
import { LeaveBalanceAdjustmentQueryDto } from './dtos/leave-balance-adjustment-query.dto';
import { LeaveBalanceQueryDto } from './dtos/leave-balance-query.dto';
import { LeaveBalanceTransactionQueryDto } from './dtos/leave-balance-transaction-query.dto';
import { LeaveBalanceAdjustmentModeEnum } from './enums/leave-balance-adjustment-mode.enum';
import { LeavePolicyQueryDto } from './dtos/leave-policy-query.dto';
import {
  LeaveRequestQueryDto,
  LeaveRequestView,
} from './dtos/leave-request-query.dto';
import { LeaveTeamCalendarQueryDto } from './dtos/leave-team-calendar-query.dto';
import { LeaveTypeQueryDto } from './dtos/leave-type-query.dto';
import { LeaveWorkflowQueryDto } from './dtos/leave-workflow-query.dto';
import { UpdateHolidayDto } from './dtos/update-holiday.dto';
import { UpdateLeavePolicyDto } from './dtos/update-leave-policy.dto';
import { UpdateLeaveTypeDto } from './dtos/update-leave-type.dto';
import { UpdateLeaveWorkflowDto } from './dtos/update-leave-workflow.dto';
import { UpdateLeaveWorkflowStepDto } from './dtos/update-leave-workflow-step.dto';
import { UpsertLeaveMedicalDetailDto } from './dtos/upsert-leave-medical-detail.dto';
import { LeaveAccrualMethodEnum } from './enums/leave-accrual-method.enum';
import { LeaveApproverTypeEnum } from './enums/leave-approver-type.enum';
import { LeaveGenderRestrictionEnum } from './enums/leave-gender-restriction.enum';
import { LeaveRecordStatusEnum } from './enums/leave-record-status.enum';
import { LeaveStatusEnum } from './enums/leave-status.enum';
import { LeaveDayTreatmentEnum } from './enums/leave-day-treatment.enum';
import { LeaveDurationTypeEnum } from './enums/leave-duration-type.enum';
import { LeaveHalfDaySessionEnum } from './enums/leave-half-day-session.enum';
import { LeaveApprovalWorkflowStep } from './entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from './entities/leave-approval-workflow.entity';
import { LeaveBalanceAdjustment } from './entities/leave-balance-adjustment.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveBalanceTransaction } from './entities/leave-balance-transaction.entity';
import { LeaveEncashmentRequest } from './entities/leave-encashment-request.entity';
import { LeaveDocument } from './entities/leave-document.entity';
import { LeaveMedicalDetail } from './entities/leave-medical-detail.entity';
import { LeaveNumberSequence } from './entities/leave-number-sequence.entity';
import { LeavePolicyType } from './entities/leave-policy-type.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveAuditService } from './services/leave-audit.service';
import {
  AccrualConfig,
  LeaveBalanceService,
} from './services/leave-balance.service';
import {
  AccumulationCapInput,
  LeaveBalanceLedgerService,
} from './services/leave-balance-ledger.service';
import { LeaveDurationCalculatorService } from './services/leave-duration-calculator.service';
import {
  LeavePdfAttachment,
  LeavePdfBalance,
  LeavePdfPayload,
  LeavePdfService,
} from './services/leave-pdf.service';
import {
  PreparedSupporting,
  SupportingDocumentError,
  SupportingSource,
  assignPageRanges,
  mergeLeavePdf,
  prepareSupportingDocuments,
} from './services/leave-pdf-attachments';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { LeaveActingAssignmentService } from './services/leave-acting-assignment.service';
import { LeaveApprovalActionEnum } from './enums/leave-approval-action.enum';
import { LeaveWorkflowService } from './services/leave-workflow.service';
import {
  openingOrCarriedDays,
  isEmployeeEligibleForLeaveType,
} from './utils/leave-balance-rules.util';
import { calculateAvailableLeaveDays } from './utils/leave-balance-rules.util';
import { isCalendarLeaveYear } from './utils/leave-cycle.util';
import { CreateLeaveEncashmentRequestDto } from './dtos/create-leave-encashment-request.dto';
import { DecideLeaveEncashmentRequestDto } from './dtos/decide-leave-encashment-request.dto';
import {
  RecordLeaveEncashmentPayrollHandoffDto,
  RecordLeaveEncashmentPaymentDto,
} from './dtos/record-leave-encashment-payroll-handoff.dto';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeConfirmationStatusEnum } from '../employees/enums/employee-confirmation-status.enum';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { Position } from '../positions/entities/position.entity';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from '../attendance/processing/enums/attendance-processing-job-status.enum';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { AttendanceHolidayTypeEnum } from '../attendance/holidays/enums/attendance-holiday-type.enum';
import { HolidayGroup } from '../attendance/holidays/entities/holiday-group.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  emitLeaveLifecycle,
  encashmentNotification,
} from './utils/leave-lifecycle-notify.util';
import { ConfigService } from '@nestjs/config';
import {
  LeaveCancelledEvent,
  LeaveSubmittedEvent,
  NotificationRecipient,
} from '../notifications/events';
import { buildNotificationRecipient } from '../notifications/notification-recipient.util';
import { LeaveRequestApproval } from './entities/leave-request-approval.entity';
import { LeaveApprovalStatusEnum } from './enums/leave-approval-status.enum';
import { FilesService } from '../../files/files.service';
import { LeaveVerificationService } from './services/leave-verification.service';
import {
  HR_PRIVATE_DOCUMENT_MAX_BYTES,
  HR_PRIVATE_DOCUMENT_MIME_TYPES,
} from '../../files/file-policy';

import {
  evidenceStatus,
  isEvidenceRequiredFor,
  evidenceDueAtLeaveEnd,
} from './services/leave-evidence';
import { ExtendLeaveEvidenceDto } from './dtos/extend-leave-evidence.dto';

type PolicyContext = {
  policy: LeavePolicy | null;
  /** Accrual for this leave type (per-type override, else the policy's). */
  accrual: AccrualConfig | null;
  allowNegativeBalance: boolean;
  maxConsecutiveDays: number | null;
  minServiceMonths: number;
  requiresApproval: boolean;
  maxPerRequestDays: number | null;
};

/** Statuses a stale request may be auto-approved from. */
const AUTO_APPROVABLE_STATUSES = [
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
  LeaveStatusEnum.IN_REVIEW,
];

/** Statuses where an approval level is waiting for a decision. */
const LEAVE_AWAITING_DECISION_STATUSES = [
  LeaveStatusEnum.SUBMITTED,
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
  LeaveStatusEnum.IN_REVIEW,
];

/** Approval rows where the approver actually decided (not skipped/pending). */
const DECIDED_APPROVAL_STATUSES = [
  LeaveApprovalStatusEnum.APPROVED,
  LeaveApprovalStatusEnum.REJECTED,
  LeaveApprovalStatusEnum.RETURNED,
];

/** "Open" requests: awaiting a decision or back with the employee. */
const LEAVE_OPEN_STATUSES = [
  ...LEAVE_AWAITING_DECISION_STATUSES,
  LeaveStatusEnum.RETURNED_FOR_CORRECTION,
];

/** Payroll component code used for leave encashment payroll inputs. */
export const LEAVE_ENCASHMENT_COMPONENT_CODE = 'LEAVE_ENCASHMENT';

@Injectable()
export class LeaveService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    @InjectRepository(LeavePolicy)
    private readonly leavePolicyRepository: Repository<LeavePolicy>,
    @InjectRepository(LeaveNumberSequence)
    private readonly leaveNumberSequenceRepository: Repository<LeaveNumberSequence>,
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepository: Repository<LeaveBalance>,
    @InjectRepository(LeaveEncashmentRequest)
    private readonly leaveEncashmentRepository: Repository<LeaveEncashmentRequest>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(LeaveApprovalWorkflow)
    private readonly leaveApprovalWorkflowRepository: Repository<LeaveApprovalWorkflow>,
    @InjectRepository(LeaveApprovalWorkflowStep)
    private readonly leaveApprovalWorkflowStepRepository: Repository<LeaveApprovalWorkflowStep>,
    @InjectRepository(LeaveMedicalDetail)
    private readonly leaveMedicalDetailRepository: Repository<LeaveMedicalDetail>,
    @InjectRepository(LeaveDocument)
    private readonly leaveDocumentRepository: Repository<LeaveDocument>,
    @InjectRepository(AttendanceHoliday)
    private readonly attendanceHolidayRepository: Repository<AttendanceHoliday>,
    @InjectRepository(HolidayGroup)
    private readonly holidayGroupRepository: Repository<HolidayGroup>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(EmployeeGrade)
    private readonly employeeGradeRepository: Repository<EmployeeGrade>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(AttendanceRecalculationJob)
    private readonly attendanceRecalculationJobRepository: Repository<AttendanceRecalculationJob>,
    private readonly hrAccessService: HrAccessService,
    private readonly positionAvailabilityService: PositionAvailabilityService,
    private readonly leaveAuditService: LeaveAuditService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly leaveBalanceLedgerService: LeaveBalanceLedgerService,
    private readonly leaveDurationCalculatorService: LeaveDurationCalculatorService,
    private readonly leaveWorkflowService: LeaveWorkflowService,
    private readonly leavePdfService: LeavePdfService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly leaveVerificationService: LeaveVerificationService,
    @Optional()
    private readonly leaveStatutoryService?: LeaveStatutoryService,
    @Optional()
    private readonly leaveEncashmentCalculator?: LeaveEncashmentCalculatorService,
    @Optional()
    private readonly leaveActingAssignmentService?: LeaveActingAssignmentService,
  ) {}

  private readonly logger = new Logger(LeaveService.name);

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeOptionalTimeString(value: unknown): string | null {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) {
      return null;
    }

    return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === 'string' &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }

  private assertDateOrder(
    startDate: string,
    endDate: string,
    message: string,
  ): void {
    if (new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException(message);
    }
  }

  private buildEmployeeName(employee: Employee): string {
    return [employee.first_name, employee.middle_name, employee.last_name]
      .filter((item) => !!item)
      .join(' ');
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
  ): Promise<Employee> {
    const repository =
      manager?.getRepository(Employee) ?? this.employeeRepository;
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

  /**
   * What an approver needs beside the request: the employee's balance for
   * this leave type as of the leave end, colleagues (same department or same
   * manager) off on overlapping dates, and the last 30 days of attendance.
   */
  async getLeaveReviewContext(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.leaveRequestRepository.findOne({
      where: { id: leaveRequestId, company_id: companyId },
      relations: { employee: true },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);
    const employee = request.employee;
    const startDate = normalizeDateInput(request.start_date, 'start_date');
    const endDate = normalizeDateInput(request.end_date, 'end_date');

    const projection = await this.getLeaveBalanceProjection(
      companyId,
      employee.id,
      { leave_type_id: request.leave_type_id, as_of: endDate, period: 'day' },
      actor,
    );

    const overlapQuery = this.leaveRequestRepository
      .createQueryBuilder('other')
      .innerJoin('other.employee', 'colleague')
      .leftJoin('other.leave_type', 'leaveType')
      .select([
        'other.id AS id',
        'other.start_date AS start_date',
        'other.end_date AS end_date',
        'other.status AS status',
        "CONCAT(colleague.first_name, ' ', colleague.last_name) AS employee_name",
        'leaveType.name AS leave_type_name',
      ])
      .where('other.company_id = :companyId', { companyId })
      .andWhere('other.employee_id <> :employeeId', { employeeId: employee.id })
      .andWhere('other.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.APPROVED,
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
          LeaveStatusEnum.IN_REVIEW,
        ],
      })
      .andWhere('other.start_date <= :endDate', { endDate })
      .andWhere('other.end_date >= :startDate', { startDate })
      .orderBy('other.start_date', 'ASC')
      .limit(50);
    const teamConditions: string[] = [];
    if (employee.primary_department_id) {
      teamConditions.push('colleague.primary_department_id = :departmentId');
    }
    if (employee.reports_to) {
      teamConditions.push('colleague.reports_to = :managerId');
    }
    const overlapping = teamConditions.length
      ? await overlapQuery
          .andWhere(`(${teamConditions.join(' OR ')})`, {
            departmentId: employee.primary_department_id,
            managerId: employee.reports_to,
          })
          .getRawMany<Record<string, unknown>>()
      : [];

    const attendanceFrom = new Date(Date.now() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const attendance = await this.dataSource
      .getRepository(AttendanceDailySummary)
      .createQueryBuilder('summary')
      .select('summary.attendanceStatus', 'status')
      .addSelect('COUNT(*)', 'days')
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.employeeId = :employeeId', { employeeId: employee.id })
      .andWhere('summary.attendanceDate >= :from', { from: attendanceFrom })
      .groupBy('summary.attendanceStatus')
      .getRawMany<{ status: string; days: string }>();

    return {
      leave_request_id: request.id,
      balance: projection.balances[0] ?? null,
      balance_as_of: endDate,
      overlapping_team_leave: overlapping,
      attendance_last_30_days: {
        from: attendanceFrom,
        by_status: attendance.map((row) => ({
          status: row.status,
          days: Number(row.days),
        })),
      },
    };
  }

  /**
   * Point-in-time balances for a day, week, month or leave year. Accrual is
   * recomputed from dates for each point, so values are exact and the
   * breakdown separates accrued, available, pending, used and projected days.
   */
  async getLeaveBalanceProjection(
    companyId: number,
    employeeId: number,
    query: LeaveBalanceProjectionQueryDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    const asOf = normalizeDateInput(
      query.as_of ?? new Date().toISOString().slice(0, 10),
      'as_of',
    );
    const period = query.period ?? 'day';
    // The leave year follows the employee's policy cycle (calendar,
    // anniversary or custom), taken from the requested or first leave type.
    const cycleTypeId =
      query.leave_type_id ??
      (
        await this.leaveTypeRepository.findOne({
          where: {
            company_id: companyId,
            status: LeaveRecordStatusEnum.ACTIVE,
          },
          order: { id: 'ASC' },
          select: ['id'],
        })
      )?.id;
    const cycleConfig = cycleTypeId
      ? (await this.resolvePolicyContext(companyId, employee, cycleTypeId))
          .accrual
      : null;
    const cycle = this.leaveBalanceService.cycleForDate(
      cycleConfig,
      asOf,
      employee,
    );
    const leaveYear = cycle.label;
    const periodEnd = accrualPeriodEnd(asOf, period);
    const yearEnd = cycle.endDate;
    const pointEnd = periodEnd < yearEnd ? periodEnd : yearEnd;

    const balances =
      await this.leaveBalanceService.ensureBalancesForEmployeeYear(
        companyId,
        employee,
        leaveYear,
        undefined,
        query.leave_type_id,
      );
    const toNumber = (value: string | null | undefined) =>
      this.leaveBalanceService.toNumber(value);

    const leaveTypeNames = new Map(
      (
        await this.leaveTypeRepository.find({
          where: { company_id: companyId },
          select: ['id', 'name'],
        })
      ).map((type) => [type.id, type.name]),
    );
    const rows: Array<Record<string, unknown>> = [];
    for (const balance of balances) {
      if (query.leave_type_id && balance.leave_type_id !== query.leave_type_id)
        continue;
      const { accrual } = await this.resolvePolicyContext(
        companyId,
        employee,
        balance.leave_type_id,
      );
      const entitlement = toNumber(balance.entitlement_days);
      const accrue = (date: string) =>
        this.leaveBalanceService.accruedDaysAsOf(
          entitlement,
          accrual,
          leaveYear,
          employee,
          date,
        );
      const carriedForward = openingOrCarriedDays(balance);
      const availableWith = (accruedDays: number) =>
        roundLeaveDays(calculateAvailableLeaveDays(balance, { accruedDays }));
      const accruedToDate = accrue(asOf);
      const accruedByPeriodEnd = accrue(pointEnd);
      const projectedYearEnd = accrue(yearEnd);
      rows.push({
        leave_type_id: balance.leave_type_id,
        leave_type_name: leaveTypeNames.get(balance.leave_type_id) ?? null,
        accrual_method: accrual?.accrual_method ?? 'yearly',
        annual_entitlement_days: roundLeaveDays(entitlement),
        carried_forward_days: roundLeaveDays(carriedForward),
        adjusted_days: roundLeaveDays(toNumber(balance.adjusted_days)),
        expired_days: roundLeaveDays(toNumber(balance.expired_days)),
        used_days: roundLeaveDays(toNumber(balance.used_days)),
        pending_days: roundLeaveDays(toNumber(balance.pending_days)),
        approved_future_days: roundLeaveDays(
          toNumber(balance.approved_future_days),
        ),
        accrued_to_date: roundLeaveDays(accruedToDate),
        accrued_by_period_end: roundLeaveDays(accruedByPeriodEnd),
        projected_year_end_accrual: roundLeaveDays(projectedYearEnd),
        available_now: availableWith(accruedToDate),
        available_by_period_end: availableWith(accruedByPeriodEnd),
        projected_year_end_balance: availableWith(projectedYearEnd),
      });
    }

    return {
      employee_id: employee.id,
      leave_year: leaveYear,
      as_of: asOf,
      period,
      period_end: pointEnd,
      balances: rows,
    };
  }

  /**
   * Accruing policies (daily/monthly): an employee may book only leave that
   * will have accrued by the last day of the requested leave in each leave
   * year, plus carried-forward and adjusted days, less used/pending days.
   */
  private assertWithinAccruedEntitlement(
    balances: LeaveBalance[],
    leaveRequest: LeaveRequest,
    totalDays: number,
    fallbackYear: string,
    employee: Employee,
    policyContext: PolicyContext,
  ): void {
    if (
      policyContext.allowNegativeBalance ||
      !this.leaveBalanceService.isAccruingPolicy(policyContext.accrual)
    ) {
      return;
    }
    const endDate = normalizeDateInput(leaveRequest.end_date, 'end_date');
    const toNumber = (value: string | null | undefined) =>
      this.leaveBalanceService.toNumber(value);
    for (const balance of balances) {
      if (balance.leave_type_id !== leaveRequest.leave_type_id) continue;
      const days = this.leaveBalanceLedgerService.daysForBalanceYear(
        balance,
        totalDays,
        fallbackYear,
        { calculation_snapshot: leaveRequest.calculation_snapshot },
      );
      if (days <= 0) continue;
      const yearEnd =
        balance.leave_year_end_date?.slice(0, 10) ??
        `${balance.fiscal_year}-12-31`;
      const asOf = endDate < yearEnd ? endDate : yearEnd;
      const accrued = this.leaveBalanceService.accruedDaysAsOf(
        toNumber(balance.entitlement_days),
        policyContext.accrual,
        balance.fiscal_year,
        employee,
        asOf,
      );
      const bookable = calculateAvailableLeaveDays(balance, {
        accruedDays: accrued,
      });
      if (days > bookable + 1e-9) {
        throw new BadRequestException(
          `Only ${roundLeaveDays(Math.max(bookable, 0))} day(s) will have accrued by ${asOf}; this request needs ${days} day(s) in ${balance.fiscal_year}.`,
        );
      }
    }
  }

  /**
   * Maps a leave date to the balance year (leave cycle label) it belongs to
   * for this employee and leave type: the calendar year, or the cycle that
   * contains it under an anniversary or custom leave year.
   */
  private async balanceYearMapper(
    companyId: number,
    employeeId: number,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<(date: string) => string> {
    const calendar = (date: string) => String(date).slice(0, 4);
    const employee = await (
      manager?.getRepository(Employee) ?? this.employeeRepository
    ).findOne({ where: { id: employeeId, company_id: companyId } });
    if (!employee) return calendar;
    const { accrual } = await this.resolvePolicyContext(
      companyId,
      employee,
      leaveTypeId,
      manager,
    );
    if (isCalendarLeaveYear(accrual, employee.hire_date)) return calendar;
    return (date: string) =>
      this.leaveBalanceService.cycleForDate(
        accrual,
        String(date).slice(0, 10),
        employee,
      ).label;
  }

  /**
   * Refund handler for leave days that belong to a year already closed by
   * rollover (cancellation or end-early after year end). Business decision
   * (2026-11-18): the closed year stays frozen; the days are credited to the
   * employee's current leave year as an audited adjustment, limited by the
   * maximum accumulation. Days that do not fit, and refunds whose closed
   * year was encashed, are flagged to HR in the audit log.
   */
  private closedYearRefundHandler(
    manager: EntityManager,
    companyId: number,
    employee: Employee,
    leaveTypeId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    return async (
      closedBalance: LeaveBalance,
      days: number,
      idempotencyKey: string,
    ) => {
      const yearOf = await this.balanceYearMapper(
        companyId,
        employee.id,
        leaveTypeId,
        manager,
      );
      const currentYear = yearOf(new Date().toISOString().slice(0, 10));
      if (currentYear === closedBalance.fiscal_year) {
        throw new BadRequestException(
          `Leave year ${currentYear} is closed and no later leave year is open yet; ask HR to reopen or record an adjustment.`,
        );
      }
      const current = await this.leaveBalanceService.ensureBalanceForEmployee(
        companyId,
        employee,
        leaveTypeId,
        currentYear,
        manager,
      );
      const assignment = await this.leaveBalanceService.resolvePolicyAssignment(
        companyId,
        employee,
        leaveTypeId,
        manager,
      );
      const max = this.leaveBalanceService.maximumAccumulationDays(assignment);
      const available = calculateAvailableLeaveDays(current);
      const credit =
        max === null
          ? days
          : Math.max(0, Math.min(days, Number((max - available).toFixed(2))));
      const shortfall = Number((days - credit).toFixed(2));
      const encashed = await manager
        .getRepository(LeaveEncashmentRequest)
        .find({
          where: {
            company_id: companyId,
            employee_id: employee.id,
            leave_type_id: leaveTypeId,
            fiscal_year: closedBalance.fiscal_year,
            status: 'approved',
          },
          select: ['id', 'payment_status', 'approved_days', 'source'],
        });
      const metadata = {
        closed_leave_year: closedBalance.fiscal_year,
        closed_balance_id: closedBalance.id,
        refunded_days: days,
        credited_days: credit,
        capped_days: shortfall,
        leave_request_id: leaveRequestId,
        closed_year_encashments: encashed.map((e) => ({
          id: e.id,
          payment_status: e.payment_status,
          approved_days: e.approved_days,
          source: e.source,
        })),
      };

      let result: Awaited<
        ReturnType<LeaveBalanceLedgerService['applyManualAdjustment']>
      > | null = null;
      if (credit > 0) {
        result = await this.leaveBalanceLedgerService.applyManualAdjustment(
          current,
          {
            companyId,
            employeeId: employee.id,
            leaveTypeId,
            leaveYear: currentYear,
            effectiveDate: new Date().toISOString().slice(0, 10),
            mode: LeaveBalanceAdjustmentModeEnum.ADD,
            amount: credit,
            reason: leaveRequestId
              ? `Refund of ${days} day(s) from closed leave year ${closedBalance.fiscal_year} (leave request #${leaveRequestId})`
              : `Refund of ${days} day(s) from closed leave year ${closedBalance.fiscal_year} (rejected year-end encashment)`,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
            idempotencyKey,
            reference: leaveRequestId
              ? `leave-request:${leaveRequestId}`
              : idempotencyKey,
            metadata,
            accumulationCap: {
              maximumDays: max,
              policyReference: assignment
                ? `leave_policy:${assignment.policy.id}`
                : null,
            },
          },
          manager,
        );
      }
      if (shortfall > 0 || encashed.length > 0) {
        await this.leaveAuditService.log({
          company_id: companyId,
          action: 'leave_balance.closed_year_refund_needs_review',
          entity_name: 'leave_request',
          entity_id: leaveRequestId,
          actor,
          payload: {
            ...metadata,
            review_reasons: [
              ...(shortfall > 0
                ? [
                    `${shortfall} day(s) could not be credited because of the maximum accumulation`,
                  ]
                : []),
              ...(encashed.length > 0
                ? [
                    `Leave year ${closedBalance.fiscal_year} had encashment(s); check whether the refunded days were already paid out`,
                  ]
                : []),
            ],
          },
        });
      }
      return result;
    };
  }

  /** Calendar days from today (UTC) until the given ISO date. */
  private daysUntil(date: string): number {
    const today = new Date().toISOString().slice(0, 10);
    return Math.round(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
        86_400_000,
    );
  }

  private isOwnLeaveRequest(employee: Employee, actor: AuthenticatedUser) {
    return (
      !!actor.companyMembershipId &&
      employee.company_user_id === actor.companyMembershipId
    );
  }

  /**
   * Policy minimum notice. Employees filing their own leave must always give
   * it. Someone filing on an employee's behalf may record leave that has
   * already started (e.g. reported sickness; the backdating limit applies),
   * but future leave inside the notice period needs leave_requests:override
   * and a reason, and is recorded as an override.
   */
  private assertMinimumNotice(
    policy: LeavePolicy | null,
    employee: Employee,
    startDate: string,
    actor: AuthenticatedUser,
    overrideReason?: string | null,
  ): { overridden: false } | { overridden: true; reason: string } {
    const noticeDays = policy?.minimum_notice_days ?? 0;
    const daysUntilStart = this.daysUntil(startDate);
    if (noticeDays <= 0 || daysUntilStart >= noticeDays) {
      return { overridden: false };
    }
    const message = `This leave requires at least ${noticeDays} day(s) notice before the start date.`;
    if (this.isOwnLeaveRequest(employee, actor)) {
      throw new BadRequestException(message);
    }
    if (daysUntilStart <= 0) return { overridden: false };
    if (!hasPermission(actor.permissions, 'leave_requests:override')) {
      throw new BadRequestException(
        `${message} Filing it on the employee's behalf needs the leave_requests:override permission.`,
      );
    }
    const reason = overrideReason?.trim() ?? '';
    if (reason.length < 5) {
      throw new BadRequestException(
        `${message} Give a notice override reason (at least 5 characters) to file it on the employee's behalf.`,
      );
    }
    return { overridden: true, reason };
  }

  private noticeOverrideColumns(
    result: ReturnType<LeaveService['assertMinimumNotice']>,
    actor: AuthenticatedUser,
  ) {
    return result.overridden
      ? {
          notice_override_reason: result.reason,
          notice_overridden_at: new Date(),
          notice_overridden_by_company_user_id:
            actor.companyMembershipId ?? null,
        }
      : {
          notice_override_reason: null,
          notice_overridden_at: null,
          notice_overridden_by_company_user_id: null,
        };
  }

  /** Stamps (or clears) the override on an existing request and audits it. */
  private async recordNoticeOverride(
    companyId: number,
    leaveRequest: LeaveRequest,
    result: ReturnType<LeaveService['assertMinimumNotice']>,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    // Nothing to write when no override is needed and none was stamped.
    if (!result.overridden && !leaveRequest.notice_overridden_at) return;
    const columns = this.noticeOverrideColumns(result, actor);
    const repository = manager
      ? manager.getRepository(LeaveRequest)
      : this.leaveRequestRepository;
    await repository.update(
      { id: leaveRequest.id, company_id: companyId },
      columns,
    );
    Object.assign(leaveRequest, columns);
    if (!result.overridden) return;
    await this.auditNoticeOverride(
      companyId,
      leaveRequest,
      result,
      actor,
      manager,
    );
  }

  private async auditNoticeOverride(
    companyId: number,
    leaveRequest: LeaveRequest,
    result: { overridden: true; reason: string },
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    await this.leaveAuditService.log(
      {
        company_id: companyId,
        action: 'leave_request.notice_overridden',
        entity_name: 'leave_request',
        entity_id: leaveRequest.id,
        leave_request_id: leaveRequest.id,
        actor,
        payload: {
          reason: result.reason,
          start_date: leaveRequest.start_date,
          employee_id: leaveRequest.employee_id,
        },
      },
      manager,
    );
  }

  private assertEmployeeCanRequestLeave(
    employee: Employee,
    startDate: string,
    endDate: string,
  ): void {
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active employees can create or submit leave requests.',
      );
    }

    if (
      employee.exit_date &&
      (startDate > employee.exit_date || endDate > employee.exit_date)
    ) {
      throw new BadRequestException(
        'Leave request dates cannot be after the employee exit date.',
      );
    }
  }

  private async findEmployeeIdByMembership(
    companyId: number,
    companyMembershipId: number,
  ): Promise<number | null> {
    const entry = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('employee.company_user_id = :companyMembershipId', {
        companyMembershipId,
      })
      .andWhere('membership.company_id = :companyId', { companyId })
      .select('employee.id', 'id')
      .getRawOne<{ id: number }>();

    return entry ? Number(entry.id) : null;
  }

  private async resolveActorEmployeeIdOrFail(
    companyId: number,
    actor: AuthenticatedUser,
  ): Promise<number> {
    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company membership is required');
    }

    const actorEmployeeId = await this.findEmployeeIdByMembership(
      companyId,
      actor.companyMembershipId,
    );

    if (!actorEmployeeId) {
      throw new NotFoundException('Employee not found');
    }

    return actorEmployeeId;
  }

  private async findActorEmployeeGender(
    companyId: number,
    actor: AuthenticatedUser,
  ): Promise<string | null> {
    if (!actor.companyMembershipId) {
      return null;
    }
    const employeeId = await this.findEmployeeIdByMembership(
      companyId,
      actor.companyMembershipId,
    );
    if (!employeeId) {
      return null;
    }
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
      select: { id: true, gender: true },
    });
    return employee?.gender?.trim().toLowerCase() || null;
  }

  private async resolveScopedEmployeeId(
    companyId: number,
    requestedEmployeeId: number | undefined,
    actor: AuthenticatedUser,
  ): Promise<number | null> {
    if (typeof requestedEmployeeId === 'number') {
      return requestedEmployeeId;
    }

    if (this.hrAccessService.hasCompanyScope(actor)) {
      return null;
    }

    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company membership is required');
    }

    const actorEmployeeId = await this.findEmployeeIdByMembership(
      companyId,
      actor.companyMembershipId,
    );

    if (!actorEmployeeId) {
      throw new ForbiddenException(
        'Employee profile not found for current user',
      );
    }

    return actorEmployeeId;
  }

  private async assertCanAccessEmployeeById(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const isOwnEmployee =
      typeof actor.companyMembershipId === 'number' &&
      employee.company_user_id === actor.companyMembershipId;

    if (isOwnEmployee) {
      return;
    }

    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
  }

  private actorHasAnyPermission(
    actor: AuthenticatedUser,
    permissions: string[],
  ): boolean {
    return hasAnyPermission(actor.permissions, permissions);
  }

  private actorCanManageLeaveBalances(actor: AuthenticatedUser): boolean {
    return (
      this.hrAccessService.hasCompanyScope(actor) ||
      this.actorHasAnyPermission(actor, [
        'leave_balances:manage',
        'leave_balances:adjust-manually',
        'leave_balances:generate',
        'leave_balances:carry-forward',
      ])
    );
  }

  private async findReportingLineEmployeeIds(
    managerId: number,
    companyId: number,
  ): Promise<number[]> {
    const seen = new Set<number>();
    const queue = [managerId];

    while (queue.length) {
      const currentManagerId = queue.shift()!;
      const directReports = await this.employeeRepository.find({
        where: { reports_to: currentManagerId, company_id: companyId },
        select: { id: true },
      });

      for (const employee of directReports) {
        if (seen.has(employee.id)) {
          continue;
        }

        seen.add(employee.id);
        queue.push(employee.id);
      }
    }

    return Array.from(seen);
  }

  private async resolveLeaveBalanceEmployeeIds(
    companyId: number,
    requestedEmployeeId: number | undefined,
    actor: AuthenticatedUser,
  ): Promise<number[] | null> {
    if (typeof requestedEmployeeId === 'number') {
      await this.assertCanAccessEmployeeById(
        companyId,
        requestedEmployeeId,
        actor,
      );
      return [requestedEmployeeId];
    }

    if (this.actorCanManageLeaveBalances(actor)) {
      return null;
    }

    const actorEmployeeId = await this.resolveActorEmployeeIdOrFail(
      companyId,
      actor,
    );
    await this.findEmployeeOrFail(companyId, actorEmployeeId);
    const scopedEmployeeIds = new Set<number>([actorEmployeeId]);

    if (
      this.actorHasAnyPermission(actor, [
        'leave_balances:list',
        'leave_balances:read',
      ])
    ) {
      const branchIds =
        (await this.hrAccessService.getAccessibleBranchIds(actor)) ?? [];

      const normalizedBranchIds = Array.from(new Set(branchIds));
      if (normalizedBranchIds.length) {
        // Scoped by employee.company_id so employees without a login
        // account are included like everyone else.
        const branchEmployees = await this.employeeRepository.find({
          where: {
            primary_branch_id: In(normalizedBranchIds),
            company_id: companyId,
          },
          select: { id: true },
        });
        branchEmployees.forEach((item) => scopedEmployeeIds.add(item.id));
      }

      const accessibleDepartmentIds =
        (await this.hrAccessService.getAccessibleDepartmentIds(actor)) ?? [];

      if (accessibleDepartmentIds.length) {
        const departmentEmployees = await this.employeeRepository
          .createQueryBuilder('employee')
          .leftJoin('employee.department_assignments', 'departmentAssignment')
          .where('employee.company_id = :companyId', { companyId })
          .andWhere(
            '(employee.primary_department_id IN (:...departmentIds) OR departmentAssignment.department_id IN (:...departmentIds))',
            {
              departmentIds: accessibleDepartmentIds,
            },
          )
          .select('employee.id', 'id')
          .getRawMany<{ id: number }>();

        departmentEmployees.forEach((item) => {
          scopedEmployeeIds.add(Number(item.id));
        });
      }

      if (
        actor.roles.includes('DEPARTMENT_MANAGER') ||
        actor.roles.includes('BRANCH_MANAGER') ||
        actor.permissions.includes('team_attendance:read')
      ) {
        const reportingLineIds = await this.findReportingLineEmployeeIds(
          actorEmployeeId,
          companyId,
        );
        reportingLineIds.forEach((id) => scopedEmployeeIds.add(id));
      }
    }

    return Array.from(scopedEmployeeIds);
  }

  private async findLeaveTypeOrFail(
    companyId: number,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<LeaveType> {
    const repository =
      manager?.getRepository(LeaveType) ?? this.leaveTypeRepository;
    const leaveType = await repository.findOne({
      where: {
        id: leaveTypeId,
        company_id: companyId,
      },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    return leaveType;
  }

  private mapHolidayRecord(item: AttendanceHoliday) {
    return {
      id: item.id,
      company_id: item.companyId,
      name: item.name,
      holiday_date: item.date,
      is_recurring: item.isRecurring,
      branch_id: item.branchId ?? null,
      branch_name: item.branch?.name ?? null,
      /** Branch holidays are managed under Attendance > Holidays. */
      editable_here: item.branchId == null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private async ensureSharedHolidayGroup(
    companyId: number,
  ): Promise<HolidayGroup> {
    const existing = await this.holidayGroupRepository.findOne({
      where: {
        companyId,
        name: 'General Holidays',
      },
    });

    if (existing) {
      return existing;
    }

    return this.holidayGroupRepository.save(
      this.holidayGroupRepository.create({
        companyId,
        name: 'General Holidays',
        description: 'Shared holiday definitions used by leave and attendance.',
      }),
    );
  }

  private getLeaveNumberSequenceRepository(
    manager?: EntityManager,
  ): Repository<LeaveNumberSequence> {
    return (
      manager?.getRepository(LeaveNumberSequence) ??
      this.leaveNumberSequenceRepository
    );
  }

  private async generateLeaveNo(
    companyId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = this.getLeaveNumberSequenceRepository(manager);
    const year = new Date().getUTCFullYear();
    const prefix = `LV-${year}-`;

    let sequence = await repository
      .createQueryBuilder('sequence')
      .setLock('pessimistic_write')
      .where('sequence.company_id = :companyId', { companyId })
      .andWhere('sequence.sequence_year = :year', { year })
      .getOne();

    if (!sequence) {
      try {
        sequence = await repository.save(
          repository.create({
            company_id: companyId,
            sequence_year: year,
            next_number: 2,
          }),
        );

        return `${prefix}${String(1).padStart(6, '0')}`;
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }

        sequence = await repository
          .createQueryBuilder('sequence')
          .setLock('pessimistic_write')
          .where('sequence.company_id = :companyId', { companyId })
          .andWhere('sequence.sequence_year = :year', { year })
          .getOneOrFail();
      }
    }

    const sequenceNumber = sequence.next_number;
    sequence.next_number += 1;
    await repository.save(sequence);

    return `${prefix}${String(sequenceNumber).padStart(6, '0')}`;
  }

  private async calculateLeaveDuration(params: {
    companyId: number;
    employee: Employee;
    policy: LeavePolicy | null;
    durationType: LeaveDurationTypeEnum;
    startDate: string;
    endDate: string;
    halfDaySession?: LeaveHalfDaySessionEnum | null;
    startTime?: string | null;
    endTime?: string | null;
    /** Used to apply the leave type's sandwich rule. */
    leaveTypeId?: number;
  }) {
    const durationType = params.durationType ?? LeaveDurationTypeEnum.FULL_DAY;

    if (durationType === LeaveDurationTypeEnum.HALF_DAY) {
      if (params.startDate !== params.endDate) {
        throw new BadRequestException(
          'Half-day leave must start and end on the same date.',
        );
      }

      if (!params.halfDaySession) {
        throw new BadRequestException(
          'half_day_session is required for half-day leave.',
        );
      }
    }

    if (durationType === LeaveDurationTypeEnum.SHORT_LEAVE) {
      if (params.startDate !== params.endDate) {
        throw new BadRequestException(
          'Short leave must start and end on the same date.',
        );
      }

      if (!params.startTime || !params.endTime) {
        throw new BadRequestException(
          'start_time and end_time are required for short leave.',
        );
      }
    }

    const sandwichRule = params.leaveTypeId
      ? ((
          await this.leaveTypeRepository.findOne({
            where: { id: params.leaveTypeId, company_id: params.companyId },
            select: ['id', 'sandwich_rule'],
          })
        )?.sandwich_rule ?? false)
      : false;

    return this.leaveDurationCalculatorService.calculate({
      companyId: params.companyId,
      employee: params.employee,
      policy: params.policy,
      durationType,
      startDate: params.startDate,
      endDate: params.endDate,
      startTime: params.startTime ?? undefined,
      endTime: params.endTime ?? undefined,
      sandwichRule,
    });
  }

  private async validateNoOverlap(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
    ignoreRequestId?: number,
    manager?: EntityManager,
  ): Promise<void> {
    const qb = (
      manager?.getRepository(LeaveRequest) ?? this.leaveRequestRepository
    )
      .createQueryBuilder('leaveRequest')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
          LeaveStatusEnum.IN_REVIEW,
          LeaveStatusEnum.RETURNED_FOR_CORRECTION,
          LeaveStatusEnum.APPROVED,
        ],
      })
      .andWhere('leaveRequest.start_date <= :endDate', { endDate })
      .andWhere('leaveRequest.end_date >= :startDate', { startDate });

    if (ignoreRequestId) {
      qb.andWhere('leaveRequest.id != :ignoreRequestId', { ignoreRequestId });
    }

    const overlap = await qb.getOne();
    if (overlap) {
      throw new ConflictException(
        `Leave request overlaps with existing request ${overlap.leave_no}`,
      );
    }
  }

  private calculateServiceMonths(hireDate?: string | null): number {
    if (!hireDate) {
      return 0;
    }
    const hire = new Date(`${hireDate}T00:00:00.000Z`);
    const today = new Date();

    let months =
      (today.getUTCFullYear() - hire.getUTCFullYear()) * 12 +
      (today.getUTCMonth() - hire.getUTCMonth());
    if (today.getUTCDate() < hire.getUTCDate()) {
      months -= 1;
    }
    return Math.max(0, months);
  }

  private async resolvePolicyContext(
    companyId: number,
    employee: Employee,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<PolicyContext> {
    const selected = await this.leaveBalanceService.resolvePolicyAssignment(
      companyId,
      employee,
      leaveTypeId,
      manager,
    );

    if (!selected) {
      return {
        policy: null,
        accrual: null,
        allowNegativeBalance: false,
        maxConsecutiveDays: null,
        minServiceMonths: 0,
        requiresApproval: true,
        maxPerRequestDays: null,
      };
    }

    return {
      policy: selected.policy,
      accrual: this.leaveBalanceService.effectiveAccrual(selected),
      allowNegativeBalance: selected.policy.allow_negative_balance,
      maxConsecutiveDays: selected.policy.max_consecutive_days,
      minServiceMonths: selected.policy.min_service_months,
      requiresApproval: selected.policyType.requires_approval,
      maxPerRequestDays: this.leaveBalanceService.toNumber(
        selected.policyType.max_per_request_days,
      )
        ? this.leaveBalanceService.toNumber(
            selected.policyType.max_per_request_days,
          )
        : null,
    };
  }

  private getAttendanceRecalculationJobRepository(
    manager?: EntityManager,
  ): Repository<AttendanceRecalculationJob> {
    return (
      manager?.getRepository(AttendanceRecalculationJob) ??
      this.attendanceRecalculationJobRepository
    );
  }

  private async queueAttendanceRecalculationForLeaveWindow(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
    reason: string,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getAttendanceRecalculationJobRepository(manager).save(
      this.getAttendanceRecalculationJobRepository(manager).create({
        companyId,
        employeeId,
        dateFrom: startDate,
        dateTo: endDate,
        reason,
        status: AttendanceProcessingJobStatusEnum.PENDING,
        attempts: 0,
        requestedByCompanyUserId: actor.companyMembershipId ?? null,
        metadata: {
          source: 'leave',
        },
      }),
    );
  }

  private async submitLeaveRequestRecord(
    companyId: number,
    leaveRequest: LeaveRequest,
    employee: Employee,
    policyContext: PolicyContext,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    // Serialize submissions per employee so two concurrent requests cannot
    // both pass the overlap check before either is saved.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `leave-submit:${companyId}:${leaveRequest.employee_id}`,
    ]);
    await this.validateNoOverlap(
      companyId,
      leaveRequest.employee_id,
      normalizeDateInput(leaveRequest.start_date, 'start_date'),
      normalizeDateInput(leaveRequest.end_date, 'end_date'),
      leaveRequest.id,
      manager,
    );

    const repository = manager.getRepository(LeaveRequest);
    const leaveType = await manager.getRepository(LeaveType).findOne({
      where: { id: leaveRequest.leave_type_id, company_id: companyId },
    });
    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }
    const evidenceRequired =
      leaveRequest.evidence_required ??
      isEvidenceRequiredFor(
        leaveType,
        this.leaveBalanceService.toNumber(leaveRequest.total_days),
      );
    if (evidenceRequired) {
      const evidence = await manager.getRepository(LeaveDocument).findOne({
        where: { leave_request_id: leaveRequest.id },
        select: ['id'],
      });
      // Business rule (2026-11-18): the attachment is optional when the
      // leave is applied for and must be uploaded to close the leave: it is
      // due at the end of the leave plus the type's grace days (default 3).
      // Reminders and the overdue flag come from LeaveEvidenceCronService.
      if (evidence) leaveRequest.evidence_received_at ??= new Date();
      if (!evidence && !leaveRequest.evidence_due_at) {
        leaveRequest.evidence_due_at = evidenceDueAtLeaveEnd(
          String(leaveRequest.end_date),
          leaveType.attachment_grace_days,
        );
      }
    }
    leaveRequest.evidence_required = evidenceRequired;
    const totalDays = this.leaveBalanceService.toNumber(
      leaveRequest.total_days,
    );
    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      leaveRequest.start_date,
    );
    const yearOf = await this.balanceYearMapper(
      companyId,
      leaveRequest.employee_id,
      leaveRequest.leave_type_id,
    );
    const balanceYears = Array.isArray(
      (leaveRequest.calculation_snapshot as { included_dates?: unknown } | null)
        ?.included_dates,
    )
      ? [
          ...new Set(
            (
              leaveRequest.calculation_snapshot as { included_dates: string[] }
            ).included_dates.map(yearOf),
          ),
        ].sort()
      : [yearOf(String(leaveRequest.start_date))];
    const balances: LeaveBalance[] = [];
    for (const year of balanceYears) {
      balances.push(
        ...(await this.leaveBalanceService.ensureBalancesForEmployeeYear(
          companyId,
          employee,
          year,
          manager,
          leaveRequest.leave_type_id,
          true,
        )),
      );
    }

    this.assertWithinAccruedEntitlement(
      balances,
      leaveRequest,
      totalDays,
      fiscalYear,
      employee,
      policyContext,
    );

    const effectiveDate = new Date().toISOString().slice(0, 10);
    const cycle = leaveRequest.approval_cycle;
    await this.leaveBalanceLedgerService.reserveLeaveByYear(
      balances,
      {
        companyId,
        employeeId: employee.id,
        leaveTypeId: leaveRequest.leave_type_id,
        leaveYear: fiscalYear,
        effectiveDate,
        days: totalDays,
        allowNegativeBalance: policyContext.allowNegativeBalance,
        leaveRequestId: leaveRequest.id,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        reason: 'Leave request submitted and days reserved',
        metadata: {
          leave_request_status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          calculation_snapshot: leaveRequest.calculation_snapshot,
        },
        idempotencyKey: `leave-request:${leaveRequest.id}:cycle:${cycle}:reserve`,
      },
      manager,
    );

    leaveRequest.current_approval_level = 0;
    leaveRequest.routing_required = false;
    leaveRequest.applied_at = new Date();
    leaveRequest.rejection_reason = null;
    leaveRequest.cancelled_at = null;
    leaveRequest.approved_at = null;
    leaveRequest.returned_at = null;
    leaveRequest.return_reason = null;
    if (this.leaveStatutoryService) {
      // Statutory family-leave limits block submission; sick-leave pay
      // stages are recorded for payroll (full/partial/unpaid days).
      const issues = await this.leaveStatutoryService.familyLeaveIssues(
        companyId,
        employee,
        leaveRequest.leave_type_id,
        {
          id: leaveRequest.id,
          start_date: String(leaveRequest.start_date).slice(0, 10),
          total_days: this.leaveBalanceService.toNumber(
            leaveRequest.total_days,
          ),
          event_date: leaveRequest.event_date,
        },
        manager,
      );
      if (issues.length) throw new BadRequestException(issues.join(' '));
      leaveRequest.pay_breakdown =
        await this.leaveStatutoryService.sickPayBreakdown(
          companyId,
          employee,
          leaveRequest.leave_type_id,
          leaveRequest,
          manager,
        );
    }
    await repository.save(leaveRequest);

    if (policyContext.requiresApproval) {
      // initializeWorkflowForRequest sets the post-submit status/current_approval_level
      await this.leaveWorkflowService.initializeWorkflowForRequest(
        companyId,
        leaveRequest,
        employee,
        manager,
      );
      return;
    }

    leaveRequest.status = LeaveStatusEnum.APPROVED;
    leaveRequest.approved_at = new Date();
    leaveRequest.current_approval_level = 0;
    await repository.save(leaveRequest);
    await this.leaveBalanceLedgerService.consumeReservedLeaveByYear(
      balances,
      {
        companyId,
        employeeId: employee.id,
        leaveTypeId: leaveRequest.leave_type_id,
        leaveYear: fiscalYear,
        effectiveDate: leaveRequest.approved_at.toISOString().slice(0, 10),
        days: totalDays,
        leaveRequestId: leaveRequest.id,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        reason: 'Leave request auto-approved and reserved days consumed',
        metadata: {
          leave_request_status: LeaveStatusEnum.APPROVED,
          calculation_snapshot: leaveRequest.calculation_snapshot,
        },
        idempotencyKey: `leave-request:${leaveRequest.id}:cycle:${cycle}:approve`,
      },
      manager,
    );
    await this.queueAttendanceRecalculationForLeaveWindow(
      companyId,
      employee.id,
      leaveRequest.start_date,
      leaveRequest.end_date,
      'Leave request auto-approved',
      actor,
      manager,
    );
  }

  private mapLeaveType(entity: LeaveType) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      code: entity.code,
      description: entity.description,
      is_paid: entity.is_paid,
      requires_attachment: entity.requires_attachment,
      allow_deferred_attachment: entity.allow_deferred_attachment,
      attachment_grace_days: entity.attachment_grace_days,
      attachment_required_after_days: entity.attachment_required_after_days,
      auto_approve_after_days: entity.auto_approve_after_days,
      is_carry_forward_allowed: entity.is_carry_forward_allowed,
      sandwich_rule: entity.sandwich_rule,
      max_carry_forward_days: entity.max_carry_forward_days,
      max_days_per_year: entity.max_days_per_year,
      comp_off_enabled: entity.comp_off_enabled,
      comp_off_expiry_days: entity.comp_off_expiry_days,
      comp_off_requires_approval: entity.comp_off_requires_approval,
      gender_restriction: entity.gender_restriction,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  private mapLeavePolicy(entity: LeavePolicy) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      description: entity.description,
      applicable_branch_id: entity.applicable_branch_id,
      applicable_department_id: entity.applicable_department_id,
      applicable_position_id: entity.applicable_position_id,
      applicable_grade_id: entity.applicable_grade_id,
      applicable_employment_type: entity.applicable_employment_type,
      applicable_confirmation_status: entity.applicable_confirmation_status,
      accrual_method: entity.accrual_method,
      accrual_rate: entity.accrual_rate,
      max_consecutive_days: entity.max_consecutive_days,
      min_service_months: entity.min_service_months,
      allow_during_probation: entity.allow_during_probation,
      allow_negative_balance: entity.allow_negative_balance,
      weekly_off_treatment: entity.weekly_off_treatment,
      holiday_treatment: entity.holiday_treatment,
      allow_half_day: entity.allow_half_day,
      allow_short_leave: entity.allow_short_leave,
      minimum_short_leave_minutes: entity.minimum_short_leave_minutes,
      maximum_short_leave_minutes: entity.maximum_short_leave_minutes,
      minimum_notice_days: entity.minimum_notice_days,
      maximum_backdate_days: entity.maximum_backdate_days,
      cancellation_requires_approval: entity.cancellation_requires_approval,
      cancellation_cutoff_days: entity.cancellation_cutoff_days,
      maximum_accumulation_days: entity.maximum_accumulation_days,
      priority: entity.priority,
      attendance_balance_deduction_enabled:
        entity.attendance_balance_deduction_enabled,
      absent_day_deduction_days: entity.absent_day_deduction_days,
      unpaid_leave_day_deduction_days: entity.unpaid_leave_day_deduction_days,
      half_day_deduction_days: entity.half_day_deduction_days,
      status: entity.status,
      policy_key: entity.policy_key,
      version_no: entity.version_no,
      lifecycle_status: entity.lifecycle_status,
      effective_from: entity.effective_from,
      effective_to: entity.effective_to,
      change_reason: entity.change_reason,
      supersedes_policy_id: entity.supersedes_policy_id,
      created_by_company_user_id: entity.created_by_company_user_id,
      submitted_by_company_user_id: entity.submitted_by_company_user_id,
      approved_by_company_user_id: entity.approved_by_company_user_id,
      approved_at: entity.approved_at,
      leave_year_type: entity.leave_year_type,
      leave_year_start_month: entity.leave_year_start_month,
      leave_year_start_day: entity.leave_year_start_day,
      rollover_execution_mode: entity.rollover_execution_mode,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      leave_types:
        entity.leave_types?.map((entry) => ({
          id: entry.id,
          leave_type_id: entry.leave_type_id,
          annual_quota_days: entry.annual_quota_days,
          max_per_request_days: entry.max_per_request_days,
          requires_approval: entry.requires_approval,
          encashment_enabled: entry.encashment_enabled,
          maximum_encashment_days: entry.maximum_encashment_days,
          encashment_rate_divisor: entry.encashment_rate_divisor,
          minimum_balance_after_encashment:
            entry.minimum_balance_after_encashment,
          encashment_requires_approval: entry.encashment_requires_approval,
          maximum_accumulation_days: entry.maximum_accumulation_days,
          accrual_method: entry.accrual_method,
          accrual_start_basis: entry.accrual_start_basis,
          accrual_timing: entry.accrual_timing,
          accrual_prorate: entry.accrual_prorate,
          carry_forward_enabled: entry.carry_forward_enabled,
          carry_forward_max_days: entry.carry_forward_max_days,
          carry_forward_expiry_months: entry.carry_forward_expiry_months,
          carry_forward_expiry_date: entry.carry_forward_expiry_date,
          carry_forward_auto_expire: entry.carry_forward_auto_expire,
          carry_forward_consume_first: entry.carry_forward_consume_first,
          carry_forward_method: entry.carry_forward_method,
          carry_forward_percentage: entry.carry_forward_percentage,
          lapse_enabled: entry.lapse_enabled,
          protected_minimum_days: entry.protected_minimum_days,
          auto_encash_enabled: entry.auto_encash_enabled,
          auto_encash_method: entry.auto_encash_method,
          auto_encash_max_days: entry.auto_encash_max_days,
          auto_encash_percentage: entry.auto_encash_percentage,
          encashment_salary_basis: entry.encashment_salary_basis,
        })) ?? [],
    };
  }

  private mapLeaveWorkflow(entity: LeaveApprovalWorkflow) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      leave_type_id: entity.leave_type_id,
      is_default: entity.is_default,
      reminder_after_days: entity.reminder_after_days,
      escalate_after_days: entity.escalate_after_days,
      max_escalations: entity.max_escalations,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      steps: entity.steps?.map((step) => this.mapLeaveWorkflowStep(step)) ?? [],
    };
  }

  private mapLeaveWorkflowStep(entity: LeaveApprovalWorkflowStep) {
    return {
      id: entity.id,
      workflow_id: entity.workflow_id,
      approval_level: entity.approval_level,
      assigned_branch_id: entity.assigned_branch_id,
      assigned_department_id: entity.assigned_department_id,
      approver_type: entity.approver_type,
      role_id: entity.role_id,
      position_id: entity.position_id,
      company_user_id: entity.company_user_id,
      action_type: entity.action_type,
      is_required: entity.is_required,
      created_at: entity.created_at,
    };
  }

  private mapLeaveBalance(entity: LeaveBalance) {
    const remainingDays = this.leaveBalanceService
      .calculateAvailableDays(entity)
      .toFixed(2);

    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      leave_type_id: entity.leave_type_id,
      fiscal_year: entity.fiscal_year,
      allocated_days: entity.allocated_days,
      opening_balance_days: entity.opening_balance_days,
      entitlement_days: entity.entitlement_days,
      accrued_days: entity.accrued_days,
      used_days: entity.used_days,
      pending_days: entity.pending_days,
      approved_future_days: entity.approved_future_days,
      carried_forward_days: entity.carried_forward_days,
      expired_days: entity.expired_days,
      adjusted_days: entity.adjusted_days,
      attendance_deduction_days: entity.attendance_deduction_days,
      available_days: remainingDays,
      remaining_days: remainingDays,
      generated_at: entity.generated_at,
      leave_year_start_date: entity.leave_year_start_date,
      leave_year_end_date: entity.leave_year_end_date,
      last_transaction_id: entity.last_transaction_id,
      version: entity.version,
      updated_at: entity.updated_at,
    };
  }

  private mapLeaveBalanceForEmployeeGroup(entity: LeaveBalance) {
    const remainingDays = this.leaveBalanceService
      .calculateAvailableDays(entity)
      .toFixed(2);

    return {
      id: entity.id,
      leave_type_id: entity.leave_type_id,
      leave_type: entity.leave_type
        ? {
            id: entity.leave_type.id,
            name: entity.leave_type.name,
            code: entity.leave_type.code,
          }
        : null,
      leave_type_name: entity.leave_type?.name ?? null,
      fiscal_year: entity.fiscal_year,
      allocated_days: entity.allocated_days,
      opening_balance_days: entity.opening_balance_days,
      entitlement_days: entity.entitlement_days,
      accrued_days: entity.accrued_days,
      used_days: entity.used_days,
      pending_days: entity.pending_days,
      approved_future_days: entity.approved_future_days,
      carried_forward_days: entity.carried_forward_days,
      expired_days: entity.expired_days,
      adjusted_days: entity.adjusted_days,
      attendance_deduction_days: entity.attendance_deduction_days,
      available_days: remainingDays,
      remaining_days: remainingDays,
      generated_at: entity.generated_at,
      leave_year_start_date: entity.leave_year_start_date,
      leave_year_end_date: entity.leave_year_end_date,
      last_transaction_id: entity.last_transaction_id,
      version: entity.version,
      updated_at: entity.updated_at,
    };
  }

  private mapEmployeeSummaryForLeaveBalances(employee: Employee) {
    return {
      id: employee.id,
      employee_number: employee.employee_no,
      first_name: employee.first_name,
      middle_name: employee.middle_name,
      last_name: employee.last_name,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      department: employee.primary_department
        ? {
            id: employee.primary_department.id,
            name: employee.primary_department.name,
          }
        : null,
      position: employee.primary_position
        ? {
            id: employee.primary_position.id,
            name: employee.primary_position.name,
          }
        : null,
      branch: employee.primary_branch
        ? { id: employee.primary_branch.id, name: employee.primary_branch.name }
        : null,
    };
  }

  private mapLeaveBalanceAdjustment(entity: LeaveBalanceAdjustment) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      leave_balance_id: entity.leave_balance_id,
      employee_id: entity.employee_id,
      leave_type_id: entity.leave_type_id,
      fiscal_year: entity.fiscal_year,
      old_balance_days: entity.old_balance_days,
      new_balance_days: entity.new_balance_days,
      adjustment_amount_days: entity.adjustment_amount_days,
      reason: entity.reason,
      source: entity.source,
      adjustment_direction:
        Number(entity.adjustment_amount_days) >= 0 ? 'INCREASE' : 'DECREASE',
      leave_balance_transaction_id: entity.leave_balance_transaction_id ?? null,
      import_batch_id: entity.import_batch?.batch_ref ?? null,
      reference: entity.reference ?? null,
      adjusted_at: entity.adjusted_at,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
          }
        : null,
      leave_type: entity.leave_type
        ? {
            id: entity.leave_type.id,
            name: entity.leave_type.name,
            code: entity.leave_type.code,
          }
        : null,
      adjusted_by: entity.adjusted_by_company_user?.user
        ? {
            id: entity.adjusted_by_company_user.user.id,
            first_name: entity.adjusted_by_company_user.user.first_name,
            last_name: entity.adjusted_by_company_user.user.last_name,
            email: entity.adjusted_by_company_user.user.email,
          }
        : null,
    };
  }

  private mapLeaveBalanceTransaction(entity: LeaveBalanceTransaction) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      leave_type_id: entity.leave_type_id,
      leave_balance_id: entity.leave_balance_id,
      leave_request_id: entity.leave_request_id,
      transaction_type: entity.transaction_type,
      leave_year: entity.leave_year,
      effective_date: entity.effective_date,
      previous_balance_days: entity.previous_balance_days,
      amount_days: entity.amount_days,
      new_balance_days: entity.new_balance_days,
      previous_pending_days: entity.previous_pending_days,
      pending_delta_days: entity.pending_delta_days,
      new_pending_days: entity.new_pending_days,
      previous_used_days: entity.previous_used_days,
      used_delta_days: entity.used_delta_days,
      new_used_days: entity.new_used_days,
      reason: entity.reason,
      idempotency_key: entity.idempotency_key,
      metadata: entity.metadata,
      is_reversal: entity.is_reversal,
      reversed_transaction_id: entity.reversed_transaction_id,
      created_at: entity.created_at,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
          }
        : null,
      leave_type: entity.leave_type
        ? {
            id: entity.leave_type.id,
            code: entity.leave_type.code,
            name: entity.leave_type.name,
          }
        : null,
      leave_request: entity.leave_request
        ? {
            id: entity.leave_request.id,
            leave_no: entity.leave_request.leave_no,
            status: entity.leave_request.status,
          }
        : null,
      created_by: entity.created_by_company_user?.user
        ? {
            id: entity.created_by_company_user.user.id,
            first_name: entity.created_by_company_user.user.first_name,
            last_name: entity.created_by_company_user.user.last_name,
            email: entity.created_by_company_user.user.email,
          }
        : null,
    };
  }

  /**
   * Clinical details (diagnosis, doctor, hospital, certificate link) are
   * confidential: only the employee and HR with company-wide scope or the
   * leave override permission see them. Managers and delegates approving the
   * request still see that medical details exist and the treatment dates.
   */
  private canViewClinicalDetail(
    actor: AuthenticatedUser,
    employee: Pick<Employee, 'id' | 'company_user_id'> | null | undefined,
  ): boolean {
    if (!employee) return false;
    if (actor.employeeId && actor.employeeId === employee.id) return true;
    if (
      typeof actor.companyMembershipId === 'number' &&
      employee.company_user_id === actor.companyMembershipId
    )
      return true;
    return (
      // Same rule as HrAccessService.hasCompanyScope, checked directly.
      hasPermission(actor.permissions, 'data_scope:company') ||
      hasPermission(actor.permissions, 'leave_requests:override')
    );
  }

  /**
   * True when the viewer is an approver whose level has been reached: an
   * assignment at or below the active level of the current cycle, or any
   * decision they already recorded. Assignments at later levels do not count,
   * so a future-level approver cannot open the request through a direct link.
   */
  private isReachedApprover(
    request: LeaveRequest,
    actor: AuthenticatedUser,
  ): boolean {
    const membershipId = actor.companyMembershipId;
    if (typeof membershipId !== 'number') return false;
    return (request.approvals ?? []).some(
      (approval) =>
        approval.approver_company_user_id === membershipId &&
        // Skipped rows also get acted_at, so only real decisions count.
        (DECIDED_APPROVAL_STATUSES.includes(approval.status) ||
          (approval.approval_cycle === request.approval_cycle &&
            approval.approval_level <= request.current_approval_level)),
    );
  }

  /**
   * Where the request stands in its approval sequence (current cycle only).
   * Sequence comes from the routing snapshot; older requests fall back to the
   * levels that have approval rows.
   */
  private buildApprovalProgress(entity: LeaveRequest) {
    const cycleApprovals = (entity.approvals ?? []).filter(
      (approval) => approval.approval_cycle === entity.approval_cycle,
    );
    const recorded = (
      entity.workflow_snapshot as { approval_sequence?: unknown } | null
    )?.approval_sequence;
    const levels =
      Array.isArray(recorded) && recorded.length
        ? recorded.map(Number)
        : [...new Set(cycleApprovals.map((a) => a.approval_level))].sort(
            (a, b) => a - b,
          );
    const approvedLevels = levels.filter((level) =>
      cycleApprovals.some(
        (a) =>
          a.approval_level === level &&
          a.status === LeaveApprovalStatusEnum.APPROVED,
      ),
    );
    const rejected = cycleApprovals.find(
      (a) => a.status === LeaveApprovalStatusEnum.REJECTED,
    );
    const currentIndex = levels.indexOf(entity.current_approval_level);
    const awaiting = LEAVE_AWAITING_DECISION_STATUSES.includes(entity.status);
    return {
      total_levels: levels.length,
      completed_levels: approvedLevels.length,
      current_level: awaiting ? entity.current_approval_level : null,
      current_position: awaiting && currentIndex >= 0 ? currentIndex + 1 : null,
      rejected_at_level: rejected ? rejected.approval_level : null,
      rejected_at_position: rejected
        ? levels.indexOf(rejected.approval_level) + 1 || null
        : null,
      state:
        entity.status === LeaveStatusEnum.APPROVED
          ? 'approved'
          : entity.status === LeaveStatusEnum.REJECTED
            ? 'rejected'
            : entity.status === LeaveStatusEnum.CANCELLED
              ? 'cancelled'
              : entity.status === LeaveStatusEnum.DRAFT
                ? 'draft'
                : entity.status === LeaveStatusEnum.RETURNED_FOR_CORRECTION
                  ? 'returned'
                  : 'pending',
    };
  }

  private mapLeaveRequest(entity: LeaveRequest, viewer?: AuthenticatedUser) {
    const showClinical =
      !viewer || this.canViewClinicalDetail(viewer, entity.employee);
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      leave_type_id: entity.leave_type_id,
      leave_no: entity.leave_no,
      start_date: entity.start_date,
      end_date: entity.end_date,
      duration_type: entity.duration_type,
      half_day_session: entity.half_day_session,
      start_time: entity.start_time,
      end_time: entity.end_time,
      requested_minutes: entity.requested_minutes,
      total_days: entity.total_days,
      calculation_snapshot: entity.calculation_snapshot,
      calculation_hash: entity.calculation_hash,
      calculation_version: entity.calculation_version,
      reason: entity.reason,
      current_approval_level: entity.current_approval_level,
      approval_cycle: entity.approval_cycle,
      approval_progress: this.buildApprovalProgress(entity),
      workflow_version: entity.workflow_version,
      workflow_snapshot: entity.workflow_snapshot,
      routing_required: entity.routing_required,
      evidence_status: evidenceStatus(entity),
      evidence_due_at: entity.evidence_due_at,
      evidence_received_at: entity.evidence_received_at,
      status: entity.status,
      rejection_reason: entity.rejection_reason,
      notice_override_reason: entity.notice_override_reason ?? null,
      notice_overridden_at: entity.notice_overridden_at ?? null,
      notice_overridden_by_company_user_id:
        entity.notice_overridden_by_company_user_id ?? null,
      event_date: entity.event_date ?? null,
      pay_breakdown: entity.pay_breakdown ?? null,
      returned_at: entity.returned_at,
      return_reason: entity.return_reason,
      applied_at: entity.applied_at,
      approved_at: entity.approved_at,
      cancelled_at: entity.cancelled_at,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      version: entity.version,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
            primary_department: entity.employee.primary_department
              ? {
                  id: entity.employee.primary_department.id,
                  name: entity.employee.primary_department.name,
                }
              : null,
            position: entity.employee.primary_position
              ? {
                  id: entity.employee.primary_position.id,
                  name: entity.employee.primary_position.name,
                }
              : null,
            primary_branch: entity.employee.primary_branch
              ? {
                  id: entity.employee.primary_branch.id,
                  name: entity.employee.primary_branch.name,
                }
              : null,
          }
        : null,
      leave_type: entity.leave_type
        ? {
            id: entity.leave_type.id,
            name: entity.leave_type.name,
            code: entity.leave_type.code,
          }
        : null,
      approvals:
        entity.approvals?.map((approval) => ({
          id: approval.id,
          workflow_step_id: approval.workflow_step_id,
          approval_level: approval.approval_level,
          approval_cycle: approval.approval_cycle,
          approver_company_user_id: approval.approver_company_user_id,
          status: approval.status,
          comments: approval.comments,
          signature_url: approval.signature_url,
          acted_at: approval.acted_at,
          approver: approval.approver?.user
            ? {
                id: approval.approver.user.id,
                first_name: approval.approver.user.first_name,
                last_name: approval.approver.user.last_name,
                email: approval.approver.user.email,
              }
            : null,
          workflow_step: approval.workflow_step
            ? {
                id: approval.workflow_step.id,
                action_type: approval.workflow_step.action_type,
                approver_type: approval.workflow_step.approver_type,
              }
            : null,
        })) ?? [],
      medical_detail: entity.medical_detail
        ? {
            id: entity.medical_detail.id,
            sickness_nature: showClinical
              ? entity.medical_detail.sickness_nature
              : null,
            doctor_name: showClinical
              ? entity.medical_detail.doctor_name
              : null,
            doctor_phone: showClinical
              ? entity.medical_detail.doctor_phone
              : null,
            hospital_name: showClinical
              ? entity.medical_detail.hospital_name
              : null,
            treatment_start_date: entity.medical_detail.treatment_start_date,
            treatment_end_date: entity.medical_detail.treatment_end_date,
            attachment_url: showClinical
              ? entity.medical_detail.attachment_url
              : null,
            redacted: !showClinical,
          }
        : null,
      documents:
        entity.documents?.map((document) => ({
          id: document.id,
          file_url:
            `/api/leave/requests/${entity.id}` +
            `/documents/${document.id}/download`,
          file_name: document.file_name,
          file_type: document.file_type,
          uploaded_at: document.uploaded_at,
          uploaded_by: document.uploaded_by?.user
            ? {
                id: document.uploaded_by.user.id,
                first_name: document.uploaded_by.user.first_name,
                last_name: document.uploaded_by.user.last_name,
              }
            : null,
        })) ?? [],
    };
  }

  async createLeaveType(
    companyId: number,
    dto: CreateLeaveTypeDto,
    actor: AuthenticatedUser,
  ) {
    const buildEntity = (code: string) =>
      this.leaveTypeRepository.create({
        company_id: companyId,
        name: dto.name.trim(),
        code,
        description: this.normalizeOptionalString(dto.description),
        is_paid: dto.is_paid ?? true,
        requires_attachment: dto.requires_attachment ?? false,
        allow_deferred_attachment: dto.allow_deferred_attachment ?? false,
        attachment_grace_days: dto.attachment_grace_days ?? 3,
        attachment_required_after_days:
          dto.attachment_required_after_days ?? null,
        auto_approve_after_days: dto.auto_approve_after_days ?? null,
        is_carry_forward_allowed: dto.is_carry_forward_allowed ?? false,
        sandwich_rule: dto.sandwich_rule ?? false,
        max_carry_forward_days:
          dto.max_carry_forward_days === null
            ? null
            : this.leaveBalanceService.toDecimal(
                dto.max_carry_forward_days ?? 0,
              ),
        max_days_per_year: this.leaveBalanceService.toDecimal(
          dto.max_days_per_year ?? 0,
        ),
        comp_off_enabled: dto.comp_off_enabled ?? false,
        comp_off_expiry_days: dto.comp_off_expiry_days ?? null,
        comp_off_requires_approval: dto.comp_off_requires_approval ?? true,
        gender_restriction:
          dto.gender_restriction ?? LeaveGenderRestrictionEnum.ANY,
        status: dto.status ?? LeaveRecordStatusEnum.ACTIVE,
      });

    // The short code is always server-generated and unique per company. The
    // UQ_leave_type_company_code constraint backs this; retry if a concurrent
    // create took the same code between our check and the insert.
    let leaveType: LeaveType | undefined;
    for (let attempt = 0; attempt < 5 && !leaveType; attempt += 1) {
      const code = await this.generateUniqueLeaveTypeCode(companyId, dto.name);
      try {
        leaveType = await this.leaveTypeRepository.save(buildEntity(code));
      } catch (error) {
        if (!this.isUniqueViolation(error) || attempt === 4) throw error;
      }
    }
    if (!leaveType) {
      throw new ConflictException(
        'Could not generate a unique leave type code',
      );
    }

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_type.created',
      entity_name: 'leave_type',
      entity_id: leaveType.id,
      actor,
      payload: this.mapLeaveType(leaveType),
    });

    return this.mapLeaveType(leaveType);
  }

  async findAllLeaveTypes(
    companyId: number,
    query: LeaveTypeQueryDto,
    actor?: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
    } = query;
    const qb = this.leaveTypeRepository
      .createQueryBuilder('leaveType')
      .where('leaveType.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('leaveType.status = :status', { status: status.trim() });
    }
    if (search?.trim()) {
      qb.andWhere('(leaveType.name LIKE :term OR leaveType.code LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }
    // Leave type managers see the full catalog; everyone else only sees types
    // their gender is eligible for.
    if (actor && !hasAnyPermission(actor.permissions, ['leave_types:update'])) {
      const gender = await this.findActorEmployeeGender(companyId, actor);
      // Mirrors isEmployeeEligibleForLeaveType: no recorded gender means no filter.
      if (gender) {
        qb.andWhere(
          '(leaveType.gender_restriction IS NULL OR leaveType.gender_restriction IN (:...allowedGenders))',
          { allowedGenders: [LeaveGenderRestrictionEnum.ANY, gender] },
        );
      }
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
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
      .orderBy(`leaveType.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapLeaveType(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneLeaveType(companyId: number, leaveTypeId: number) {
    return this.mapLeaveType(
      await this.findLeaveTypeOrFail(companyId, leaveTypeId),
    );
  }

  async updateLeaveType(
    companyId: number,
    leaveTypeId: number,
    dto: UpdateLeaveTypeDto,
    actor: AuthenticatedUser,
  ) {
    const leaveType = await this.findLeaveTypeOrFail(companyId, leaveTypeId);

    // The short code is server-owned and stays fixed after creation (reports and
    // imports reference it), so any client-sent `code` is ignored.
    if (dto.name !== undefined) leaveType.name = dto.name.trim();
    if (dto.description !== undefined) {
      leaveType.description = this.normalizeOptionalString(dto.description);
    }
    if (dto.is_paid !== undefined) leaveType.is_paid = dto.is_paid;
    if (dto.allow_deferred_attachment !== undefined)
      leaveType.allow_deferred_attachment = dto.allow_deferred_attachment;
    if (dto.attachment_grace_days !== undefined)
      leaveType.attachment_grace_days = dto.attachment_grace_days;
    if (dto.attachment_required_after_days !== undefined)
      leaveType.attachment_required_after_days =
        dto.attachment_required_after_days;
    if (dto.auto_approve_after_days !== undefined)
      leaveType.auto_approve_after_days = dto.auto_approve_after_days;
    if (dto.requires_attachment !== undefined) {
      leaveType.requires_attachment = dto.requires_attachment;
    }
    if (dto.is_carry_forward_allowed !== undefined) {
      leaveType.is_carry_forward_allowed = dto.is_carry_forward_allowed;
    }
    if (dto.sandwich_rule !== undefined) {
      leaveType.sandwich_rule = dto.sandwich_rule;
    }
    if (dto.max_carry_forward_days !== undefined) {
      leaveType.max_carry_forward_days =
        dto.max_carry_forward_days === null
          ? null
          : this.leaveBalanceService.toDecimal(dto.max_carry_forward_days);
    }
    if (dto.max_days_per_year !== undefined) {
      leaveType.max_days_per_year = this.leaveBalanceService.toDecimal(
        dto.max_days_per_year,
      );
    }
    if (dto.comp_off_enabled !== undefined)
      leaveType.comp_off_enabled = dto.comp_off_enabled;
    if (dto.comp_off_expiry_days !== undefined)
      leaveType.comp_off_expiry_days = dto.comp_off_expiry_days;
    if (dto.comp_off_requires_approval !== undefined)
      leaveType.comp_off_requires_approval = dto.comp_off_requires_approval;
    if (dto.gender_restriction !== undefined) {
      leaveType.gender_restriction = dto.gender_restriction;
    }
    if (dto.status !== undefined) leaveType.status = dto.status;

    const saved = await this.leaveTypeRepository.save(leaveType);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_type.updated',
      entity_name: 'leave_type',
      entity_id: saved.id,
      actor,
      payload: this.mapLeaveType(saved),
    });

    return this.mapLeaveType(saved);
  }

  private deriveLeaveTypeCodeBase(name: string): string {
    const base = (name ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((part) => part && part !== 'LEAVE')
      .join('_')
      .slice(0, 40)
      .replace(/_+$/, '');
    return base || 'LEAVE';
  }

  private async generateUniqueLeaveTypeCode(
    companyId: number,
    name: string,
  ): Promise<string> {
    const base = this.deriveLeaveTypeCodeBase(name);
    const rows = await this.leaveTypeRepository
      .createQueryBuilder('leaveType')
      .select('leaveType.code', 'code')
      .where('leaveType.company_id = :companyId', { companyId })
      .andWhere('(leaveType.code = :base OR leaveType.code LIKE :prefix)', {
        base,
        prefix: `${base}\\_%`,
      })
      .getRawMany<{ code: string }>();
    const taken = new Set(rows.map((row) => String(row.code).toUpperCase()));
    if (!taken.has(base)) return base;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base}_${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  async removeLeaveType(
    companyId: number,
    leaveTypeId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveType = await this.findLeaveTypeOrFail(companyId, leaveTypeId);
    await this.leaveTypeRepository.remove(leaveType);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_type.deleted',
      entity_name: 'leave_type',
      entity_id: leaveTypeId,
      actor,
    });
    return { message: 'Leave type deleted successfully' };
  }

  private async validatePolicyReferences(
    companyId: number,
    values: {
      applicable_branch_id?: number;
      applicable_department_id?: number;
      applicable_position_id?: number;
      applicable_grade_id?: number;
    },
  ): Promise<void> {
    if (values.applicable_branch_id !== undefined) {
      if (values.applicable_branch_id) {
        const branch = await this.branchRepository.findOne({
          where: { id: values.applicable_branch_id, company_id: companyId },
        });
        if (!branch) {
          throw new NotFoundException('Applicable branch not found');
        }
      }
    }

    if (values.applicable_department_id !== undefined) {
      if (values.applicable_department_id) {
        const department = await this.departmentRepository.findOne({
          where: { id: values.applicable_department_id, company_id: companyId },
        });
        if (!department) {
          throw new NotFoundException('Applicable department not found');
        }
      }
    }

    if (values.applicable_position_id !== undefined) {
      if (values.applicable_position_id) {
        const position = await this.positionRepository.findOne({
          where: { id: values.applicable_position_id, company_id: companyId },
        });
        if (!position) {
          throw new NotFoundException('Applicable position not found');
        }
      }
    }

    if (values.applicable_grade_id !== undefined) {
      if (values.applicable_grade_id) {
        const grade = await this.employeeGradeRepository.findOne({
          where: { id: values.applicable_grade_id, company_id: companyId },
        });
        if (!grade) {
          throw new NotFoundException('Applicable grade not found');
        }
      }
    }
  }

  private async syncPolicyTypes(
    manager: EntityManager,
    policyId: number,
    companyId: number,
    entries: CreateLeavePolicyDto['leave_types'],
  ): Promise<void> {
    const leaveTypeIds = entries.map((entry) => entry.leave_type_id);
    const leaveTypes = await manager.getRepository(LeaveType).find({
      where: { id: In(leaveTypeIds), company_id: companyId },
      select: ['id'],
    });

    if (leaveTypes.length !== leaveTypeIds.length) {
      throw new NotFoundException(
        'One or more leave types are invalid for this policy',
      );
    }

    await manager
      .getRepository(LeavePolicyType)
      .delete({ policy_id: policyId });
    await manager.getRepository(LeavePolicyType).save(
      entries.map((entry) =>
        manager.getRepository(LeavePolicyType).create({
          policy_id: policyId,
          leave_type_id: entry.leave_type_id,
          annual_quota_days: this.leaveBalanceService.toDecimal(
            entry.annual_quota_days,
          ),
          max_per_request_days:
            entry.max_per_request_days !== undefined
              ? this.leaveBalanceService.toDecimal(entry.max_per_request_days)
              : null,
          requires_approval: entry.requires_approval ?? true,
          encashment_enabled: entry.encashment_enabled ?? false,
          maximum_encashment_days:
            entry.maximum_encashment_days !== undefined
              ? this.leaveBalanceService.toDecimal(
                  entry.maximum_encashment_days,
                )
              : null,
          encashment_rate_divisor:
            entry.encashment_rate_divisor !== undefined
              ? this.leaveBalanceService.toDecimal(
                  entry.encashment_rate_divisor,
                )
              : null,
          minimum_balance_after_encashment: this.leaveBalanceService.toDecimal(
            entry.minimum_balance_after_encashment ?? 0,
          ),
          encashment_requires_approval:
            entry.encashment_requires_approval ?? true,
          maximum_accumulation_days:
            entry.maximum_accumulation_days !== undefined
              ? this.leaveBalanceService.toDecimal(
                  entry.maximum_accumulation_days,
                )
              : null,
          accrual_method: entry.accrual_method ?? null,
          accrual_start_basis: entry.accrual_start_basis ?? 'hire_date',
          accrual_timing: entry.accrual_timing ?? 'in_advance',
          accrual_prorate: entry.accrual_prorate ?? false,
          carry_forward_enabled: entry.carry_forward_enabled ?? null,
          carry_forward_max_days:
            entry.carry_forward_max_days != null
              ? this.leaveBalanceService.toDecimal(entry.carry_forward_max_days)
              : null,
          carry_forward_expiry_months:
            entry.carry_forward_expiry_months ?? null,
          carry_forward_expiry_date: entry.carry_forward_expiry_date ?? null,
          carry_forward_auto_expire: entry.carry_forward_auto_expire ?? true,
          carry_forward_consume_first:
            entry.carry_forward_consume_first ?? true,
          carry_forward_method: entry.carry_forward_method ?? null,
          carry_forward_percentage:
            entry.carry_forward_percentage != null
              ? this.leaveBalanceService.toDecimal(
                  entry.carry_forward_percentage,
                )
              : null,
          lapse_enabled: entry.lapse_enabled ?? true,
          protected_minimum_days: this.leaveBalanceService.toDecimal(
            entry.protected_minimum_days ?? 0,
          ),
          auto_encash_enabled: entry.auto_encash_enabled ?? false,
          auto_encash_method: entry.auto_encash_method ?? null,
          auto_encash_max_days:
            entry.auto_encash_max_days != null
              ? this.leaveBalanceService.toDecimal(entry.auto_encash_max_days)
              : null,
          auto_encash_percentage:
            entry.auto_encash_percentage != null
              ? this.leaveBalanceService.toDecimal(entry.auto_encash_percentage)
              : null,
          encashment_salary_basis: entry.encashment_salary_basis ?? 'basic',
        }),
      ),
    );
  }

  async createLeavePolicy(
    companyId: number,
    dto: CreateLeavePolicyDto,
    actor: AuthenticatedUser,
  ) {
    await this.validatePolicyReferences(companyId, dto);

    const created = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicy);
      const policy = await repository.save(
        repository.create({
          company_id: companyId,
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          applicable_branch_id: dto.applicable_branch_id ?? null,
          applicable_department_id: dto.applicable_department_id ?? null,
          applicable_position_id: dto.applicable_position_id ?? null,
          applicable_grade_id: dto.applicable_grade_id ?? null,
          applicable_employment_type: this.normalizeOptionalString(
            dto.applicable_employment_type,
          ),
          applicable_confirmation_status: this.normalizeOptionalString(
            dto.applicable_confirmation_status,
          ),
          accrual_method: dto.accrual_method ?? LeaveAccrualMethodEnum.YEARLY,
          accrual_rate:
            dto.accrual_rate !== undefined
              ? this.leaveBalanceService.toDecimal(dto.accrual_rate)
              : null,
          max_consecutive_days: dto.max_consecutive_days ?? null,
          min_service_months: dto.min_service_months ?? 0,
          allow_during_probation: dto.allow_during_probation ?? true,
          allow_negative_balance: dto.allow_negative_balance ?? false,
          weekly_off_treatment:
            dto.weekly_off_treatment ?? LeaveDayTreatmentEnum.EMPLOYEE_SCHEDULE,
          holiday_treatment:
            dto.holiday_treatment ?? LeaveDayTreatmentEnum.EXCLUDE,
          allow_half_day: dto.allow_half_day ?? false,
          allow_short_leave: dto.allow_short_leave ?? false,
          minimum_short_leave_minutes: dto.minimum_short_leave_minutes ?? null,
          maximum_short_leave_minutes: dto.maximum_short_leave_minutes ?? null,
          minimum_notice_days: dto.minimum_notice_days ?? null,
          maximum_backdate_days: dto.maximum_backdate_days ?? 0,
          cancellation_requires_approval:
            dto.cancellation_requires_approval ?? false,
          cancellation_cutoff_days: dto.cancellation_cutoff_days ?? 0,
          maximum_accumulation_days:
            dto.maximum_accumulation_days !== undefined
              ? this.leaveBalanceService.toDecimal(
                  dto.maximum_accumulation_days,
                )
              : null,
          priority: dto.priority ?? 0,
          attendance_balance_deduction_enabled:
            dto.attendance_balance_deduction_enabled ?? false,
          absent_day_deduction_days: this.leaveBalanceService.toDecimal(
            dto.absent_day_deduction_days ?? 1,
          ),
          unpaid_leave_day_deduction_days: this.leaveBalanceService.toDecimal(
            dto.unpaid_leave_day_deduction_days ?? 1,
          ),
          half_day_deduction_days: this.leaveBalanceService.toDecimal(
            dto.half_day_deduction_days ?? 0.5,
          ),
          status: dto.status ?? LeaveRecordStatusEnum.ACTIVE,
          policy_key: `policy-${randomUUID()}`,
          version_no: 1,
          // A new policy is a draft only when asked; otherwise it applies
          // from effective_from (or always, as before versioning).
          lifecycle_status: dto.save_as_draft ? 'draft' : 'active',
          effective_from: dto.effective_from?.slice(0, 10) ?? null,
          change_reason: dto.change_reason?.trim() || null,
          created_by_company_user_id: actor.companyMembershipId ?? null,
          approved_by_company_user_id: dto.save_as_draft
            ? null
            : (actor.companyMembershipId ?? null),
          approved_at: dto.save_as_draft ? null : new Date(),
          leave_year_type: dto.leave_year_type ?? 'calendar',
          leave_year_start_month:
            dto.leave_year_type === 'custom'
              ? (dto.leave_year_start_month ?? null)
              : null,
          leave_year_start_day:
            dto.leave_year_type === 'custom'
              ? (dto.leave_year_start_day ?? null)
              : null,
          rollover_execution_mode:
            dto.rollover_execution_mode ?? 'manual_approval',
        }),
      );
      await this.syncPolicyTypes(
        manager,
        policy.id,
        companyId,
        dto.leave_types,
      );

      return repository.findOneOrFail({
        where: { id: policy.id },
        relations: { leave_types: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.created',
      entity_name: 'leave_policy',
      entity_id: created.id,
      actor,
      payload: this.mapLeavePolicy(created),
    });

    return this.mapLeavePolicy(created);
  }

  async findAllLeavePolicies(companyId: number, query: LeavePolicyQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
      applicable_department_id,
      applicable_position_id,
    } = query;

    const qb = this.leavePolicyRepository
      .createQueryBuilder('leavePolicy')
      .leftJoinAndSelect('leavePolicy.leave_types', 'leaveTypes')
      .where('leavePolicy.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('leavePolicy.status = :status', { status: status.trim() });
    }
    if (!query.include_history) {
      // Current versions (in effect today or scheduled) and open drafts.
      qb.andWhere(
        "(leavePolicy.lifecycle_status IN ('draft','pending_approval') OR (leavePolicy.lifecycle_status IN ('active','superseded') AND (leavePolicy.effective_to IS NULL OR leavePolicy.effective_to >= CURRENT_DATE)))",
      );
    }
    if (typeof applicable_department_id === 'number') {
      qb.andWhere('leavePolicy.applicable_department_id = :departmentId', {
        departmentId: applicable_department_id,
      });
    }
    if (typeof applicable_position_id === 'number') {
      qb.andWhere('leavePolicy.applicable_position_id = :positionId', {
        positionId: applicable_position_id,
      });
    }
    if (search?.trim()) {
      qb.andWhere(
        '(leavePolicy.name LIKE :term OR leavePolicy.description LIKE :term)',
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
      .orderBy(`leavePolicy.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapLeavePolicy(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneLeavePolicy(companyId: number, policyId: number) {
    const policy = await this.leavePolicyRepository.findOne({
      where: { id: policyId, company_id: companyId },
      relations: { leave_types: true },
    });
    if (!policy) {
      throw new NotFoundException('Leave policy not found');
    }
    return this.mapLeavePolicy(policy);
  }

  /** Copies the editable fields of a policy DTO onto a policy row. */
  private applyPolicyDto(policy: LeavePolicy, dto: UpdateLeavePolicyDto): void {
    if (dto.name !== undefined) policy.name = dto.name.trim();
    if (dto.description !== undefined) {
      policy.description = this.normalizeOptionalString(dto.description);
    }
    if (dto.applicable_branch_id !== undefined) {
      policy.applicable_branch_id = dto.applicable_branch_id ?? null;
    }
    if (dto.applicable_department_id !== undefined) {
      policy.applicable_department_id = dto.applicable_department_id ?? null;
    }
    if (dto.applicable_position_id !== undefined) {
      policy.applicable_position_id = dto.applicable_position_id ?? null;
    }
    if (dto.applicable_grade_id !== undefined) {
      policy.applicable_grade_id = dto.applicable_grade_id ?? null;
    }
    if (dto.applicable_employment_type !== undefined) {
      policy.applicable_employment_type = this.normalizeOptionalString(
        dto.applicable_employment_type,
      );
    }
    if (dto.applicable_confirmation_status !== undefined) {
      policy.applicable_confirmation_status = this.normalizeOptionalString(
        dto.applicable_confirmation_status,
      );
    }
    if (dto.accrual_method !== undefined)
      policy.accrual_method = dto.accrual_method;
    if (dto.accrual_rate !== undefined) {
      policy.accrual_rate =
        dto.accrual_rate === null
          ? null
          : this.leaveBalanceService.toDecimal(dto.accrual_rate);
    }
    if (dto.max_consecutive_days !== undefined) {
      policy.max_consecutive_days = dto.max_consecutive_days ?? null;
    }
    if (dto.min_service_months !== undefined) {
      policy.min_service_months = dto.min_service_months;
    }
    if (dto.allow_during_probation !== undefined) {
      policy.allow_during_probation = dto.allow_during_probation;
    }
    if (dto.allow_negative_balance !== undefined) {
      policy.allow_negative_balance = dto.allow_negative_balance;
    }
    if (dto.weekly_off_treatment !== undefined) {
      policy.weekly_off_treatment = dto.weekly_off_treatment;
    }
    if (dto.holiday_treatment !== undefined) {
      policy.holiday_treatment = dto.holiday_treatment;
    }
    if (dto.allow_half_day !== undefined) {
      policy.allow_half_day = dto.allow_half_day;
    }
    if (dto.allow_short_leave !== undefined) {
      policy.allow_short_leave = dto.allow_short_leave;
    }
    if (dto.minimum_short_leave_minutes !== undefined) {
      policy.minimum_short_leave_minutes =
        dto.minimum_short_leave_minutes ?? null;
    }
    if (dto.maximum_short_leave_minutes !== undefined) {
      policy.maximum_short_leave_minutes =
        dto.maximum_short_leave_minutes ?? null;
    }
    if (dto.minimum_notice_days !== undefined) {
      policy.minimum_notice_days = dto.minimum_notice_days ?? null;
    }
    if (dto.maximum_backdate_days !== undefined) {
      policy.maximum_backdate_days = dto.maximum_backdate_days;
    }
    if (dto.cancellation_requires_approval !== undefined) {
      policy.cancellation_requires_approval =
        dto.cancellation_requires_approval;
    }
    if (dto.cancellation_cutoff_days !== undefined) {
      policy.cancellation_cutoff_days = dto.cancellation_cutoff_days;
    }
    if (dto.maximum_accumulation_days !== undefined) {
      policy.maximum_accumulation_days =
        dto.maximum_accumulation_days === null
          ? null
          : this.leaveBalanceService.toDecimal(dto.maximum_accumulation_days);
    }
    if (dto.priority !== undefined) {
      policy.priority = dto.priority;
    }
    if (dto.attendance_balance_deduction_enabled !== undefined) {
      policy.attendance_balance_deduction_enabled =
        dto.attendance_balance_deduction_enabled;
    }
    if (dto.absent_day_deduction_days !== undefined) {
      policy.absent_day_deduction_days = this.leaveBalanceService.toDecimal(
        dto.absent_day_deduction_days,
      );
    }
    if (dto.unpaid_leave_day_deduction_days !== undefined) {
      policy.unpaid_leave_day_deduction_days =
        this.leaveBalanceService.toDecimal(dto.unpaid_leave_day_deduction_days);
    }
    if (dto.half_day_deduction_days !== undefined) {
      policy.half_day_deduction_days = this.leaveBalanceService.toDecimal(
        dto.half_day_deduction_days,
      );
    }
    if (dto.status !== undefined) policy.status = dto.status;
    if (dto.leave_year_type !== undefined) {
      policy.leave_year_type = dto.leave_year_type;
    }
    if (dto.leave_year_start_month !== undefined) {
      policy.leave_year_start_month = dto.leave_year_start_month ?? null;
    }
    if (dto.leave_year_start_day !== undefined) {
      policy.leave_year_start_day = dto.leave_year_start_day ?? null;
    }
    if (policy.leave_year_type !== 'custom') {
      policy.leave_year_start_month = null;
      policy.leave_year_start_day = null;
    }
    if (dto.rollover_execution_mode !== undefined) {
      policy.rollover_execution_mode = dto.rollover_execution_mode;
    }
  }

  async updateLeavePolicy(
    companyId: number,
    policyId: number,
    dto: UpdateLeavePolicyDto,
    actor: AuthenticatedUser,
  ) {
    await this.validatePolicyReferences(companyId, dto);
    const existing = await this.findPolicyVersionOrFail(companyId, policyId);
    if (['superseded', 'archived'].includes(existing.lifecycle_status)) {
      throw new BadRequestException(
        'Historical policy versions cannot be edited. Revise the current version instead.',
      );
    }
    // Changing an approved policy creates a new version instead of
    // rewriting the one past calculations used.
    if (
      existing.lifecycle_status === 'active' &&
      this.isVersionedPolicyChange(dto)
    ) {
      return this.revisePolicy(companyId, policyId, dto, actor);
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicy);
      const policy = await repository.findOne({
        where: { id: policyId, company_id: companyId },
      });
      if (!policy) {
        throw new NotFoundException('Leave policy not found');
      }

      this.applyPolicyDto(policy, dto);
      if (dto.change_reason !== undefined) {
        policy.change_reason = dto.change_reason?.trim() || null;
      }
      if (
        dto.effective_from !== undefined &&
        policy.lifecycle_status !== 'active'
      ) {
        policy.effective_from = dto.effective_from?.slice(0, 10) ?? null;
      }
      // Editing a submitted version sends it back to draft.
      if (policy.lifecycle_status === 'pending_approval') {
        policy.lifecycle_status = 'draft';
      }

      await repository.save(policy);
      if (dto.leave_types) {
        await this.syncPolicyTypes(
          manager,
          policy.id,
          companyId,
          dto.leave_types,
        );
      }

      return repository.findOneOrFail({
        where: { id: policy.id },
        relations: { leave_types: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.updated',
      entity_name: 'leave_policy',
      entity_id: updated.id,
      actor,
      payload: this.mapLeavePolicy(updated),
    });

    return this.mapLeavePolicy(updated);
  }

  // ---------------------------------------------------------------------
  // Policy versions: every change to an approved policy is a new version
  // row in the same lineage (policy_key). Old versions keep their dates and
  // stay available for historical calculations and audit.
  // ---------------------------------------------------------------------

  /** Whether a DTO changes behaviour (not just the on/off switch or notes). */
  private isVersionedPolicyChange(dto: UpdateLeavePolicyDto): boolean {
    const nonVersioned = new Set([
      'status',
      'change_reason',
      'save_as_draft',
      'effective_from',
    ]);
    return Object.entries(dto).some(
      ([key, value]) => value !== undefined && !nonVersioned.has(key),
    );
  }

  /** A stored policy-type row as an input DTO (to copy it into a new version). */
  private policyTypeRowToInput(
    row: LeavePolicyType,
  ): CreateLeavePolicyDto['leave_types'][number] {
    const num = (value: string | null | undefined) =>
      value === null || value === undefined ? undefined : Number(value);
    return {
      leave_type_id: row.leave_type_id,
      annual_quota_days: Number(row.annual_quota_days),
      max_per_request_days: num(row.max_per_request_days),
      requires_approval: row.requires_approval,
      encashment_enabled: row.encashment_enabled,
      maximum_encashment_days: num(row.maximum_encashment_days),
      encashment_rate_divisor: num(row.encashment_rate_divisor),
      minimum_balance_after_encashment: num(
        row.minimum_balance_after_encashment,
      ),
      encashment_requires_approval: row.encashment_requires_approval,
      maximum_accumulation_days: num(row.maximum_accumulation_days),
      accrual_method: row.accrual_method,
      accrual_start_basis: row.accrual_start_basis,
      accrual_timing: row.accrual_timing,
      accrual_prorate: row.accrual_prorate,
      carry_forward_enabled: row.carry_forward_enabled,
      carry_forward_max_days: num(row.carry_forward_max_days) ?? null,
      carry_forward_expiry_months: row.carry_forward_expiry_months,
      carry_forward_expiry_date: row.carry_forward_expiry_date,
      carry_forward_auto_expire: row.carry_forward_auto_expire,
      carry_forward_consume_first: row.carry_forward_consume_first,
      carry_forward_method: row.carry_forward_method,
      carry_forward_percentage: num(row.carry_forward_percentage) ?? null,
      lapse_enabled: row.lapse_enabled,
      protected_minimum_days: num(row.protected_minimum_days),
      auto_encash_enabled: row.auto_encash_enabled,
      auto_encash_method: row.auto_encash_method,
      auto_encash_max_days: num(row.auto_encash_max_days) ?? null,
      auto_encash_percentage: num(row.auto_encash_percentage) ?? null,
      encashment_salary_basis: row.encashment_salary_basis,
    };
  }

  private async findPolicyVersionOrFail(
    companyId: number,
    policyId: number,
    manager?: EntityManager,
  ): Promise<LeavePolicy> {
    const policy = await (
      manager?.getRepository(LeavePolicy) ?? this.leavePolicyRepository
    ).findOne({
      where: { id: policyId, company_id: companyId },
      relations: { leave_types: true },
    });
    if (!policy) throw new NotFoundException('Leave policy not found');
    return policy;
  }

  /**
   * Creates the next version of an approved policy with the requested
   * changes. Users who may approve activate it straight away (effective
   * today or on effective_from); others submit it for approval.
   */
  async revisePolicy(
    companyId: number,
    policyId: number,
    dto: UpdateLeavePolicyDto,
    actor: AuthenticatedUser,
  ) {
    await this.validatePolicyReferences(companyId, dto);
    const draft = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicy);
      const source = await this.findPolicyVersionOrFail(
        companyId,
        policyId,
        manager,
      );
      if (!['active', 'superseded'].includes(source.lifecycle_status)) {
        throw new BadRequestException(
          'Only an approved policy version can be revised; edit the draft instead.',
        );
      }
      const open = await repository.findOne({
        where: {
          company_id: companyId,
          policy_key: source.policy_key,
          lifecycle_status: In(['draft', 'pending_approval']),
        },
      });
      if (open) {
        throw new ConflictException(
          `Version ${open.version_no} of this policy is already ${open.lifecycle_status === 'draft' ? 'a draft' : 'awaiting approval'}. Finish or discard it first.`,
        );
      }
      const { max } = (await repository
        .createQueryBuilder('policy')
        .select('MAX(policy.version_no)', 'max')
        .where('policy.company_id = :companyId', { companyId })
        .andWhere('policy.policy_key = :key', { key: source.policy_key })
        .getRawOne<{ max: number | string | null }>()) ?? { max: null };
      const copy = repository.create({
        company_id: companyId,
        status: source.status,
        policy_key: source.policy_key,
        version_no: Number(max ?? source.version_no) + 1,
        lifecycle_status: 'draft',
        effective_from: dto.effective_from?.slice(0, 10) ?? null,
        effective_to: null,
        change_reason: dto.change_reason?.trim() || null,
        supersedes_policy_id: source.id,
        created_by_company_user_id: actor.companyMembershipId ?? null,
      });
      for (const field of VERSIONED_POLICY_FIELDS) {
        (copy as unknown as Record<string, unknown>)[field] = (
          source as unknown as Record<string, unknown>
        )[field];
      }
      this.applyPolicyDto(copy, dto);
      const entries =
        dto.leave_types ??
        source.leave_types.map((row) => this.policyTypeRowToInput(row));
      // A version that changes nothing would only add noise to the history.
      const changes = comparePolicyVersions(source, {
        ...copy,
        leave_types: entries as unknown as LeavePolicyType[],
      });
      if (!changes.length && !dto.effective_from) {
        throw new BadRequestException(
          'Nothing changed compared with the current version, so no new version was created.',
        );
      }
      const saved = await repository.save(copy);
      await this.syncPolicyTypes(manager, saved.id, companyId, entries);
      return this.findPolicyVersionOrFail(companyId, saved.id, manager);
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.version_created',
      entity_name: 'leave_policy',
      entity_id: draft.id,
      actor,
      payload: {
        policy_key: draft.policy_key,
        version_no: draft.version_no,
        supersedes_policy_id: draft.supersedes_policy_id,
        change_reason: draft.change_reason,
      },
    });
    if (dto.save_as_draft) return this.mapLeavePolicy(draft);
    if (hasPermission(actor.permissions, 'leave_policies:approve')) {
      return this.approvePolicyVersion(
        companyId,
        draft.id,
        {
          effective_from: dto.effective_from,
          change_reason: dto.change_reason,
        },
        actor,
      );
    }
    return this.submitPolicyVersion(companyId, draft.id, actor);
  }

  /** Draft → pending approval. */
  async submitPolicyVersion(
    companyId: number,
    policyId: number,
    actor: AuthenticatedUser,
  ) {
    const policy = await this.findPolicyVersionOrFail(companyId, policyId);
    if (policy.lifecycle_status !== 'draft') {
      throw new BadRequestException('Only a draft version can be submitted.');
    }
    policy.lifecycle_status = 'pending_approval';
    policy.submitted_by_company_user_id = actor.companyMembershipId ?? null;
    await this.leavePolicyRepository.save(policy);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.version_submitted',
      entity_name: 'leave_policy',
      entity_id: policy.id,
      actor,
      payload: { version_no: policy.version_no },
    });
    return this.mapLeavePolicy(policy);
  }

  /** Pending approval → draft, with the approver's comment. */
  async returnPolicyVersion(
    companyId: number,
    policyId: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    if (!hasPermission(actor.permissions, 'leave_policies:approve')) {
      throw new ForbiddenException(
        'Returning a policy version needs leave_policies:approve.',
      );
    }
    const policy = await this.findPolicyVersionOrFail(companyId, policyId);
    if (policy.lifecycle_status !== 'pending_approval') {
      throw new BadRequestException(
        'Only a version awaiting approval can be returned.',
      );
    }
    policy.lifecycle_status = 'draft';
    await this.leavePolicyRepository.save(policy);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.version_returned',
      entity_name: 'leave_policy',
      entity_id: policy.id,
      actor,
      payload: { version_no: policy.version_no, reason },
    });
    return this.mapLeavePolicy(policy);
  }

  /**
   * Approves a draft or submitted version and makes it effective from the
   * given date. The version it replaces ends the day before; a later-dated
   * version that never took effect is archived. Back-dating needs an
   * explicit allow_retroactive flag and a reason.
   */
  async approvePolicyVersion(
    companyId: number,
    policyId: number,
    dto: {
      effective_from?: string;
      change_reason?: string;
      allow_retroactive?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    if (!hasPermission(actor.permissions, 'leave_policies:approve')) {
      throw new ForbiddenException(
        'Approving a policy version needs leave_policies:approve.',
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    const approved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicy);
      const version = await repository.findOne({
        where: { id: policyId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) throw new NotFoundException('Leave policy not found');
      if (!['draft', 'pending_approval'].includes(version.lifecycle_status)) {
        throw new BadRequestException(
          'Only a draft or submitted version can be approved.',
        );
      }
      const from = (
        dto.effective_from ??
        version.effective_from ??
        today
      ).slice(0, 10);
      const reason = (dto.change_reason ?? version.change_reason ?? '').trim();
      if (from < today) {
        if (!dto.allow_retroactive) {
          throw new BadRequestException(
            `Effective date ${from} is in the past. Set allow_retroactive (with a reason) to apply a retroactive correction.`,
          );
        }
        if (reason.length < 5) {
          throw new BadRequestException(
            'A retroactive policy change needs a reason of at least 5 characters.',
          );
        }
      }
      const lineage = await repository.find({
        where: {
          company_id: companyId,
          policy_key: version.policy_key,
          lifecycle_status: In(['active', 'superseded']),
        },
        lock: { mode: 'pessimistic_write' },
      });
      for (const other of lineage) {
        const otherFrom = other.effective_from
          ? String(other.effective_from).slice(0, 10)
          : null;
        const otherTo = other.effective_to
          ? String(other.effective_to).slice(0, 10)
          : null;
        if (otherTo && otherTo < from) continue;
        if (otherFrom && otherFrom >= from) {
          // Never took effect before the new date: replaced entirely.
          other.lifecycle_status = 'archived';
        } else {
          other.effective_to = dayBefore(from);
          other.lifecycle_status = 'superseded';
        }
        await repository.save(other);
      }
      version.lifecycle_status = 'active';
      version.effective_from = from;
      version.effective_to = null;
      version.change_reason = reason || null;
      version.approved_by_company_user_id = actor.companyMembershipId ?? null;
      version.approved_at = new Date();
      await repository.save(version);
      return this.findPolicyVersionOrFail(companyId, version.id, manager);
    });
    const previous = approved.supersedes_policy_id
      ? await this.leavePolicyRepository.findOne({
          where: { id: approved.supersedes_policy_id, company_id: companyId },
          relations: { leave_types: true },
        })
      : null;
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.version_approved',
      entity_name: 'leave_policy',
      entity_id: approved.id,
      actor,
      payload: {
        version_no: approved.version_no,
        effective_from: approved.effective_from,
        change_reason: approved.change_reason,
        retroactive: (approved.effective_from ?? today) < today,
        changes: previous ? comparePolicyVersions(previous, approved) : [],
      },
    });
    // Bring current balances in line with the new version (closed years are
    // untouched). Runs after the response so a large company does not block.
    void this.leaveBalanceService
      .generateBalancesForCompany(companyId, today.slice(0, 4), {
        forceRecalculate: true,
        asOfDate: today,
      })
      .catch((error: unknown) =>
        this.logger.error(
          `Balance refresh after policy approval failed for company ${companyId}`,
          error instanceof Error ? error.stack : String(error),
        ),
      );
    return this.mapLeavePolicy(approved);
  }

  /** Discards a draft or submitted version (kept as archived for audit). */
  async discardPolicyVersion(
    companyId: number,
    policyId: number,
    actor: AuthenticatedUser,
  ) {
    const policy = await this.findPolicyVersionOrFail(companyId, policyId);
    if (!['draft', 'pending_approval'].includes(policy.lifecycle_status)) {
      throw new BadRequestException(
        'Only a draft or submitted version can be discarded; approved versions are history.',
      );
    }
    policy.lifecycle_status = 'archived';
    await this.leavePolicyRepository.save(policy);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.version_discarded',
      entity_name: 'leave_policy',
      entity_id: policy.id,
      actor,
      payload: { version_no: policy.version_no },
    });
    return this.mapLeavePolicy(policy);
  }

  /** Every version in a policy's lineage, newest first. */
  async listPolicyVersions(companyId: number, policyId: number) {
    const policy = await this.findPolicyVersionOrFail(companyId, policyId);
    const versions = await this.leavePolicyRepository.find({
      where: { company_id: companyId, policy_key: policy.policy_key },
      relations: { leave_types: true },
      order: { version_no: 'DESC' },
    });
    return {
      policy_key: policy.policy_key,
      data: versions.map((version) => this.mapLeavePolicy(version)),
    };
  }

  /** Field-by-field differences between two versions. */
  async comparePolicyVersionsById(
    companyId: number,
    fromId: number,
    toId: number,
  ) {
    const [from, to] = await Promise.all([
      this.findPolicyVersionOrFail(companyId, fromId),
      this.findPolicyVersionOrFail(companyId, toId),
    ]);
    const typeNames = new Map(
      (
        await this.leaveTypeRepository.find({
          where: { company_id: companyId },
          select: ['id', 'name'],
        })
      ).map((type) => [type.id, type.name]),
    );
    return {
      from: { id: from.id, version_no: from.version_no },
      to: { id: to.id, version_no: to.version_no },
      changes: comparePolicyVersions(from, to).map((change) => ({
        ...change,
        leave_type_name:
          change.leave_type_id !== undefined
            ? (typeNames.get(change.leave_type_id) ?? null)
            : null,
      })),
    };
  }

  /**
   * Who a version would affect and how, before it is approved: per employee
   * and leave type, the current and proposed entitlement, the current
   * balance, days a lower accumulation cap would cut, and statutory minimum
   * conflicts.
   */
  async policyImpactPreview(companyId: number, policyId: number) {
    const version = await this.findPolicyVersionOrFail(companyId, policyId);
    const today = new Date().toISOString().slice(0, 10);
    const asOf =
      version.effective_from && version.effective_from > today
        ? String(version.effective_from).slice(0, 10)
        : today;
    const current = await this.leaveBalanceService.findActivePolicies(
      companyId,
      undefined,
      today,
    );
    const proposed = [
      ...(
        await this.leaveBalanceService.findActivePolicies(
          companyId,
          undefined,
          asOf,
        )
      ).filter((policy) => policy.policy_key !== version.policy_key),
      { ...version, lifecycle_status: 'active' } as LeavePolicy,
    ];
    const employees = await this.employeeRepository.find({
      where: {
        company_id: companyId,
        employment_status: EmploymentStatusEnum.ACTIVE,
      },
    });
    const typeNames = new Map(
      (
        await this.leaveTypeRepository.find({
          where: { company_id: companyId },
          select: ['id', 'name'],
        })
      ).map((type) => [type.id, type.name]),
    );
    const typeIds = version.leave_types.map((row) => row.leave_type_id);
    const pick = (
      policies: LeavePolicy[],
      employee: Employee,
      typeId: number,
    ) => {
      try {
        return {
          assignment: this.leaveBalanceService.selectPolicyAssignment(
            policies,
            employee,
            typeId,
          ),
          conflict: null as string | null,
        };
      } catch (error) {
        return {
          assignment: null,
          conflict: error instanceof Error ? error.message : String(error),
        };
      }
    };
    const rows: Array<Record<string, unknown>> = [];
    for (const employee of employees) {
      for (const typeId of typeIds) {
        const before = pick(current, employee, typeId);
        const after = pick(proposed, employee, typeId);
        const touches =
          before.assignment?.policy.policy_key === version.policy_key ||
          after.assignment?.policy.policy_key === version.policy_key ||
          after.conflict;
        if (!touches) continue;
        const cycle = this.leaveBalanceService.cycleForDate(
          this.leaveBalanceService.effectiveAccrual(after.assignment),
          today,
          employee,
        );
        const balance = await this.leaveBalanceRepository.findOne({
          where: {
            employee_id: employee.id,
            leave_type_id: typeId,
            fiscal_year: cycle.label,
          },
        });
        const available = balance
          ? roundLeaveDays(calculateAvailableLeaveDays(balance))
          : null;
        const newCap = this.leaveBalanceService.maximumAccumulationDays(
          after.assignment,
        );
        const warnings: string[] = [];
        if (after.conflict) warnings.push(after.conflict);
        const capCut =
          newCap !== null && available !== null && available > newCap
            ? roundLeaveDays(available - newCap)
            : 0;
        if (capCut > 0) {
          warnings.push(
            `Balance ${available} exceeds the new maximum accumulation of ${newCap}; ${capCut} day(s) would need HR review before any reduction.`,
          );
        }
        const statutory = await this.statutoryMinimumWarning(
          companyId,
          employee,
          typeId,
          after.assignment?.annualQuotaDays ?? null,
          asOf,
        );
        if (statutory) warnings.push(statutory);
        rows.push({
          employee_id: employee.id,
          employee_no: employee.employee_no ?? null,
          employee_name: [employee.first_name, employee.last_name]
            .filter(Boolean)
            .join(' '),
          leave_type_id: typeId,
          leave_type_name: typeNames.get(typeId) ?? null,
          current_policy_id: before.assignment?.policy.id ?? null,
          current_policy_version: before.assignment?.policy.version_no ?? null,
          proposed_policy_id: after.assignment?.policy.id ?? null,
          proposed_policy_version: after.assignment?.policy.version_no ?? null,
          current_entitlement: before.assignment?.annualQuotaDays ?? null,
          proposed_entitlement: after.assignment?.annualQuotaDays ?? null,
          entitlement_change: roundLeaveDays(
            (after.assignment?.annualQuotaDays ?? 0) -
              (before.assignment?.annualQuotaDays ?? 0),
          ),
          current_available: available,
          proposed_maximum_accumulation: newCap,
          days_above_new_cap: capCut,
          warnings,
        });
      }
    }
    return {
      policy_id: version.id,
      version_no: version.version_no,
      effective_from: asOf,
      employees_affected: new Set(rows.map((row) => row.employee_id)).size,
      rows_with_warnings: rows.filter(
        (row) => (row.warnings as string[]).length > 0,
      ).length,
      data: rows,
    };
  }

  /**
   * Statutory minimum check used by impact previews (implemented with the
   * statutory rules service; null = no conflict or no active rule).
   */
  private async statutoryMinimumWarning(
    companyId: number,
    employee: Employee,
    leaveTypeId: number,
    proposedQuota: number | null,
    asOf: string,
  ): Promise<string | null> {
    if (!this.leaveStatutoryService || proposedQuota === null) return null;
    return this.leaveStatutoryService.entitlementWarning(
      companyId,
      employee,
      leaveTypeId,
      proposedQuota,
      asOf,
    );
  }

  async removeLeavePolicy(
    companyId: number,
    policyId: number,
    actor: AuthenticatedUser,
  ) {
    const policy = await this.leavePolicyRepository.findOne({
      where: { id: policyId, company_id: companyId },
    });
    if (!policy) {
      throw new NotFoundException('Leave policy not found');
    }

    await this.leavePolicyRepository.remove(policy);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.deleted',
      entity_name: 'leave_policy',
      entity_id: policyId,
      actor,
    });
    return { message: 'Leave policy deleted successfully' };
  }

  private validateWorkflowSteps(
    dto: CreateLeaveWorkflowDto | UpdateLeaveWorkflowDto,
  ): void {
    if (!dto.steps) {
      return;
    }
    const levels = dto.steps.map((step) => step.approval_level);
    const unique = new Set(levels);
    if (unique.size !== levels.length) {
      throw new BadRequestException('Workflow approval levels must be unique');
    }
    if (!levels.length || levels.some((level) => level < 1)) {
      throw new BadRequestException(
        'Leave workflows must contain one or more approval levels starting at level 1.',
      );
    }
    const sortedLevels = [...levels].sort((a, b) => a - b);
    if (sortedLevels.some((level, index) => level !== index + 1)) {
      throw new BadRequestException(
        'Leave workflow approval levels must be consecutive, starting at level 1.',
      );
    }
    if (!dto.steps.some((step) => step.is_required !== false)) {
      throw new BadRequestException(
        'A leave workflow must contain at least one required approval step.',
      );
    }
    // Routing (LeaveWorkflowService.resolveHrApproverMembershipIds) needs exactly
    // level 1 (department manager, resolved per employee) and level 2 (HR).
    if (sortedLevels.length !== 2) {
      throw new BadRequestException(
        'A leave workflow has exactly two steps: level 1 (department manager, resolved automatically) and level 2 (HR). Use management approval rules for a third approval.',
      );
    }
  }

  private async validateSupportedLeaveStep(
    companyId: number,
    step: {
      approval_level: number;
      approver_type: LeaveApproverTypeEnum;
      role_id?: number | null;
      assigned_branch_id?: number | null;
      assigned_department_id?: number | null;
      is_required?: boolean;
    },
  ): Promise<void> {
    if (!Number.isInteger(step.approval_level) || step.approval_level < 1) {
      throw new BadRequestException(
        'Leave approval levels must be positive whole numbers.',
      );
    }
    if (step.approval_level > 2) {
      throw new BadRequestException(
        'Leave workflows only have level 1 (department manager) and level 2 (HR). Use management approval rules for a third approval.',
      );
    }
    if (step.approval_level === 1) {
      const role = step.role_id
        ? await this.roleRepository.findOne({
            where: { id: step.role_id, company_id: companyId },
          })
        : null;
      if (
        step.approver_type !== LeaveApproverTypeEnum.ROLE ||
        role?.name !== 'DEPARTMENT_MANAGER' ||
        step.assigned_branch_id ||
        step.assigned_department_id
      ) {
        throw new BadRequestException(
          'Level 1 must use the DEPARTMENT_MANAGER role without branch or department filters. The employee manager is resolved from the employee department.',
        );
      }
    }
  }

  private async findLeaveWorkflowOrFail(
    companyId: number,
    workflowId: number,
    manager?: EntityManager,
  ): Promise<LeaveApprovalWorkflow> {
    const repository =
      manager?.getRepository(LeaveApprovalWorkflow) ??
      this.leaveApprovalWorkflowRepository;
    const workflow = await repository.findOne({
      where: { id: workflowId, company_id: companyId },
    });

    if (!workflow) {
      throw new NotFoundException('Leave workflow not found');
    }

    return workflow;
  }

  private async findLeaveWorkflowStepOrFail(
    workflowId: number,
    stepId: number,
    manager?: EntityManager,
  ): Promise<LeaveApprovalWorkflowStep> {
    const repository =
      manager?.getRepository(LeaveApprovalWorkflowStep) ??
      this.leaveApprovalWorkflowStepRepository;
    const step = await repository.findOne({
      where: {
        id: stepId,
        workflow_id: workflowId,
      },
    });

    if (!step) {
      throw new NotFoundException('Leave workflow step not found');
    }

    return step;
  }

  private async ensureWorkflowLevelIsUnique(
    workflowId: number,
    approvalLevel: number,
    exceptStepId?: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      manager?.getRepository(LeaveApprovalWorkflowStep) ??
      this.leaveApprovalWorkflowStepRepository;
    const existing = await repository.findOne({
      where: {
        workflow_id: workflowId,
        approval_level: approvalLevel,
      },
      select: ['id'],
    });

    if (existing && existing.id !== exceptStepId) {
      throw new ConflictException(
        `Approval level ${approvalLevel} already exists in this workflow`,
      );
    }
  }

  private async ensureWorkflowLevelIsNext(
    workflowId: number,
    approvalLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      manager?.getRepository(LeaveApprovalWorkflowStep) ??
      this.leaveApprovalWorkflowStepRepository;
    const existing = await repository.find({
      where: { workflow_id: workflowId },
      select: ['approval_level'],
    });
    const expectedLevel =
      existing.reduce(
        (maximum, step) => Math.max(maximum, step.approval_level),
        0,
      ) + 1;
    if (approvalLevel !== expectedLevel) {
      throw new BadRequestException(
        `The next workflow level must be ${expectedLevel}.`,
      );
    }
  }

  private async validateWorkflowStepReferences(
    companyId: number,
    step: {
      assigned_branch_id?: number | null;
      assigned_department_id?: number | null;
      role_id?: number | null;
      position_id?: number | null;
      company_user_id?: number | null;
    },
  ): Promise<void> {
    if (step.assigned_branch_id) {
      const branch = await this.branchRepository.findOne({
        where: {
          id: step.assigned_branch_id,
          company_id: companyId,
        },
      });
      if (!branch) {
        throw new NotFoundException(
          `Branch ${step.assigned_branch_id} is not available in this company`,
        );
      }
    }

    if (step.assigned_department_id) {
      const department = await this.departmentRepository.findOne({
        where: {
          id: step.assigned_department_id,
          company_id: companyId,
        },
      });
      if (!department) {
        throw new NotFoundException(
          `Department ${step.assigned_department_id} is not available in this company`,
        );
      }

      if (
        step.assigned_branch_id &&
        department.branch_id &&
        department.branch_id !== step.assigned_branch_id
      ) {
        throw new BadRequestException(
          `Department ${step.assigned_department_id} does not belong to branch ${step.assigned_branch_id}`,
        );
      }
    }

    if (step.role_id) {
      const role = await this.roleRepository.findOne({
        where: {
          id: step.role_id,
          company_id: companyId,
        },
      });
      if (!role) {
        throw new NotFoundException(
          `Role ${step.role_id} is not available in this company`,
        );
      }
    }

    if (step.position_id) {
      const position = await this.positionRepository.findOne({
        where: { id: step.position_id, company_id: companyId },
      });
      if (!position) {
        throw new NotFoundException(
          `Position ${step.position_id} is not available in this company`,
        );
      }

      if (
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

    if (step.company_user_id) {
      const membership = await this.companyUserRepository.findOne({
        where: {
          id: step.company_user_id,
          company_id: companyId,
        },
      });
      if (!membership) {
        throw new NotFoundException(
          `Company user ${step.company_user_id} is not available in this company`,
        );
      }
    }
  }

  private async validateWorkflowReferences(
    companyId: number,
    dto: CreateLeaveWorkflowDto | UpdateLeaveWorkflowDto,
  ): Promise<void> {
    if (dto.leave_type_id !== undefined && dto.leave_type_id !== null) {
      await this.findLeaveTypeOrFail(companyId, dto.leave_type_id);
    }

    for (const step of dto.steps ?? []) {
      await this.validateSupportedLeaveStep(companyId, step);
      await this.validateWorkflowStepReferences(companyId, step);
    }
  }

  async createLeaveWorkflow(
    companyId: number,
    dto: CreateLeaveWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.validateWorkflowSteps(dto);
    await this.validateWorkflowReferences(companyId, dto);

    const created = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = manager.getRepository(LeaveApprovalWorkflow);
      const stepRepository = manager.getRepository(LeaveApprovalWorkflowStep);

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
          leave_type_id: dto.leave_type_id ?? null,
          is_default: dto.is_default ?? false,
          reminder_after_days: dto.reminder_after_days ?? null,
          escalate_after_days: dto.escalate_after_days ?? null,
          max_escalations: dto.max_escalations ?? 1,
          status: dto.status ?? LeaveRecordStatusEnum.ACTIVE,
        }),
      );

      await stepRepository.save(
        dto.steps.map((step) =>
          stepRepository.create({
            workflow_id: workflow.id,
            approval_level: step.approval_level,
            assigned_branch_id: step.assigned_branch_id ?? null,
            assigned_department_id: step.assigned_department_id ?? null,
            approver_type: step.approver_type,
            role_id: step.role_id ?? null,
            position_id: step.position_id ?? null,
            company_user_id: step.company_user_id ?? null,
            action_type: step.action_type,
            is_required: step.is_required ?? true,
          }),
        ),
      );

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow.created',
      entity_name: 'leave_workflow',
      entity_id: created.id,
      actor,
      payload: this.mapLeaveWorkflow(created),
    });

    return this.mapLeaveWorkflow(created);
  }

  async findAllLeaveWorkflows(companyId: number, query: LeaveWorkflowQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
      leave_type_id,
    } = query;

    const qb = this.leaveApprovalWorkflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.steps', 'steps')
      .where('workflow.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('workflow.status = :status', { status: status.trim() });
    }
    if (typeof leave_type_id === 'number') {
      qb.andWhere('workflow.leave_type_id = :leaveTypeId', {
        leaveTypeId: leave_type_id,
      });
    }
    if (search?.trim()) {
      qb.andWhere('workflow.name LIKE :term', { term: `%${search.trim()}%` });
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
      data: items.map((item) => this.mapLeaveWorkflow(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneLeaveWorkflow(companyId: number, workflowId: number) {
    const workflow = await this.leaveApprovalWorkflowRepository.findOne({
      where: { id: workflowId, company_id: companyId },
      relations: { steps: true },
    });
    if (!workflow) {
      throw new NotFoundException('Leave workflow not found');
    }
    return this.mapLeaveWorkflow(workflow);
  }

  async updateLeaveWorkflow(
    companyId: number,
    workflowId: number,
    dto: UpdateLeaveWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.validateWorkflowSteps(dto);
    await this.validateWorkflowReferences(companyId, dto);

    const updated = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = manager.getRepository(LeaveApprovalWorkflow);
      const stepRepository = manager.getRepository(LeaveApprovalWorkflowStep);

      const workflow = await workflowRepository.findOne({
        where: { id: workflowId, company_id: companyId },
      });
      if (!workflow) {
        throw new NotFoundException('Leave workflow not found');
      }

      if (dto.is_default) {
        await workflowRepository.update(
          { company_id: companyId, is_default: true },
          { is_default: false },
        );
      }

      if (dto.name !== undefined) workflow.name = dto.name.trim();
      if (dto.leave_type_id !== undefined) {
        workflow.leave_type_id = dto.leave_type_id ?? null;
      }
      if (dto.is_default !== undefined) workflow.is_default = dto.is_default;
      if (dto.reminder_after_days !== undefined)
        workflow.reminder_after_days = dto.reminder_after_days ?? null;
      if (dto.escalate_after_days !== undefined)
        workflow.escalate_after_days = dto.escalate_after_days ?? null;
      if (dto.max_escalations !== undefined)
        workflow.max_escalations = dto.max_escalations;
      if (dto.status !== undefined) workflow.status = dto.status;

      await workflowRepository.save(workflow);

      if (dto.steps) {
        await stepRepository.delete({ workflow_id: workflow.id });
        await stepRepository.save(
          dto.steps.map((step) =>
            stepRepository.create({
              workflow_id: workflow.id,
              approval_level: step.approval_level,
              assigned_branch_id: step.assigned_branch_id ?? null,
              assigned_department_id: step.assigned_department_id ?? null,
              approver_type: step.approver_type,
              role_id: step.role_id ?? null,
              position_id: step.position_id ?? null,
              company_user_id: step.company_user_id ?? null,
              action_type: step.action_type,
              is_required: step.is_required ?? true,
            }),
          ),
        );
      }

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow.updated',
      entity_name: 'leave_workflow',
      entity_id: updated.id,
      actor,
      payload: this.mapLeaveWorkflow(updated),
    });

    return this.mapLeaveWorkflow(updated);
  }

  async removeLeaveWorkflow(
    companyId: number,
    workflowId: number,
    actor: AuthenticatedUser,
  ) {
    const workflow = await this.leaveApprovalWorkflowRepository.findOne({
      where: { id: workflowId, company_id: companyId },
    });
    if (!workflow) {
      throw new NotFoundException('Leave workflow not found');
    }

    await this.leaveApprovalWorkflowRepository.remove(workflow);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow.deleted',
      entity_name: 'leave_workflow',
      entity_id: workflowId,
      actor,
    });
    return { message: 'Leave workflow deleted successfully' };
  }

  async createLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    dto: CreateLeaveWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    await this.validateSupportedLeaveStep(companyId, dto);
    await this.findLeaveWorkflowOrFail(companyId, workflowId);

    const approverType = dto.approver_type;
    const stepPayload = {
      assigned_branch_id: dto.assigned_branch_id ?? null,
      assigned_department_id: dto.assigned_department_id ?? null,
      role_id:
        approverType === LeaveApproverTypeEnum.ROLE
          ? (dto.role_id ?? null)
          : null,
      position_id:
        approverType === LeaveApproverTypeEnum.POSITION
          ? (dto.position_id ?? null)
          : null,
      company_user_id:
        approverType === LeaveApproverTypeEnum.COMPANY_USER
          ? (dto.company_user_id ?? null)
          : null,
    };

    await this.validateWorkflowStepReferences(companyId, stepPayload);
    await this.ensureWorkflowLevelIsUnique(workflowId, dto.approval_level);
    await this.ensureWorkflowLevelIsNext(workflowId, dto.approval_level);

    const created = await this.dataSource.transaction(async (manager) => {
      await this.findLeaveWorkflowOrFail(companyId, workflowId, manager);
      await this.ensureWorkflowLevelIsUnique(
        workflowId,
        dto.approval_level,
        undefined,
        manager,
      );
      await this.ensureWorkflowLevelIsNext(
        workflowId,
        dto.approval_level,
        manager,
      );

      const repository = manager.getRepository(LeaveApprovalWorkflowStep);
      return repository.save(
        repository.create({
          workflow_id: workflowId,
          approval_level: dto.approval_level,
          assigned_branch_id: stepPayload.assigned_branch_id,
          assigned_department_id: stepPayload.assigned_department_id,
          approver_type: dto.approver_type,
          role_id: stepPayload.role_id,
          position_id: stepPayload.position_id,
          company_user_id: stepPayload.company_user_id,
          action_type: dto.action_type,
          is_required: dto.is_required ?? true,
        }),
      );
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow_step.created',
      entity_name: 'leave_workflow_step',
      entity_id: created.id,
      actor,
      payload: this.mapLeaveWorkflowStep(created),
    });

    return this.mapLeaveWorkflowStep(created);
  }

  async findAllLeaveWorkflowSteps(companyId: number, workflowId: number) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const steps = await this.leaveApprovalWorkflowStepRepository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    return {
      data: steps.map((step) => this.mapLeaveWorkflowStep(step)),
    };
  }

  async findOneLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
  ) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const step = await this.findLeaveWorkflowStepOrFail(workflowId, stepId);
    return this.mapLeaveWorkflowStep(step);
  }

  async updateLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    dto: UpdateLeaveWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const existing = await this.findLeaveWorkflowStepOrFail(workflowId, stepId);

    const nextApproverType = dto.approver_type ?? existing.approver_type;
    const nextPayload = {
      assigned_branch_id:
        dto.assigned_branch_id !== undefined
          ? (dto.assigned_branch_id ?? null)
          : existing.assigned_branch_id,
      assigned_department_id:
        dto.assigned_department_id !== undefined
          ? (dto.assigned_department_id ?? null)
          : existing.assigned_department_id,
      role_id:
        nextApproverType === LeaveApproverTypeEnum.ROLE
          ? dto.role_id !== undefined
            ? (dto.role_id ?? null)
            : dto.approver_type !== undefined
              ? null
              : existing.role_id
          : null,
      position_id:
        nextApproverType === LeaveApproverTypeEnum.POSITION
          ? dto.position_id !== undefined
            ? (dto.position_id ?? null)
            : dto.approver_type !== undefined
              ? null
              : existing.position_id
          : null,
      company_user_id:
        nextApproverType === LeaveApproverTypeEnum.COMPANY_USER
          ? dto.company_user_id !== undefined
            ? (dto.company_user_id ?? null)
            : dto.approver_type !== undefined
              ? null
              : existing.company_user_id
          : null,
    };

    if (dto.approval_level !== undefined) {
      await this.ensureWorkflowLevelIsUnique(
        workflowId,
        dto.approval_level,
        stepId,
      );
    }
    await this.validateSupportedLeaveStep(companyId, {
      ...nextPayload,
      approval_level: dto.approval_level ?? existing.approval_level,
      approver_type: nextApproverType,
      is_required: dto.is_required ?? existing.is_required,
    });
    if (
      dto.approval_level !== undefined &&
      dto.approval_level !== existing.approval_level
    ) {
      throw new BadRequestException(
        'Leave approval levels cannot be reordered.',
      );
    }
    if (
      dto.is_required === false &&
      existing.is_required &&
      !(await this.leaveApprovalWorkflowStepRepository.findOne({
        where: {
          workflow_id: workflowId,
          id: Not(stepId),
          is_required: true,
        },
        select: ['id'],
      }))
    ) {
      throw new BadRequestException(
        'A leave workflow must retain at least one required approval step.',
      );
    }
    await this.validateWorkflowStepReferences(companyId, nextPayload);

    const updated = await this.dataSource.transaction(async (manager) => {
      await this.findLeaveWorkflowOrFail(companyId, workflowId, manager);
      const step = await this.findLeaveWorkflowStepOrFail(
        workflowId,
        stepId,
        manager,
      );

      if (dto.approval_level !== undefined) {
        await this.ensureWorkflowLevelIsUnique(
          workflowId,
          dto.approval_level,
          stepId,
          manager,
        );
        step.approval_level = dto.approval_level;
      }

      if (dto.assigned_branch_id !== undefined) {
        step.assigned_branch_id = nextPayload.assigned_branch_id;
      }
      if (dto.assigned_department_id !== undefined) {
        step.assigned_department_id = nextPayload.assigned_department_id;
      }
      if (dto.approver_type !== undefined) {
        step.approver_type = nextApproverType;
      }
      if (dto.action_type !== undefined) {
        step.action_type = dto.action_type;
      }
      if (dto.is_required !== undefined) {
        step.is_required = dto.is_required;
      }

      step.role_id = nextPayload.role_id;
      step.position_id = nextPayload.position_id;
      step.company_user_id = nextPayload.company_user_id;

      return manager.getRepository(LeaveApprovalWorkflowStep).save(step);
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow_step.updated',
      entity_name: 'leave_workflow_step',
      entity_id: updated.id,
      actor,
      payload: this.mapLeaveWorkflowStep(updated),
    });

    return this.mapLeaveWorkflowStep(updated);
  }

  async removeLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    actor: AuthenticatedUser,
  ) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const step = await this.findLeaveWorkflowStepOrFail(workflowId, stepId);

    if (step.approval_level === 1) {
      throw new BadRequestException(
        'The first workflow level cannot be removed. Update its approver configuration instead.',
      );
    }
    const laterStep = await this.leaveApprovalWorkflowStepRepository.findOne({
      where: {
        workflow_id: workflowId,
        approval_level: MoreThan(step.approval_level),
      },
      select: ['id'],
    });
    if (laterStep) {
      throw new BadRequestException(
        'Remove later workflow levels first to keep approval levels consecutive.',
      );
    }

    await this.leaveApprovalWorkflowStepRepository.remove(step);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow_step.deleted',
      entity_name: 'leave_workflow_step',
      entity_id: step.id,
      actor,
      payload: this.mapLeaveWorkflowStep(step),
    });

    return { message: 'Leave workflow step deleted successfully' };
  }

  async createHoliday(
    companyId: number,
    dto: CreateHolidayDto,
    actor: AuthenticatedUser,
  ) {
    const holidayGroup = await this.ensureSharedHolidayGroup(companyId);

    const existing = await this.attendanceHolidayRepository.findOne({
      where: {
        companyId,
        branchId: IsNull(),
        name: dto.name.trim(),
        date: dto.holiday_date,
      },
    });
    if (existing) {
      throw new ConflictException('Holiday already exists');
    }

    const holiday = await this.attendanceHolidayRepository.save(
      this.attendanceHolidayRepository.create({
        companyId,
        holidayGroupId: holidayGroup.id,
        name: dto.name.trim(),
        date: dto.holiday_date,
        isRecurring: dto.is_recurring ?? false,
        type: AttendanceHolidayTypeEnum.COMPANY,
        isPaid: true,
        affectsOvertime: false,
        countsAsWorkingDay: false,
        branchId: null,
      }),
    );

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'holiday.created',
      entity_name: 'holiday',
      entity_id: holiday.id,
      actor,
    });

    return this.mapHolidayRecord(holiday);
  }

  async findAllHolidays(companyId: number, query: HolidayQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'holiday_date',
      sortOrder,
      from_date,
      to_date,
    } = query;

    const qb = this.attendanceHolidayRepository
      .createQueryBuilder('holiday')
      .leftJoinAndSelect('holiday.branch', 'branch')
      .where('holiday.company_id = :companyId', { companyId });

    if (from_date) {
      qb.andWhere('holiday.date >= :fromDate', { fromDate: from_date });
    }
    if (to_date) {
      qb.andWhere('holiday.date <= :toDate', { toDate: to_date });
    }

    const sortFields = new Map([
      ['id', 'id'],
      ['name', 'name'],
      ['holiday_date', 'date'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ]);
    const sortField = sortFields.get(sortBy) ?? 'date';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;
    qb.orderBy(`holiday.${sortField}`, direction);
    if (sortField !== 'id') qb.addOrderBy('holiday.id', 'ASC');
    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data: items.map((item) => this.mapHolidayRecord(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async updateHoliday(
    companyId: number,
    holidayId: number,
    dto: UpdateHolidayDto,
    actor: AuthenticatedUser,
  ) {
    const holiday = await this.attendanceHolidayRepository.findOne({
      where: { id: holidayId, companyId, branchId: IsNull() },
    });
    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }

    const nextName = dto.name?.trim() ?? holiday.name;
    const nextDate = dto.holiday_date ?? holiday.date;
    const duplicate = await this.attendanceHolidayRepository.findOne({
      where: {
        companyId,
        branchId: IsNull(),
        name: nextName,
        date: nextDate,
      },
    });
    if (duplicate && duplicate.id !== holiday.id) {
      throw new ConflictException('Holiday already exists');
    }

    holiday.name = nextName;
    holiday.date = nextDate;
    if (dto.is_recurring !== undefined) holiday.isRecurring = dto.is_recurring;

    const saved = await this.attendanceHolidayRepository.save(holiday);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'holiday.updated',
      entity_name: 'holiday',
      entity_id: saved.id,
      actor,
    });
    return this.mapHolidayRecord(saved);
  }

  async removeHoliday(
    companyId: number,
    holidayId: number,
    actor: AuthenticatedUser,
  ) {
    const holiday = await this.attendanceHolidayRepository.findOne({
      where: { id: holidayId, companyId, branchId: IsNull() },
    });
    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }

    await this.attendanceHolidayRepository.remove(holiday);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'holiday.deleted',
      entity_name: 'holiday',
      entity_id: holidayId,
      actor,
    });
    return { message: 'Holiday deleted successfully' };
  }

  async findEmployeesWithoutLeaveBalances(
    companyId: number,
    query: LeaveBalanceQueryDto,
    actor: AuthenticatedUser,
  ) {
    if (!query.fiscal_year || !/^\d{4}$/.test(query.fiscal_year)) {
      throw new BadRequestException('A four-digit fiscal year is required.');
    }
    const scopedIds = await this.resolveLeaveBalanceEmployeeIds(
      companyId,
      undefined,
      actor,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (scopedIds !== null && !scopedIds.length) {
      return { data: [], meta: buildPaginationMeta(0, 0, limit, page) };
    }
    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.employment_status = :status', {
        status: EmploymentStatusEnum.ACTIVE,
      })
      .andWhere(
        'EXISTS (SELECT 1 FROM leave_types lt WHERE lt.company_id = :companyId AND lt.status = :activeType AND NOT EXISTS (SELECT 1 FROM leave_balances lb WHERE lb.employee_id = employee.id AND lb.leave_type_id = lt.id AND lb.fiscal_year = :fiscalYear))',
        {
          activeType: LeaveRecordStatusEnum.ACTIVE,
          fiscalYear: query.fiscal_year,
        },
      );
    if (scopedIds !== null)
      qb.andWhere('employee.id IN (:...scopedIds)', { scopedIds });
    const [employees, total] = await qb
      .orderBy('employee.last_name', 'ASC')
      .addOrderBy('employee.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    if (!employees.length)
      return { data: [], meta: buildPaginationMeta(total, 0, limit, page) };
    const [types, balances] = await Promise.all([
      this.leaveTypeRepository.find({
        where: { company_id: companyId, status: LeaveRecordStatusEnum.ACTIVE },
      }),
      this.leaveBalanceRepository.find({
        where: {
          employee_id: In(employees.map((employee) => employee.id)),
          fiscal_year: query.fiscal_year,
        },
        select: ['employee_id', 'leave_type_id'],
      }),
    ]);
    const existing = new Set(
      balances.map(
        (balance) => `${balance.employee_id}:${balance.leave_type_id}`,
      ),
    );
    const data = employees.map((employee) => ({
      ...this.mapEmployeeSummaryForLeaveBalances(employee),
      missing_leave_types: types
        .filter((type) => !existing.has(`${employee.id}:${type.id}`))
        .map((type) => ({ id: type.id, name: type.name, code: type.code })),
    }));
    return { data, meta: buildPaginationMeta(total, data.length, limit, page) };
  }

  async findAllLeaveBalances(
    companyId: number,
    query: LeaveBalanceQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'updated_at',
      sortOrder,
      employee_id,
      leave_type_id,
      fiscal_year,
      department_id,
      branch_id,
      search,
    } = query;
    const scopedEmployeeIds = await this.resolveLeaveBalanceEmployeeIds(
      companyId,
      employee_id,
      actor,
    );
    const normalizedFiscalYear = fiscal_year?.trim() || null;
    const normalizedSearch = search?.trim() || null;

    const buildFilteredQb = () => {
      const qb = this.leaveBalanceRepository
        .createQueryBuilder('leaveBalance')
        .innerJoin('leaveBalance.employee', 'employee')
        .where('employee.company_id = :companyId', { companyId });

      if (scopedEmployeeIds && !scopedEmployeeIds.length) {
        qb.andWhere('1 = 0');
      } else if (scopedEmployeeIds) {
        qb.andWhere('leaveBalance.employee_id IN (:...employeeIds)', {
          employeeIds: scopedEmployeeIds,
        });
      }
      if (typeof leave_type_id === 'number') {
        qb.andWhere('leaveBalance.leave_type_id = :leaveTypeId', {
          leaveTypeId: leave_type_id,
        });
      }
      if (normalizedFiscalYear) {
        qb.andWhere('leaveBalance.fiscal_year = :fiscalYear', {
          fiscalYear: normalizedFiscalYear,
        });
      }
      if (typeof department_id === 'number') {
        qb.andWhere('employee.primary_department_id = :departmentId', {
          departmentId: department_id,
        });
      }
      if (typeof branch_id === 'number') {
        qb.andWhere('employee.primary_branch_id = :branchId', {
          branchId: branch_id,
        });
      }
      if (normalizedSearch) {
        qb.andWhere(
          '(employee.employee_no ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search)',
          { search: `%${normalizedSearch}%` },
        );
      }

      return qb;
    };

    const allowedSortFields = ['id', 'fiscal_year', 'updated_at', 'created_at'];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'updated_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const totalEmployeesRow = await buildFilteredQb()
      .select('COUNT(DISTINCT leaveBalance.employee_id)', 'count')
      .getRawOne<{ count: string }>();
    const totalEmployees = Number(totalEmployeesRow?.count ?? 0);

    const employeeIdRows = await buildFilteredQb()
      .select('leaveBalance.employee_id', 'employeeId')
      .addSelect(`MAX(leaveBalance.${safeSortBy})`, 'sortValue')
      .groupBy('leaveBalance.employee_id')
      .orderBy('"sortValue"', direction)
      .offset(skip)
      .limit(limit)
      .getRawMany<{ employeeId: string; sortValue: string }>();

    const orderedEmployeeIds = employeeIdRows.map((row) =>
      Number(row.employeeId),
    );

    if (typeof employee_id === 'number') {
      await this.assertCanAccessEmployeeById(companyId, employee_id, actor);
    }

    if (!orderedEmployeeIds.length) {
      return {
        data: [],
        meta: buildPaginationMeta(totalEmployees, 0, limit, page),
      };
    }

    const [employees, balances] = await Promise.all([
      this.employeeRepository.find({
        where: { id: In(orderedEmployeeIds) },
        relations: {
          primary_department: true,
          primary_position: true,
          primary_branch: true,
        },
      }),
      this.leaveBalanceRepository.find({
        where: {
          employee_id: In(orderedEmployeeIds),
          ...(typeof leave_type_id === 'number' ? { leave_type_id } : {}),
          ...(normalizedFiscalYear
            ? { fiscal_year: normalizedFiscalYear }
            : {}),
        },
        relations: { leave_type: true },
      }),
    ]);

    const employeesById = new Map(employees.map((item) => [item.id, item]));
    const balancesByEmployeeId = new Map<number, LeaveBalance[]>();
    balances.forEach((balance) => {
      const list = balancesByEmployeeId.get(balance.employee_id) ?? [];
      list.push(balance);
      balancesByEmployeeId.set(balance.employee_id, list);
    });

    const data = orderedEmployeeIds
      .map((id) => employeesById.get(id))
      .filter((employee): employee is Employee => Boolean(employee))
      .map((employee) => ({
        employee: this.mapEmployeeSummaryForLeaveBalances(employee),
        leave_balances: (balancesByEmployeeId.get(employee.id) ?? []).map(
          (balance) => this.mapLeaveBalanceForEmployeeGroup(balance),
        ),
      }));

    return {
      data,
      meta: buildPaginationMeta(totalEmployees, data.length, limit, page),
    };
  }

  async reconcileLeaveBalances(
    companyId: number,
    query: LeaveBalanceQueryDto,
    actor: AuthenticatedUser,
  ) {
    const scopedEmployeeIds = await this.resolveLeaveBalanceEmployeeIds(
      companyId,
      query.employee_id,
      actor,
    );
    const fiscalYear =
      query.fiscal_year?.trim() ||
      this.leaveBalanceService.getFiscalYearFromDate(new Date());
    return this.leaveBalanceLedgerService.reconcileBalances(companyId, {
      employeeIds: scopedEmployeeIds,
      employeeId: query.employee_id,
      leaveTypeId: query.leave_type_id,
      fiscalYear,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  async adjustLeaveBalance(
    companyId: number,
    dto: AdjustLeaveBalanceDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    await this.findLeaveTypeOrFail(companyId, dto.leave_type_id);

    const normalizedFiscalYear = dto.fiscal_year.trim();
    const updated = await this.dataSource.transaction(async (manager) => {
      const balance = await this.leaveBalanceService.ensureBalanceForEmployee(
        companyId,
        employee,
        dto.leave_type_id,
        normalizedFiscalYear,
        manager,
        { forceRecalculate: true },
      );

      const assignment = await this.leaveBalanceService.resolvePolicyAssignment(
        companyId,
        employee,
        dto.leave_type_id,
        manager,
      );
      const currentAvailable = calculateAvailableLeaveDays(balance);
      const delta =
        dto.mode === LeaveBalanceAdjustmentModeEnum.SET
          ? dto.amount - currentAvailable
          : dto.mode === LeaveBalanceAdjustmentModeEnum.DEDUCT
            ? -dto.amount
            : dto.amount;
      if (
        assignment?.policy?.allow_negative_balance !== true &&
        currentAvailable + delta < -0.0001
      ) {
        throw new BadRequestException(
          'This adjustment would create a negative leave balance, which company policy does not allow.',
        );
      }

      const result = await this.leaveBalanceLedgerService.applyManualAdjustment(
        balance,
        {
          companyId,
          employeeId: employee.id,
          leaveTypeId: dto.leave_type_id,
          leaveYear: normalizedFiscalYear,
          effectiveDate: new Date().toISOString().slice(0, 10),
          mode: dto.mode,
          amount: dto.amount,
          reason: dto.reason,
          createdByCompanyUserId: actor.companyMembershipId ?? null,
          idempotencyKey: `leave-balance-adjustment:${companyId}:${employee.id}:${dto.leave_type_id}:${normalizedFiscalYear}:${dto.mode}:${Date.now()}`,
          accumulationCap: this.accumulationCapFor(
            assignment,
            actor,
            dto.cap_override_reason,
          ),
        },
        manager,
      );

      return result.balance;
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_balance.adjusted',
      entity_name: 'leave_balance',
      entity_id: updated.id,
      actor,
      payload: {
        ...this.mapLeaveBalance(updated),
        adjustment_mode: dto.mode,
        adjustment_amount: dto.amount,
        reason: dto.reason,
        cap_override_reason: dto.cap_override_reason?.trim() || null,
      },
    });

    return this.mapLeaveBalance(updated);
  }

  /**
   * Hands an approved year-end (rollover) encashment to payroll as a DRAFT
   * payroll input in the next open period whose input cut-off has not
   * passed. Never throws: a failure (no open period, Finance has not
   * confirmed the component, no payable amount) is recorded on the request,
   * HR is notified once per reason, and the retry job tries again. Payroll
   * still approves the input; the encashment is PAID only when payroll pays.
   */
  async tryAutoHandOffEncashment(
    companyId: number,
    id: number,
    actor: AuthenticatedUser | null,
  ): Promise<'handed_off' | 'skipped' | 'failed'> {
    const item = await this.dataSource
      .getRepository(LeaveEncashmentRequest)
      .findOne({ where: { id, company_id: companyId } });
    if (
      !item ||
      item.status !== 'approved' ||
      item.source !== 'rollover' ||
      item.payroll_handoff_reference
    )
      return 'skipped';
    const today = new Date().toISOString().slice(0, 10);
    const attempts = Number(item.calculation?.auto_handoff_attempts ?? 0) + 1;
    try {
      const period = await this.dataSource
        .getRepository(PayrollPeriod)
        .createQueryBuilder('p')
        .where('p.companyId = :companyId', { companyId })
        .andWhere('p.status IN (:...statuses)', {
          statuses: [
            PayrollPeriodStatusEnum.DRAFT,
            PayrollPeriodStatusEnum.OPEN,
          ],
        })
        .andWhere('p.cutoffDate >= :today', { today })
        .orderBy('p.startDate', 'ASC')
        .getOne();
      if (!period)
        throw new BadRequestException(
          'No open payroll period with an input cut-off on or after today.',
        );
      const systemActor: AuthenticatedUser = actor ?? {
        id: 0,
        email: 'system',
        scope: 'company',
        userType: 'COMPANY_USER',
        companyId,
        roles: [],
        permissions: ['data_scope:company'],
      };
      await this.recordLeaveEncashmentPayrollHandoff(
        companyId,
        id,
        { payroll_period_code: period.periodCode },
        systemActor,
      );
      return 'handed_off';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.dataSource.getRepository(LeaveEncashmentRequest).update(
        { id },
        {
          calculation: {
            ...(item.calculation ?? {}),
            auto_handoff_attempts: attempts,
            auto_handoff_last_error: message,
            auto_handoff_last_attempt_at: new Date().toISOString(),
          },
        },
      );
      emitLeaveLifecycle(this.eventEmitter, {
        companyId,
        eventKey: 'leave.encashment.payment_failed',
        title: 'Year-end encashment not yet sent to payroll',
        message: `Approved year-end encashment #${id} could not be sent to payroll automatically: ${message} It will be retried; HR can also hand it off manually.`,
        notifyHr: true,
        entityType: 'LEAVE_ENCASHMENT',
        entityId: id,
        actionUrl: '/dashboard/leave-management',
        dedupeKey: `leave-encashment:${id}:auto-handoff-failed:${message.slice(0, 60)}`,
        priority: 'high',
      });
      return 'failed';
    }
  }

  /** Retry: approved rollover encashments not yet handed to payroll. */
  async retryPendingAutoHandOffs(companyId?: number) {
    const rows = await this.dataSource
      .getRepository(LeaveEncashmentRequest)
      .createQueryBuilder('e')
      .select(['e.id', 'e.company_id'])
      .where("e.status = 'approved' AND e.source = 'rollover'")
      .andWhere('e.payroll_handoff_reference IS NULL')
      .andWhere(companyId ? 'e.company_id = :companyId' : '1=1', { companyId })
      .orderBy('e.id', 'ASC')
      .limit(200)
      .getMany();
    const result = { handed_off: 0, failed: 0, skipped: 0 };
    for (const row of rows) {
      result[
        await this.tryAutoHandOffEncashment(row.company_id, row.id, null)
      ] += 1;
    }
    return result;
  }

  /**
   * HR rejected a year-end encashment: the closed year stays frozen, so the
   * days are credited to the employee's current leave cycle (limited by the
   * maximum accumulation; any excess is flagged for HR in the audit log).
   */
  private async refundRejectedRolloverEncashment(
    manager: EntityManager,
    item: LeaveEncashmentRequest,
    actor: AuthenticatedUser,
  ) {
    const employee = await manager.getRepository(Employee).findOneOrFail({
      where: { id: item.employee_id, company_id: item.company_id },
    });
    const closed = await manager
      .getRepository(LeaveBalance)
      .findOneOrFail({ where: { id: item.leave_balance_id } });
    const handler = this.closedYearRefundHandler(
      manager,
      item.company_id,
      employee,
      item.leave_type_id,
      0,
      actor,
    );
    await handler(
      closed,
      Number(item.requested_days),
      `leave-encashment:${item.id}:rollover-rejected-refund`,
    );
  }

  /**
   * Maximum-accumulation input for a balance credit. An override reason is
   * only honoured for holders of leave_balances:override_cap.
   */
  private accumulationCapFor(
    assignment: Awaited<
      ReturnType<LeaveBalanceService['resolvePolicyAssignment']>
    >,
    actor: AuthenticatedUser,
    overrideReason?: string | null,
  ): AccumulationCapInput {
    const reason = overrideReason?.trim();
    if (
      reason &&
      !hasPermission(actor.permissions, 'leave_balances:override_cap')
    ) {
      throw new ForbiddenException(
        'Crediting above the maximum accumulation needs the leave_balances:override_cap permission.',
      );
    }
    return {
      maximumDays: this.leaveBalanceService.maximumAccumulationDays(assignment),
      policyReference: assignment
        ? `leave_policy:${assignment.policy.id}${assignment.policyType ? `:type:${assignment.policyType.id}` : ''}`
        : null,
      override: reason ? { reason } : null,
    };
  }

  async createLeaveEncashmentRequest(
    companyId: number,
    dto: CreateLeaveEncashmentRequestDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveActorEmployeeIdOrFail(
      companyId,
      actor,
    );
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const result = await this.dataSource.transaction(async (manager) => {
      const assignment = await this.leaveBalanceService.resolvePolicyAssignment(
        companyId,
        employee,
        dto.leave_type_id,
        manager,
      );
      const policyType = assignment?.policyType;
      if (!policyType?.encashment_enabled) {
        throw new BadRequestException(
          'Encashment is not enabled for this leave type.',
        );
      }
      const fiscalYear = this.leaveBalanceService.normalizeFiscalYear(
        dto.fiscal_year,
      );
      const balance = await this.leaveBalanceService.ensureBalanceForEmployee(
        companyId,
        employee,
        dto.leave_type_id,
        fiscalYear,
        manager,
      );
      const pending = await manager
        .getRepository(LeaveEncashmentRequest)
        .createQueryBuilder('request')
        .select('COALESCE(SUM(request.requested_days), 0)', 'days')
        .where('request.company_id = :companyId', { companyId })
        .andWhere('request.employee_id = :employeeId', { employeeId })
        .andWhere('request.leave_type_id = :leaveTypeId', {
          leaveTypeId: dto.leave_type_id,
        })
        .andWhere('request.fiscal_year = :fiscalYear', { fiscalYear })
        .andWhere('request.status = :status', { status: 'pending' })
        .getRawOne<{ days: string }>();
      const available =
        calculateAvailableLeaveDays(balance) - Number(pending?.days ?? 0);
      const days = Number(dto.requested_days);
      const maxDays =
        policyType.maximum_encashment_days == null
          ? null
          : Number(policyType.maximum_encashment_days);
      const minimum = Number(policyType.minimum_balance_after_encashment ?? 0);
      if (maxDays !== null && days > maxDays) {
        throw new BadRequestException(
          `Encashment cannot exceed ${maxDays} days.`,
        );
      }
      if (available - days < minimum - 0.0001) {
        throw new BadRequestException(
          'The request exceeds the available balance or would breach the required retained balance.',
        );
      }
      const request = manager.getRepository(LeaveEncashmentRequest).create({
        company_id: companyId,
        employee_id: employeeId,
        leave_type_id: dto.leave_type_id,
        leave_balance_id: balance.id,
        fiscal_year: fiscalYear,
        requested_days: days.toFixed(2),
        approved_days: null,
        minimum_balance_after_encashment: minimum.toFixed(2),
        reason: dto.reason.trim(),
        status: policyType.encashment_requires_approval
          ? 'pending'
          : 'approved',
        created_by_company_user_id: actor.companyMembershipId ?? null,
        reviewed_by_company_user_id: null,
        reviewed_at: null,
      });
      const saved = await manager
        .getRepository(LeaveEncashmentRequest)
        .save(request);
      if (!policyType.encashment_requires_approval) {
        saved.approved_days = days.toFixed(2);
        const ledger = await this.leaveBalanceLedgerService.applyEncashment(
          balance,
          {
            companyId,
            employeeId,
            leaveTypeId: dto.leave_type_id,
            leaveYear: fiscalYear,
            effectiveDate: new Date().toISOString().slice(0, 10),
            days,
            requestId: saved.id,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
            reason: dto.reason.trim(),
            idempotencyKey: `leave-encashment:${saved.id}:approval`,
          },
          manager,
        );
        saved.ledger_transaction_id = ledger.transaction.id;
        saved.reviewed_at = new Date();
        await manager.getRepository(LeaveEncashmentRequest).save(saved);
      }
      return saved;
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_encashment.created',
      entity_name: 'leave_encashment_request',
      entity_id: result.id,
      actor,
      payload: {
        status: result.status,
        requested_days: result.requested_days,
        fiscal_year: result.fiscal_year,
      },
    });
    emitLeaveLifecycle(
      this.eventEmitter,
      encashmentNotification(
        result.status === 'approved' ? 'approved' : 'requested',
        result,
        { senderCompanyUserId: actor.companyMembershipId ?? null },
      ),
    );
    return result;
  }

  async listMyLeaveEncashmentRequests(
    companyId: number,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveActorEmployeeIdOrFail(
      companyId,
      actor,
    );
    return this.leaveEncashmentRepository.find({
      where: { company_id: companyId, employee_id: employeeId },
      relations: { leave_type: true, reviewer: true },
      order: { created_at: 'DESC' },
    });
  }

  async listLeaveEncashmentRequests(
    companyId: number,
    query: {
      page?: number;
      limit?: number;
      from_date?: string;
      to_date?: string;
    } = {},
    actor?: AuthenticatedUser,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    // Without an actor (internal callers) the list is company-wide; for
    // API callers it is limited to the employees they may see.
    const allowed = actor
      ? await this.hrAccessService.getAccessibleEmployeeIds(actor)
      : null;
    const qb = this.leaveEncashmentRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('request.leave_type', 'leaveType')
      .leftJoinAndSelect('request.reviewer', 'reviewer')
      .where('request.company_id = :companyId', { companyId });
    if (allowed) {
      if (allowed.length)
        qb.andWhere('request.employee_id IN (:...allowedEmployeeIds)', {
          allowedEmployeeIds: allowed,
        });
      else qb.andWhere('1 = 0');
    }
    if (query.from_date)
      qb.andWhere('request.created_at >= :fromDate', {
        fromDate: `${query.from_date}T00:00:00`,
      });
    if (query.to_date)
      qb.andWhere("request.created_at < (:toDate::date + INTERVAL '1 day')", {
        toDate: query.to_date,
      });
    const [rows, total] = await qb
      .orderBy('request.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async decideLeaveEncashmentRequest(
    companyId: number,
    id: number,
    dto: DecideLeaveEncashmentRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveEncashmentRequest);
      const item = await repo
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id AND request.company_id = :companyId', {
          id,
          companyId,
        })
        .getOne();
      if (!item) throw new NotFoundException('Encashment request not found.');
      // Holding leave_requests:approve is not enough on its own: the
      // decider must also be allowed to see this employee (own team/scope).
      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        await manager.getRepository(Employee).findOneOrFail({
          where: { id: item.employee_id, company_id: companyId },
        }),
      );
      if (item.status !== 'pending')
        throw new ConflictException(
          'This encashment request has already been decided.',
        );
      if (
        (item.created_by_company_user_id &&
          item.created_by_company_user_id === actor.companyMembershipId) ||
        item.employee_id === actor.employeeId
      ) {
        throw new ForbiddenException(
          'You cannot approve your own encashment request.',
        );
      }
      item.status = dto.approve ? 'approved' : 'rejected';
      item.reviewer_comments = dto.comments?.trim() || null;
      item.reviewed_by_company_user_id = actor.companyMembershipId ?? null;
      item.reviewed_at = new Date();
      if (item.source === 'rollover' && item.ledger_transaction_id) {
        // Days already left the (closed) year at rollover posting.
        if (
          dto.approve &&
          dto.approved_days !== undefined &&
          Math.abs(dto.approved_days - Number(item.requested_days)) > 0.001
        ) {
          throw new BadRequestException(
            'A year-end encashment is approved in full or rejected; its days were fixed when the leave year closed.',
          );
        }
        if (!dto.approve) {
          await this.refundRejectedRolloverEncashment(manager, item, actor);
        }
        item.calculation = {
          ...(item.calculation ?? {}),
          awaiting_hr_approval: false,
        };
        return repo.save(item);
      }
      if (dto.approve) {
        const employee = await this.findEmployeeOrFail(
          companyId,
          item.employee_id,
        );
        const assignment =
          await this.leaveBalanceService.resolvePolicyAssignment(
            companyId,
            employee,
            item.leave_type_id,
            manager,
          );
        const policyType = assignment?.policyType;
        if (!policyType?.encashment_enabled)
          throw new BadRequestException(
            'Encashment is no longer enabled for this leave type.',
          );
        const balance = await this.leaveBalanceService.ensureBalanceForEmployee(
          companyId,
          employee,
          item.leave_type_id,
          item.fiscal_year,
          manager,
        );
        const pending = await repo
          .createQueryBuilder('other')
          .select('COALESCE(SUM(other.requested_days), 0)', 'days')
          .where(
            'other.company_id = :companyId AND other.employee_id = :employeeId AND other.leave_type_id = :leaveTypeId AND other.fiscal_year = :fiscalYear',
            {
              companyId,
              employeeId: item.employee_id,
              leaveTypeId: item.leave_type_id,
              fiscalYear: item.fiscal_year,
            },
          )
          .andWhere('other.status = :status AND other.id != :id', {
            status: 'pending',
            id,
          })
          .getRawOne<{ days: string }>();
        const days = dto.approved_days ?? Number(item.requested_days);
        const available =
          calculateAvailableLeaveDays(balance) - Number(pending?.days ?? 0);
        const maxDays =
          policyType.maximum_encashment_days == null
            ? null
            : Number(policyType.maximum_encashment_days);
        if (
          days > Number(item.requested_days) ||
          (maxDays !== null && days > maxDays) ||
          available - days <
            Number(item.minimum_balance_after_encashment) - 0.0001
        ) {
          throw new BadRequestException(
            'Approved days exceed the current encashment policy or available balance.',
          );
        }
        item.approved_days = days.toFixed(2);
        const ledger = await this.leaveBalanceLedgerService.applyEncashment(
          balance,
          {
            companyId,
            employeeId: item.employee_id,
            leaveTypeId: item.leave_type_id,
            leaveYear: item.fiscal_year,
            effectiveDate: new Date().toISOString().slice(0, 10),
            days,
            requestId: item.id,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
            reason: item.reason,
            idempotencyKey: `leave-encashment:${item.id}:approval`,
          },
          manager,
        );
        item.ledger_transaction_id = ledger.transaction.id;
        // Price the approved days from the policy (salary basis ÷ divisor).
        if (this.leaveEncashmentCalculator && policyType) {
          try {
            const calc = await this.leaveEncashmentCalculator.calculate(
              {
                companyId,
                employeeId: item.employee_id,
                policyType,
                days,
                asOf: new Date().toISOString().slice(0, 10),
              },
              manager,
            );
            item.salary_basis = calc.salary_basis;
            item.salary_amount = calc.salary_amount.toFixed(2);
            item.rate_divisor = calc.rate_divisor.toFixed(2);
            item.daily_rate = calc.daily_rate.toFixed(4);
            item.calculated_amount = calc.amount.toFixed(2);
            item.currency = calc.currency;
            item.calculation = calc as unknown as Record<string, unknown>;
          } catch (error) {
            item.calculated_amount = null;
            item.calculation = {
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
      }
      return repo.save(item);
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: `leave_encashment.${request.status}`,
      entity_name: 'leave_encashment_request',
      entity_id: id,
      actor,
      payload: {
        approved_days: request.approved_days,
        comments: request.reviewer_comments,
      },
    });
    if (request.status === 'approved' && request.source === 'rollover') {
      // Never fails the approval: problems are recorded and retried.
      await this.tryAutoHandOffEncashment(companyId, request.id, actor);
    }
    if (request.status === 'approved' || request.status === 'rejected') {
      emitLeaveLifecycle(
        this.eventEmitter,
        encashmentNotification(request.status, request, {
          senderCompanyUserId: actor.companyMembershipId ?? null,
        }),
      );
    }
    return request;
  }

  async recordLeaveEncashmentPayrollHandoff(
    companyId: number,
    id: number,
    dto: RecordLeaveEncashmentPayrollHandoffDto,
    actor: AuthenticatedUser,
  ) {
    const manualReference = dto.reference?.trim() || null;

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveEncashmentRequest);
      const item = await repository.findOne({
        where: { id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Encashment request not found.');
      if (item.status !== 'approved' || !item.ledger_transaction_id)
        throw new ConflictException(
          'Only approved encashments can be handed off to payroll.',
        );
      if (item.payroll_handoff_reference)
        throw new ConflictException(
          'A payroll handoff has already been recorded.',
        );
      // Hand the amount to payroll as a draft input for the chosen period.
      // Payroll approves it (maker-checker) and the run adds it as an earning.
      const periodCode = dto.payroll_period_code.trim();
      const period = await manager.getRepository(PayrollPeriod).findOne({
        where: { companyId, periodCode },
      });
      if (!period) {
        throw new BadRequestException(
          `Payroll period ${periodCode} was not found.`,
        );
      }
      if (
        [
          PayrollPeriodStatusEnum.LOCKED,
          PayrollPeriodStatusEnum.CLOSED,
        ].includes(period.status)
      ) {
        throw new ConflictException(
          `Payroll period ${periodCode} is locked; choose an open period.`,
        );
      }
      // The policy-calculated amount is the default; anything else is an
      // authorised, reasoned and audited override.
      const calculated =
        item.calculated_amount !== null && item.calculated_amount !== undefined
          ? Number(item.calculated_amount)
          : null;
      const requested =
        dto.payable_amount !== undefined ? Number(dto.payable_amount) : null;
      const isOverride =
        requested !== null &&
        (calculated === null || Math.abs(requested - calculated) > 0.009);
      if (isOverride) {
        if (
          !hasPermission(actor.permissions, 'leave_encashment:override_amount')
        ) {
          throw new ForbiddenException(
            calculated === null
              ? 'This encashment has no calculated amount (check the policy divisor and compensation). Entering one needs leave_encashment:override_amount.'
              : 'Changing the calculated encashment amount needs leave_encashment:override_amount.',
          );
        }
        if ((dto.override_reason?.trim().length ?? 0) < 5) {
          throw new BadRequestException(
            'Give an override reason (at least 5 characters) for a changed amount.',
          );
        }
        item.amount_overridden = true;
        item.override_reason = dto.override_reason!.trim();
        item.overridden_by_company_user_id = actor.companyMembershipId ?? null;
      }
      const amount =
        isOverride && requested !== null ? requested : (calculated ?? 0);
      if (!(amount > 0)) {
        throw new BadRequestException(
          'There is no payable amount: configure the encashment divisor and compensation, or enter an authorised override.',
        );
      }
      const currency = (dto.currency ?? item.currency ?? '').toUpperCase();
      if (currency.length !== 3) {
        throw new BadRequestException('A 3-letter currency is required.');
      }
      // Payroll needs a component whose tax/GL treatment Finance confirmed.
      const component = await manager.getRepository(PayrollComponent).findOne({
        where: { companyId, code: LEAVE_ENCASHMENT_COMPONENT_CODE },
      });
      assertFinanceReady(
        component,
        LEAVE_ENCASHMENT_COMPONENT_CODE,
        this.isProductionEnvironment(),
      );
      const inputRepository = manager.getRepository(PayrollInput);
      const input = await inputRepository.save(
        inputRepository.create({
          companyId,
          payrollPeriodId: period.id,
          employeeId: item.employee_id,
          componentCode: LEAVE_ENCASHMENT_COMPONENT_CODE,
          sourceModule: 'LEAVE_ENCASHMENT',
          sourceReference: `leave-encashment:${item.id}`,
          amount: amount.toFixed(2),
          quantity: item.approved_days,
          rate: item.daily_rate,
          currency,
          status: PayrollInputStatusEnum.DRAFT,
          payload: {
            leave_encashment_request_id: item.id,
            leave_type_id: item.leave_type_id,
            fiscal_year: item.fiscal_year,
            approved_days: item.approved_days,
            ledger_transaction_id: item.ledger_transaction_id,
          },
          createdByCompanyUserId: actor.companyMembershipId ?? null,
        }),
      );
      const reference = manualReference ?? `PAYROLL-INPUT-${input.id}`;
      item.payroll_input_id = input.id;
      item.payroll_handoff_reference = reference;
      item.payroll_handed_off_at = new Date();
      item.payroll_handed_off_by_company_user_id =
        actor.companyMembershipId ?? null;
      item.payroll_period_code = dto.payroll_period_code.trim();
      item.currency = currency;
      item.payable_amount = amount.toFixed(2);
      item.payment_status = 'IN_PAYROLL';
      return repository.save(item);
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_encashment.payroll_handoff_recorded',
      entity_name: 'leave_encashment_request',
      entity_id: id,
      actor,
      payload: {
        reference: saved.payroll_handoff_reference,
        approved_days: saved.approved_days,
        payroll_input_id: saved.payroll_input_id,
        payable_amount: saved.payable_amount,
        calculated_amount: saved.calculated_amount,
        amount_overridden: saved.amount_overridden,
        override_reason: saved.override_reason,
      },
    });
    emitLeaveLifecycle(
      this.eventEmitter,
      encashmentNotification('submitted_to_payroll', saved, {
        senderCompanyUserId: actor?.companyMembershipId ?? null,
      }),
    );
    return saved;
  }

  private isProductionEnvironment(): boolean {
    return [
      this.configService.get<string>('APP_ENV'),
      this.configService.get<string>('NODE_ENV'),
    ].some((value) => value?.trim().toLowerCase() === 'production');
  }

  /**
   * Cancels an approved encashment that has not been paid: removes its draft
   * payroll input and gives the days back on the balance (audited).
   */
  async reverseLeaveEncashment(
    companyId: number,
    id: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveEncashmentRequest);
      const item = await repository.findOne({
        where: { id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Encashment request not found.');
      if (item.status !== 'approved') {
        throw new ConflictException(
          'Only an approved encashment can be reversed.',
        );
      }
      if (item.payment_status === 'PAID') {
        throw new ConflictException(
          'This encashment has been paid; reverse it in payroll first (it will then show as REVERSED).',
        );
      }
      if (item.payroll_input_id) {
        const inputRepository = manager.getRepository(PayrollInput);
        const input = await inputRepository.findOne({
          where: { id: item.payroll_input_id, companyId },
        });
        if (
          input &&
          input.status !== PayrollInputStatusEnum.DRAFT &&
          input.status !== PayrollInputStatusEnum.REJECTED
        ) {
          throw new ConflictException(
            'Payroll has already approved this input; ask payroll to reject it before reversing the encashment.',
          );
        }
        if (input && input.status === PayrollInputStatusEnum.DRAFT) {
          input.status = PayrollInputStatusEnum.REJECTED;
          await inputRepository.save(input);
        }
      }
      const balance = await manager.getRepository(LeaveBalance).findOne({
        where: { id: item.leave_balance_id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (balance && item.ledger_transaction_id) {
        await this.leaveBalanceLedgerService.reverseEncashment(
          balance,
          {
            companyId,
            days: Number(item.approved_days ?? 0),
            requestId: item.id,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
            reason,
            idempotencyKey: `leave-encashment:${item.id}:reversal`,
          },
          manager,
        );
      }
      item.status = 'cancelled';
      item.payment_status =
        item.payment_status === 'REVERSED' ? 'REVERSED' : 'NOT_PAID';
      item.reversal_reason = reason.trim();
      item.reversed_at = new Date();
      return repository.save(item);
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_encashment.reversed',
      entity_name: 'leave_encashment_request',
      entity_id: id,
      actor,
      payload: { reason, approved_days: saved.approved_days },
    });
    emitLeaveLifecycle(
      this.eventEmitter,
      encashmentNotification('reversed', saved, {
        senderCompanyUserId: actor.companyMembershipId ?? null,
        reason,
      }),
    );
    return saved;
  }

  /**
   * Finance confirms the payroll treatment of a leave money component, which
   * releases it for payroll handoffs (until then handoffs are refused).
   */
  async confirmLeavePayrollComponent(
    companyId: number,
    dto: {
      component_code?: string;
      general_ledger_account_code: string;
      liability_account_code: string;
      expense_account_code: string;
      tax_treatment: string;
      taxable_percentage: number;
      pensionable: boolean;
      effective_date: string;
      notes: string;
    },
    actor: AuthenticatedUser,
  ) {
    const code = (
      dto.component_code ?? LEAVE_ENCASHMENT_COMPONENT_CODE
    ).toUpperCase();
    if (
      ![LEAVE_ENCASHMENT_COMPONENT_CODE, 'PUBLIC_HOLIDAY_WORK'].includes(code)
    ) {
      throw new BadRequestException(
        'Only leave payroll components can be confirmed here.',
      );
    }
    if (
      !Object.values(PayrollTaxTreatmentEnum).includes(
        dto.tax_treatment as PayrollTaxTreatmentEnum,
      )
    ) {
      throw new BadRequestException('Unknown tax treatment.');
    }
    const repository = this.dataSource.getRepository(PayrollComponent);
    const component = await repository.findOne({ where: { companyId, code } });
    if (!component) {
      throw new NotFoundException(
        `Payroll component ${code} does not exist for this company.`,
      );
    }
    const before = {
      gl: component.generalLedgerAccountCode,
      tax: component.taxTreatment,
      taxable: component.taxablePercentage,
      pensionable: component.pensionable,
      status: component.status,
    };
    component.generalLedgerAccountCode = dto.general_ledger_account_code.trim();
    component.liabilityAccountCode = dto.liability_account_code.trim();
    component.expenseAccountCode = dto.expense_account_code.trim();
    component.taxTreatment = dto.tax_treatment as PayrollTaxTreatmentEnum;
    component.taxablePercentage = String(dto.taxable_percentage);
    component.pensionable = dto.pensionable;
    component.status = 'ACTIVE';
    component.calculationConfiguration = {
      ...(component.calculationConfiguration ?? {}),
      finance_verified: true,
      placeholder_gl: false,
      test_configuration: false,
      verified_by_company_user_id: actor.companyMembershipId ?? null,
      verified_at: new Date().toISOString(),
      effective_date: dto.effective_date.slice(0, 10),
      notes: dto.notes.trim(),
    };
    await repository.save(component);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_payroll_component.finance_confirmed',
      entity_name: 'payroll_component',
      entity_id: component.id,
      actor,
      payload: { code, before, after: dto },
    });
    return component;
  }

  /** Readiness of the leave payroll components (for the HR/Finance screens). */
  async leavePayrollComponentStatus(companyId: number) {
    const components = await this.dataSource
      .getRepository(PayrollComponent)
      .find({
        where: {
          companyId,
          code: In([LEAVE_ENCASHMENT_COMPONENT_CODE, 'PUBLIC_HOLIDAY_WORK']),
        },
      });
    const production = this.isProductionEnvironment();
    return components.map((component) => {
      const config = component.calculationConfiguration ?? {};
      const ready =
        component.status === 'ACTIVE' &&
        (config.finance_verified === true ||
          (config.test_configuration === true && !production));
      return {
        code: component.code,
        name: component.name,
        status: component.status,
        tax_treatment: component.taxTreatment,
        taxable_percentage: component.taxablePercentage,
        pensionable: component.pensionable,
        general_ledger_account_code: component.generalLedgerAccountCode,
        finance_verified: config.finance_verified === true,
        test_configuration: config.test_configuration === true,
        placeholder_gl: config.placeholder_gl === true,
        verified_at: config.verified_at ?? null,
        ready_for_handoff: ready,
      };
    });
  }

  async recordLeaveEncashmentPayment(
    companyId: number,
    id: number,
    dto: RecordLeaveEncashmentPaymentDto,
    actor: AuthenticatedUser,
  ) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveEncashmentRequest);
      const item = await repository.findOne({
        where: { id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Encashment request not found.');
      if (item.status !== 'approved' || !item.payroll_handoff_reference) {
        throw new ConflictException(
          'Only handed-off approved encashments can be marked paid.',
        );
      }
      if (item.payment_status === 'PAID') {
        throw new ConflictException('Payment has already been recorded.');
      }
      if (item.currency && item.currency !== dto.currency.toUpperCase()) {
        throw new BadRequestException(
          'Payment currency must match the payroll handoff currency.',
        );
      }
      if (
        item.payable_amount &&
        Math.abs(Number(item.payable_amount) - dto.amount) > 0.01
      ) {
        throw new BadRequestException(
          'Payment amount must match the payroll handoff amount.',
        );
      }
      item.payment_status = 'PAID';
      item.payment_confirmed_via = 'manual';
      item.payment_reference = dto.payment_reference.trim();
      item.paid_at = new Date(dto.paid_at);
      return repository.save(item);
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_encashment.payment_recorded',
      entity_name: 'leave_encashment_request',
      entity_id: id,
      actor,
      payload: {
        payment_reference: saved.payment_reference,
        paid_at: saved.paid_at,
        amount: saved.payable_amount,
        currency: saved.currency,
      },
    });
    emitLeaveLifecycle(
      this.eventEmitter,
      encashmentNotification('paid', saved, {
        senderCompanyUserId: actor.companyMembershipId ?? null,
      }),
    );
    return saved;
  }

  async cancelMyLeaveEncashmentRequest(
    companyId: number,
    id: number,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveActorEmployeeIdOrFail(
      companyId,
      actor,
    );
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveEncashmentRequest);
      const item = await repository
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where(
          'request.id = :id AND request.company_id = :companyId AND request.employee_id = :employeeId',
          { id, companyId, employeeId },
        )
        .getOne();
      if (!item) throw new NotFoundException('Encashment request not found.');
      if (item.status !== 'pending')
        throw new ConflictException(
          'Only pending encashment requests can be cancelled.',
        );
      item.status = 'cancelled';
      return repository.save(item);
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_encashment.cancelled',
      entity_name: 'leave_encashment_request',
      entity_id: id,
      actor,
    });
    return saved;
  }

  async listLeaveBalanceTransactions(
    companyId: number,
    query: LeaveBalanceTransactionQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      employee_id,
      leave_type_id,
      leave_request_id,
      fiscal_year,
      transaction_type,
      page = 1,
      limit = 20,
    } = query;
    const scopedEmployeeIds = await this.resolveLeaveBalanceEmployeeIds(
      companyId,
      employee_id,
      actor,
    );

    const [items, total] =
      await this.leaveBalanceLedgerService.findTransactions(companyId, {
        employeeIds: scopedEmployeeIds,
        employeeId: employee_id,
        leaveTypeId: leave_type_id,
        leaveRequestId: leave_request_id,
        fiscalYear: fiscal_year,
        transactionType: transaction_type,
        page,
        limit,
      });

    if (typeof employee_id === 'number') {
      await this.assertCanAccessEmployeeById(companyId, employee_id, actor);
    }

    return {
      data: items.map((item) => this.mapLeaveBalanceTransaction(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async listLeaveBalanceAdjustments(
    companyId: number,
    query: LeaveBalanceAdjustmentQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      employee_id,
      leave_type_id,
      fiscal_year,
      page = 1,
      limit = 20,
    } = query;
    const scopedEmployeeIds = await this.resolveLeaveBalanceEmployeeIds(
      companyId,
      employee_id,
      actor,
    );

    const [items, total] =
      await this.leaveBalanceService.findBalanceAdjustments(companyId, {
        employeeIds: scopedEmployeeIds,
        employeeId: employee_id,
        leaveTypeId: leave_type_id,
        fiscalYear: fiscal_year,
        page,
        limit,
      });

    return {
      data: items.map((item) => this.mapLeaveBalanceAdjustment(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async generateLeaveBalances(
    companyId: number,
    dto: GenerateLeaveBalancesDto,
    actor: AuthenticatedUser,
  ) {
    const fiscalYear =
      dto.fiscal_year?.trim() ??
      this.leaveBalanceService.getFiscalYearFromDate(new Date());

    if (typeof dto.employee_id === 'number') {
      const employee = await this.findEmployeeOrFail(
        companyId,
        dto.employee_id,
      );
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }

    const result = await this.leaveBalanceService.generateBalancesForCompany(
      companyId,
      fiscalYear,
      {
        employeeId: dto.employee_id,
        leaveTypeId: dto.leave_type_id,
        forceRecalculate: dto.force_recalculate ?? false,
      },
    );

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_balance.generated',
      entity_name: 'leave_balance',
      actor,
      payload: result,
    });

    return result;
  }

  async carryForwardLeaveBalances(
    companyId: number,
    dto: GenerateLeaveBalancesDto,
    actor: AuthenticatedUser,
  ) {
    const result = await this.generateLeaveBalances(
      companyId,
      {
        ...dto,
        force_recalculate: true,
      },
      actor,
    );

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_balance.carry_forward',
      entity_name: 'leave_balance',
      actor,
      payload: result,
    });

    return result;
  }

  /**
   * Dry run of a leave request: the server's own day count (working days,
   * weekly offs, holidays), the supporting-document rule, notice and the
   * balance — so the form shows exactly what submission will enforce.
   * Nothing is saved. Problems come back as `issues` instead of errors.
   */
  async previewLeaveRequest(
    companyId: number,
    dto: Omit<CreateLeaveRequestDto, 'reason'> & {
      reason?: string;
      ignore_request_id?: number;
    },
    actor: AuthenticatedUser,
  ) {
    const issues: string[] = [];
    const attempt = async <T>(
      step: () => Promise<T> | T,
    ): Promise<T | null> => {
      try {
        return await step();
      } catch (error) {
        if (error instanceof BadRequestException) {
          issues.push(error.message);
          return null;
        }
        throw error;
      }
    };
    const startDate = normalizeDateInput(dto.start_date, 'start_date');
    const endDate = normalizeDateInput(dto.end_date, 'end_date');
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    const leaveType = await this.findLeaveTypeOrFail(
      companyId,
      dto.leave_type_id,
    );
    await attempt(() => {
      this.assertEmployeeCanRequestLeave(employee, startDate, endDate);
      this.assertDateOrder(
        startDate,
        endDate,
        'end_date cannot be before start_date',
      );
      if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE)
        throw new BadRequestException('Leave type is inactive');
      if (!isEmployeeEligibleForLeaveType(employee, leaveType))
        throw new BadRequestException(
          `Leave type is restricted to ${leaveType.gender_restriction}`,
        );
    });
    await attempt(() =>
      this.validateNoOverlap(
        companyId,
        dto.employee_id,
        startDate,
        endDate,
        dto.ignore_request_id,
      ),
    );
    const policyContext = await this.resolvePolicyContext(
      companyId,
      employee,
      dto.leave_type_id,
    );
    const calculation = await attempt(() =>
      this.calculateLeaveDuration({
        companyId,
        leaveTypeId: dto.leave_type_id,
        employee,
        policy: policyContext.policy,
        durationType: dto.duration_type ?? LeaveDurationTypeEnum.FULL_DAY,
        startDate,
        endDate,
        halfDaySession: dto.half_day_session ?? null,
        startTime: this.normalizeOptionalTimeString(dto.start_time),
        endTime: this.normalizeOptionalTimeString(dto.end_time),
      }),
    );
    const chargeableDays = calculation?.totalDays ?? 0;
    const excluded = calculation?.snapshot.excluded_dates ?? [];
    if (calculation && chargeableDays <= 0)
      issues.push(
        'Selected period results in zero leave days after holidays/weekends',
      );
    if (
      policyContext.maxConsecutiveDays &&
      chargeableDays > policyContext.maxConsecutiveDays
    )
      issues.push(
        `Leave exceeds maximum consecutive days (${policyContext.maxConsecutiveDays})`,
      );
    if (
      policyContext.maxPerRequestDays &&
      chargeableDays > policyContext.maxPerRequestDays
    )
      issues.push(
        `Leave exceeds maximum days per request (${policyContext.maxPerRequestDays})`,
      );
    const notice = await attempt(() =>
      this.assertMinimumNotice(
        policyContext.policy,
        employee,
        startDate,
        actor,
        dto.notice_override_reason,
      ),
    );
    if (this.leaveStatutoryService && calculation) {
      issues.push(
        ...(await this.leaveStatutoryService.familyLeaveIssues(
          companyId,
          employee,
          dto.leave_type_id,
          {
            id: dto.ignore_request_id,
            start_date: startDate,
            total_days: chargeableDays,
            event_date: dto.event_date ?? null,
          },
        )),
      );
    }
    const noticeDays = policyContext.policy?.minimum_notice_days ?? 0;
    const daysUntilStart = this.daysUntil(startDate);
    const balance = await this.leaveBalanceRepository.findOne({
      where: {
        employee_id: employee.id,
        leave_type_id: dto.leave_type_id,
        fiscal_year: this.leaveBalanceService.cycleForDate(
          policyContext.accrual,
          startDate,
          employee,
        ).label,
      },
    });
    const availableNow = balance
      ? roundLeaveDays(calculateAvailableLeaveDays(balance))
      : null;
    let bookable = availableNow;
    if (
      balance &&
      this.leaveBalanceService.isAccruingPolicy(policyContext.accrual)
    ) {
      const yearEnd =
        balance.leave_year_end_date?.slice(0, 10) ??
        `${balance.fiscal_year}-12-31`;
      bookable = roundLeaveDays(
        calculateAvailableLeaveDays(balance, {
          accruedDays: this.leaveBalanceService.accruedDaysAsOf(
            this.leaveBalanceService.toNumber(balance.entitlement_days),
            policyContext.accrual,
            balance.fiscal_year,
            employee,
            endDate < yearEnd ? endDate : yearEnd,
          ),
        }),
      );
    }
    if (
      bookable !== null &&
      !policyContext.allowNegativeBalance &&
      leaveType.is_paid !== false &&
      chargeableDays > bookable + 1e-9
    )
      issues.push(
        `Insufficient leave balance: ${bookable} day(s) can be booked for these dates; this request needs ${chargeableDays}.`,
      );
    const calendarDays =
      Math.round(
        (Date.parse(`${endDate}T00:00:00Z`) -
          Date.parse(`${startDate}T00:00:00Z`)) /
          86_400_000,
      ) + 1;

    return {
      employee_id: employee.id,
      leave_type_id: leaveType.id,
      start_date: startDate,
      end_date: endDate,
      calendar_days: Math.max(calendarDays, 0),
      chargeable_days: chargeableDays,
      weekly_off_days: excluded.filter((d) => d.reason === 'weekly_off').length,
      public_holiday_days: excluded.filter((d) => d.reason === 'holiday')
        .length,
      included_dates: calculation?.snapshot.included_dates ?? [],
      excluded_dates: excluded,
      evidence: {
        required: isEvidenceRequiredFor(leaveType, chargeableDays),
        requires_attachment: leaveType.requires_attachment,
        required_after_days: leaveType.attachment_required_after_days ?? null,
        // Always deferrable: evidence is due when the leave ends.
        allow_deferred: true,
        due_after_leave_end_days: leaveType.attachment_grace_days ?? 3,
        grace_days: leaveType.attachment_grace_days,
      },
      notice: {
        minimum_days: noticeDays,
        days_until_start: daysUntilStart,
        satisfied: noticeDays <= 0 || daysUntilStart >= noticeDays,
        override_applied: notice?.overridden ?? false,
      },
      balance: {
        available_now: availableNow,
        bookable_for_dates: bookable,
        allow_negative: policyContext.allowNegativeBalance,
      },
      issues,
      can_submit: issues.length === 0,
    };
  }

  async createLeaveRequest(
    companyId: number,
    dto: CreateLeaveRequestDto,
    actor: AuthenticatedUser,
  ) {
    const normalizedStartDate = normalizeDateInput(
      dto.start_date,
      'start_date',
    );
    const normalizedEndDate = normalizeDateInput(dto.end_date, 'end_date');
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    this.assertEmployeeCanRequestLeave(
      employee,
      normalizedStartDate,
      normalizedEndDate,
    );
    const leaveType = await this.findLeaveTypeOrFail(
      companyId,
      dto.leave_type_id,
    );

    if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE) {
      throw new BadRequestException('Leave type is inactive');
    }

    this.assertDateOrder(
      normalizedStartDate,
      normalizedEndDate,
      'end_date cannot be before start_date',
    );

    if (!isEmployeeEligibleForLeaveType(employee, leaveType)) {
      throw new BadRequestException(
        `Leave type is restricted to ${leaveType.gender_restriction}`,
      );
    }

    await this.validateNoOverlap(
      companyId,
      dto.employee_id,
      normalizedStartDate,
      normalizedEndDate,
    );

    const policyContext = await this.resolvePolicyContext(
      companyId,
      employee,
      dto.leave_type_id,
    );

    if (
      policyContext.policy &&
      !policyContext.policy.allow_during_probation &&
      [
        EmployeeConfirmationStatusEnum.PROBATION,
        EmployeeConfirmationStatusEnum.PROBATION_EXTENDED,
      ].includes(employee.confirmation_status)
    ) {
      throw new BadRequestException(
        'Leave is not allowed during probation under the applicable leave policy.',
      );
    }

    const durationType = dto.duration_type ?? LeaveDurationTypeEnum.FULL_DAY;
    const normalizedStartTime = this.normalizeOptionalTimeString(
      dto.start_time,
    );
    const normalizedEndTime = this.normalizeOptionalTimeString(dto.end_time);
    const calculation = await this.calculateLeaveDuration({
      companyId,
      leaveTypeId: dto.leave_type_id,
      employee,
      policy: policyContext.policy,
      durationType,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      halfDaySession: dto.half_day_session ?? null,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
    });
    const totalDays = calculation.totalDays;
    const noticeOverride = this.assertMinimumNotice(
      policyContext.policy,
      employee,
      normalizedStartDate,
      actor,
      dto.notice_override_reason,
    );

    if (totalDays <= 0) {
      throw new BadRequestException(
        'Selected period results in zero leave days after holidays/weekends',
      );
    }

    if (
      policyContext.maxConsecutiveDays &&
      totalDays > policyContext.maxConsecutiveDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum consecutive days (${policyContext.maxConsecutiveDays})`,
      );
    }

    if (
      policyContext.maxPerRequestDays &&
      totalDays > policyContext.maxPerRequestDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum days per request (${policyContext.maxPerRequestDays})`,
      );
    }

    const serviceMonths = this.calculateServiceMonths(employee.hire_date);
    if (serviceMonths < policyContext.minServiceMonths) {
      throw new BadRequestException(
        `Employee requires minimum ${policyContext.minServiceMonths} month(s) of service`,
      );
    }

    const shouldSubmit = dto.submit ?? true;

    const leaveRequest = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const leaveNo = await this.generateLeaveNo(companyId, manager);
      const created = await repository.save(
        repository.create({
          company_id: companyId,
          employee_id: dto.employee_id,
          leave_type_id: dto.leave_type_id,
          leave_no: leaveNo,
          start_date: normalizedStartDate,
          end_date: normalizedEndDate,
          duration_type: durationType,
          half_day_session:
            durationType === LeaveDurationTypeEnum.HALF_DAY
              ? (dto.half_day_session ?? null)
              : null,
          start_time:
            durationType === LeaveDurationTypeEnum.SHORT_LEAVE
              ? normalizedStartTime
              : null,
          end_time:
            durationType === LeaveDurationTypeEnum.SHORT_LEAVE
              ? normalizedEndTime
              : null,
          requested_minutes: calculation.requestedMinutes,
          total_days: this.leaveBalanceService.toDecimal(totalDays),
          calculation_snapshot: calculation.snapshot,
          calculation_hash: calculation.hash,
          calculation_version: 1,
          reason: dto.reason.trim(),
          current_approval_level: 0,
          status: LeaveStatusEnum.DRAFT,
          rejection_reason: null,
          workflow_version: null,
          workflow_snapshot: null,
          applied_at: null,
          created_by_company_user_id: actor.companyMembershipId!,
          ...this.noticeOverrideColumns(noticeOverride, actor),
          event_date: dto.event_date?.slice(0, 10) ?? null,
        }),
      );
      if (noticeOverride.overridden) {
        await this.auditNoticeOverride(
          companyId,
          created,
          noticeOverride,
          actor,
          manager,
        );
      }

      if (shouldSubmit) {
        await this.submitLeaveRequestRecord(
          companyId,
          created,
          employee,
          policyContext,
          actor,
          manager,
        );
      }

      return repository.findOneOrFail({
        where: { id: created.id },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      });
    });

    if (
      leaveRequest.current_approval_level > 0 &&
      [
        LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        LeaveStatusEnum.PENDING_HR,
      ].includes(leaveRequest.status)
    ) {
      await this.emitLeaveSubmitted(
        companyId,
        leaveRequest,
        employee,
        actor,
        this.dataSource.manager,
      );
    }

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.created',
      entity_name: 'leave_request',
      entity_id: leaveRequest.id,
      actor,
      payload: this.mapLeaveRequest(leaveRequest),
    });

    return this.mapLeaveRequest(leaveRequest);
  }

  async submitLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          company_user: true,
          primary_department: true,
          primary_position: true,
        },
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    if (leaveRequest.status !== LeaveStatusEnum.DRAFT) {
      throw new BadRequestException(
        'Only draft leave requests can be submitted',
      );
    }

    const normalizedStartDate = normalizeDateInput(
      leaveRequest.start_date,
      'start_date',
    );
    const normalizedEndDate = normalizeDateInput(
      leaveRequest.end_date,
      'end_date',
    );
    leaveRequest.start_date = normalizedStartDate;
    leaveRequest.end_date = normalizedEndDate;

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );
    this.assertEmployeeCanRequestLeave(
      leaveRequest.employee,
      normalizedStartDate,
      normalizedEndDate,
    );

    const leaveType = await this.findLeaveTypeOrFail(
      companyId,
      leaveRequest.leave_type_id,
    );
    if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE) {
      throw new BadRequestException('Leave type is inactive');
    }

    this.assertDateOrder(
      normalizedStartDate,
      normalizedEndDate,
      'end_date cannot be before start_date',
    );

    if (!isEmployeeEligibleForLeaveType(leaveRequest.employee, leaveType)) {
      throw new BadRequestException(
        `Leave type is restricted to ${leaveType.gender_restriction}`,
      );
    }

    await this.validateNoOverlap(
      companyId,
      leaveRequest.employee_id,
      normalizedStartDate,
      normalizedEndDate,
      leaveRequest.id,
    );

    const policyContext = await this.resolvePolicyContext(
      companyId,
      leaveRequest.employee,
      leaveRequest.leave_type_id,
    );

    if (
      policyContext.policy &&
      !policyContext.policy.allow_during_probation &&
      [
        EmployeeConfirmationStatusEnum.PROBATION,
        EmployeeConfirmationStatusEnum.PROBATION_EXTENDED,
      ].includes(leaveRequest.employee.confirmation_status)
    ) {
      throw new BadRequestException(
        'Leave is not allowed during probation under the applicable leave policy.',
      );
    }

    const calculation = await this.calculateLeaveDuration({
      companyId,
      leaveTypeId: leaveRequest.leave_type_id,
      employee: leaveRequest.employee,
      policy: policyContext.policy,
      durationType:
        leaveRequest.duration_type ?? LeaveDurationTypeEnum.FULL_DAY,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      halfDaySession: leaveRequest.half_day_session,
      startTime: leaveRequest.start_time,
      endTime: leaveRequest.end_time,
    });
    const totalDays = calculation.totalDays;
    await this.recordNoticeOverride(
      companyId,
      leaveRequest,
      this.assertMinimumNotice(
        policyContext.policy,
        leaveRequest.employee,
        normalizedStartDate,
        actor,
        leaveRequest.notice_override_reason,
      ),
      actor,
    );

    if (totalDays <= 0) {
      throw new BadRequestException(
        'Selected period results in zero leave days after holidays/weekends',
      );
    }

    if (
      policyContext.maxConsecutiveDays &&
      totalDays > policyContext.maxConsecutiveDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum consecutive days (${policyContext.maxConsecutiveDays})`,
      );
    }

    if (
      policyContext.maxPerRequestDays &&
      totalDays > policyContext.maxPerRequestDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum days per request (${policyContext.maxPerRequestDays})`,
      );
    }

    const serviceMonths = this.calculateServiceMonths(
      leaveRequest.employee.hire_date,
    );
    if (serviceMonths < policyContext.minServiceMonths) {
      throw new BadRequestException(
        `Employee requires minimum ${policyContext.minServiceMonths} month(s) of service`,
      );
    }

    const submitted = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const current = await repository.findOne({
        where: { id: leaveRequest.id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!current) {
        throw new NotFoundException('Leave request not found');
      }

      if (current.status !== LeaveStatusEnum.DRAFT) {
        throw new BadRequestException(
          'Only draft leave requests can be submitted',
        );
      }

      current.total_days = this.leaveBalanceService.toDecimal(totalDays);
      current.requested_minutes = calculation.requestedMinutes;
      current.calculation_snapshot = calculation.snapshot;
      current.calculation_hash = calculation.hash;
      current.calculation_version = (current.calculation_version ?? 0) + 1;
      current.reason = current.reason.trim();
      await repository.save(current);

      await this.submitLeaveRequestRecord(
        companyId,
        current,
        leaveRequest.employee,
        policyContext,
        actor,
        manager,
      );

      return repository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      });
    });

    if (
      submitted.current_approval_level > 0 &&
      [
        LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        LeaveStatusEnum.PENDING_HR,
      ].includes(submitted.status)
    ) {
      await this.emitLeaveSubmitted(
        companyId,
        submitted,
        leaveRequest.employee,
        actor,
        this.dataSource.manager,
      );
    }

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: submitted.id,
      action: 'leave_request.submitted',
      entity_name: 'leave_request',
      entity_id: submitted.id,
      actor,
      payload: {
        status: submitted.status,
        applied_at: submitted.applied_at,
      },
    });

    return this.mapLeaveRequest(submitted);
  }

  /**
   * Edits a draft or returned request. Days are recalculated on the server;
   * submit/resubmit re-run the full policy validation before routing.
   */
  async updateLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    dto: UpdateLeaveRequestDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.leaveRequestRepository.findOne({
      where: { id: leaveRequestId, company_id: companyId },
      relations: { employee: true },
    });
    if (!existing) {
      throw new NotFoundException('Leave request not found');
    }
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      existing.employee,
    );
    if (
      ![
        LeaveStatusEnum.DRAFT,
        LeaveStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(existing.status)
    ) {
      throw new BadRequestException(
        'Only draft or returned leave requests can be edited',
      );
    }

    const leaveTypeId = dto.leave_type_id ?? existing.leave_type_id;
    const startDate = normalizeDateInput(
      dto.start_date ?? existing.start_date,
      'start_date',
    );
    const endDate = normalizeDateInput(
      dto.end_date ?? existing.end_date,
      'end_date',
    );
    const durationType =
      dto.duration_type ??
      existing.duration_type ??
      LeaveDurationTypeEnum.FULL_DAY;
    const halfDaySession =
      dto.half_day_session !== undefined
        ? dto.half_day_session
        : existing.half_day_session;
    const startTime =
      dto.start_time !== undefined
        ? this.normalizeOptionalTimeString(dto.start_time)
        : existing.start_time;
    const endTime =
      dto.end_time !== undefined
        ? this.normalizeOptionalTimeString(dto.end_time)
        : existing.end_time;

    this.assertDateOrder(
      startDate,
      endDate,
      'end_date cannot be before start_date',
    );
    this.assertEmployeeCanRequestLeave(existing.employee, startDate, endDate);
    const leaveType = await this.findLeaveTypeOrFail(companyId, leaveTypeId);
    if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE) {
      throw new BadRequestException('Leave type is inactive');
    }
    if (!isEmployeeEligibleForLeaveType(existing.employee, leaveType)) {
      throw new BadRequestException(
        `Leave type is restricted to ${leaveType.gender_restriction}`,
      );
    }
    await this.validateNoOverlap(
      companyId,
      existing.employee_id,
      startDate,
      endDate,
      existing.id,
    );
    const policyContext = await this.resolvePolicyContext(
      companyId,
      existing.employee,
      leaveTypeId,
    );
    const calculation = await this.calculateLeaveDuration({
      companyId,
      leaveTypeId: leaveTypeId,
      employee: existing.employee,
      policy: policyContext.policy,
      durationType,
      startDate,
      endDate,
      halfDaySession: halfDaySession ?? null,
      startTime,
      endTime,
    });
    if (calculation.totalDays <= 0) {
      throw new BadRequestException(
        'Selected period results in zero leave days after holidays/weekends',
      );
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const current = await repository.findOne({
        where: { id: existing.id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !current ||
        ![
          LeaveStatusEnum.DRAFT,
          LeaveStatusEnum.RETURNED_FOR_CORRECTION,
        ].includes(current.status)
      ) {
        throw new BadRequestException(
          'Only draft or returned leave requests can be edited',
        );
      }
      const previous = {
        leave_type_id: current.leave_type_id,
        start_date: current.start_date,
        end_date: current.end_date,
        duration_type: current.duration_type,
        total_days: current.total_days,
        reason: current.reason,
      };
      current.leave_type_id = leaveTypeId;
      current.start_date = startDate;
      current.end_date = endDate;
      current.duration_type = durationType;
      current.half_day_session =
        durationType === LeaveDurationTypeEnum.HALF_DAY
          ? (halfDaySession ?? null)
          : null;
      current.start_time =
        durationType === LeaveDurationTypeEnum.SHORT_LEAVE ? startTime : null;
      current.end_time =
        durationType === LeaveDurationTypeEnum.SHORT_LEAVE ? endTime : null;
      current.requested_minutes = calculation.requestedMinutes;
      current.total_days = this.leaveBalanceService.toDecimal(
        calculation.totalDays,
      );
      current.calculation_snapshot = calculation.snapshot;
      current.calculation_hash = calculation.hash;
      current.calculation_version = (current.calculation_version ?? 0) + 1;
      if (dto.reason !== undefined) current.reason = dto.reason.trim();
      if (dto.notice_override_reason !== undefined)
        current.notice_override_reason =
          dto.notice_override_reason?.trim() || null;
      if (dto.event_date !== undefined)
        current.event_date = dto.event_date?.slice(0, 10) ?? null;
      const updated = await repository.save(current);
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: updated.id,
          action: 'leave_request.updated',
          entity_name: 'leave_request',
          entity_id: updated.id,
          actor,
          payload: { previous, changes: dto },
        },
        manager,
      );
      return updated;
    });
    // Date edits move a default-dated acting assignment with the leave.
    await this.leaveActingAssignmentService?.syncAfterCommit(saved.id);

    return this.mapLeaveRequest(
      await this.leaveRequestRepository.findOneOrFail({
        where: { id: saved.id, company_id: companyId },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      }),
    );
  }

  async resubmitLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
    changes?: UpdateLeaveRequestDto,
  ) {
    if (changes && Object.keys(changes).length > 0) {
      await this.updateLeaveRequest(companyId, leaveRequestId, changes, actor);
    }
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          company_user: true,
          primary_department: true,
          primary_position: true,
        },
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    if (leaveRequest.status !== LeaveStatusEnum.RETURNED_FOR_CORRECTION) {
      throw new BadRequestException(
        'Only leave requests returned for correction can be resubmitted',
      );
    }

    const normalizedStartDate = normalizeDateInput(
      leaveRequest.start_date,
      'start_date',
    );
    const normalizedEndDate = normalizeDateInput(
      leaveRequest.end_date,
      'end_date',
    );
    leaveRequest.start_date = normalizedStartDate;
    leaveRequest.end_date = normalizedEndDate;

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );
    this.assertEmployeeCanRequestLeave(
      leaveRequest.employee,
      normalizedStartDate,
      normalizedEndDate,
    );

    const leaveType = await this.findLeaveTypeOrFail(
      companyId,
      leaveRequest.leave_type_id,
    );
    if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE) {
      throw new BadRequestException('Leave type is inactive');
    }

    this.assertDateOrder(
      normalizedStartDate,
      normalizedEndDate,
      'end_date cannot be before start_date',
    );

    await this.validateNoOverlap(
      companyId,
      leaveRequest.employee_id,
      normalizedStartDate,
      normalizedEndDate,
      leaveRequest.id,
    );

    const policyContext = await this.resolvePolicyContext(
      companyId,
      leaveRequest.employee,
      leaveRequest.leave_type_id,
    );

    if (
      policyContext.policy &&
      !policyContext.policy.allow_during_probation &&
      [
        EmployeeConfirmationStatusEnum.PROBATION,
        EmployeeConfirmationStatusEnum.PROBATION_EXTENDED,
      ].includes(leaveRequest.employee.confirmation_status)
    ) {
      throw new BadRequestException(
        'Leave is not allowed during probation under the applicable leave policy.',
      );
    }

    const calculation = await this.calculateLeaveDuration({
      companyId,
      leaveTypeId: leaveRequest.leave_type_id,
      employee: leaveRequest.employee,
      policy: policyContext.policy,
      durationType:
        leaveRequest.duration_type ?? LeaveDurationTypeEnum.FULL_DAY,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      halfDaySession: leaveRequest.half_day_session,
      startTime: leaveRequest.start_time,
      endTime: leaveRequest.end_time,
    });
    const totalDays = calculation.totalDays;
    await this.recordNoticeOverride(
      companyId,
      leaveRequest,
      this.assertMinimumNotice(
        policyContext.policy,
        leaveRequest.employee,
        normalizedStartDate,
        actor,
        leaveRequest.notice_override_reason,
      ),
      actor,
    );
    if (
      policyContext.maxConsecutiveDays &&
      totalDays > policyContext.maxConsecutiveDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum consecutive days (${policyContext.maxConsecutiveDays})`,
      );
    }
    if (
      policyContext.maxPerRequestDays &&
      totalDays > policyContext.maxPerRequestDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum days per request (${policyContext.maxPerRequestDays})`,
      );
    }

    if (totalDays <= 0) {
      throw new BadRequestException(
        'Selected period results in zero leave days after holidays/weekends',
      );
    }

    const resubmitted = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const current = await repository.findOne({
        where: { id: leaveRequest.id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!current) {
        throw new NotFoundException('Leave request not found');
      }

      if (current.status !== LeaveStatusEnum.RETURNED_FOR_CORRECTION) {
        throw new BadRequestException(
          'Only leave requests returned for correction can be resubmitted',
        );
      }

      current.total_days = this.leaveBalanceService.toDecimal(totalDays);
      current.start_date = normalizedStartDate;
      current.end_date = normalizedEndDate;
      current.requested_minutes = calculation.requestedMinutes;
      current.calculation_snapshot = calculation.snapshot;
      current.calculation_hash = calculation.hash;
      current.calculation_version = (current.calculation_version ?? 0) + 1;
      current.approval_cycle += 1;
      await repository.save(current);

      await this.submitLeaveRequestRecord(
        companyId,
        current,
        leaveRequest.employee,
        policyContext,
        actor,
        manager,
      );

      return repository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      });
    });

    if (
      resubmitted.current_approval_level > 0 &&
      [
        LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        LeaveStatusEnum.PENDING_HR,
      ].includes(resubmitted.status)
    ) {
      await this.emitLeaveSubmitted(
        companyId,
        resubmitted,
        leaveRequest.employee,
        actor,
        this.dataSource.manager,
      );
    }

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: resubmitted.id,
      action: 'leave_request.resubmitted',
      entity_name: 'leave_request',
      entity_id: resubmitted.id,
      actor,
      payload: {
        status: resubmitted.status,
        approval_cycle: resubmitted.approval_cycle,
      },
    });
    await this.leaveActingAssignmentService?.syncAfterCommit(resubmitted.id);

    return this.mapLeaveRequest(resubmitted);
  }

  /**
   * Ends approved leave early: the request is shortened to `newEndDate`, only
   * the dates after it are returned to the balance, and attendance is
   * recalculated for the returned dates. Owner or approver.
   */
  async endLeaveEarly(
    companyId: number,
    leaveRequestId: number,
    dto: { new_end_date: string; reason?: string | null },
    actor: AuthenticatedUser,
  ) {
    const existing = await this.leaveRequestRepository.findOne({
      where: { id: leaveRequestId, company_id: companyId },
      relations: { employee: true },
    });
    if (!existing) throw new NotFoundException('Leave request not found');
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      existing.employee,
    );
    const isApprover = hasPermission(
      actor.permissions,
      'leave_requests:approve',
    );
    if (!this.isOwnLeaveRequest(existing.employee, actor) && !isApprover) {
      throw new ForbiddenException(
        'Only the employee or an authorised approver can end this leave early.',
      );
    }
    const newEnd = normalizeDateInput(dto.new_end_date, 'new_end_date');
    const employee = existing.employee;

    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const request = await repository.findOne({
        where: { id: leaveRequestId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Leave request not found');
      if (request.status !== LeaveStatusEnum.APPROVED) {
        throw new BadRequestException('Only approved leave can be ended early');
      }
      const start = normalizeDateInput(request.start_date, 'start_date');
      const oldEnd = normalizeDateInput(request.end_date, 'end_date');
      if (newEnd < start || newEnd >= oldEnd) {
        throw new BadRequestException(
          `The new last day must be between ${start} and the day before ${oldEnd}.`,
        );
      }
      if (
        (request.duration_type ?? LeaveDurationTypeEnum.FULL_DAY) !==
        LeaveDurationTypeEnum.FULL_DAY
      ) {
        throw new BadRequestException(
          'Only full-day leave can be ended early; cancel half-day or short leave instead.',
        );
      }

      const snapshot = (request.calculation_snapshot ?? {}) as {
        included_dates?: unknown;
        duration_type?: string;
      };
      const included = Array.isArray(snapshot.included_dates)
        ? snapshot.included_dates.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const kept = included.filter((date) => date <= newEnd);
      const removed = included.filter((date) => date > newEnd);
      if (!included.length || !removed.length) {
        throw new BadRequestException(
          'No leave days fall after the new last day, so nothing changes.',
        );
      }

      const yearOf = await this.balanceYearMapper(
        companyId,
        request.employee_id,
        request.leave_type_id,
      );
      const years = [...new Set(removed.map(yearOf))];
      const balances: LeaveBalance[] = [];
      for (const year of years) {
        balances.push(
          ...(await this.leaveBalanceService.ensureBalancesForEmployeeYear(
            companyId,
            employee,
            year,
            manager,
            request.leave_type_id,
            true,
          )),
        );
      }
      await this.leaveBalanceLedgerService.reverseApprovedLeaveByYear(
        balances,
        {
          companyId,
          employeeId: employee.id,
          leaveTypeId: request.leave_type_id,
          leaveYear: years[0],
          effectiveDate: new Date().toISOString().slice(0, 10),
          days: removed.length,
          leaveRequestId: request.id,
          createdByCompanyUserId: actor.companyMembershipId ?? null,
          reason: `Leave ended early on ${newEnd}; unused days returned`,
          metadata: {
            leave_request_status: LeaveStatusEnum.APPROVED,
            calculation_snapshot: {
              ...snapshot,
              included_dates: removed,
            },
            previous_end_date: oldEnd,
            new_end_date: newEnd,
          },
          onClosedYear: this.closedYearRefundHandler(
            manager,
            companyId,
            employee,
            request.leave_type_id,
            request.id,
            actor,
          ),
          idempotencyKey: `leave-request:${request.id}:end-early:${newEnd}`,
        },
        manager,
      );

      request.end_date = newEnd;
      request.total_days = this.leaveBalanceService.toDecimal(kept.length);
      request.calculation_snapshot = {
        ...snapshot,
        included_dates: kept,
        ended_early: {
          previous_end_date: oldEnd,
          returned_dates: removed,
          reason: dto.reason?.trim() || null,
        },
      } as LeaveRequest['calculation_snapshot'];
      request.calculation_version = (request.calculation_version ?? 0) + 1;
      const saved = await repository.save(request);

      const nextDay = new Date(Date.parse(`${newEnd}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      await this.queueAttendanceRecalculationForLeaveWindow(
        companyId,
        saved.employee_id,
        nextDay,
        oldEnd,
        'Leave ended early',
        actor,
        manager,
      );
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: saved.id,
          action: 'leave_request.ended_early',
          entity_name: 'leave_request',
          entity_id: saved.id,
          actor,
          payload: {
            previous_end_date: oldEnd,
            new_end_date: newEnd,
            returned_days: removed.length,
            reason: dto.reason ?? null,
          },
        },
        manager,
      );
      return { saved, returned: removed.length };
    });

    emitLeaveLifecycle(this.eventEmitter, {
      companyId,
      eventKey: 'leave.end_early',
      title: 'Leave ended early',
      message: `Leave request ${result.saved.leave_no || `#${result.saved.id}`} now ends on ${newEnd}; ${result.returned} day(s) were returned to the balance.`,
      employeeId: result.saved.employee_id,
      notifyHr: true,
      senderCompanyUserId: actor.companyMembershipId ?? null,
      entityType: 'LEAVE_REQUEST',
      entityId: result.saved.id,
      actionUrl: '/dashboard/leave-management',
      dedupeKey: `leave-request:${result.saved.id}:end-early:${newEnd}`,
    });
    // Early return: the acting assignment ends with the leave.
    await this.leaveActingAssignmentService?.syncAfterCommit(result.saved.id);
    return {
      message: `Leave shortened to ${newEnd}; ${result.returned} day(s) returned to the balance.`,
      returned_days: result.returned,
      data: this.mapLeaveRequest(
        await this.leaveRequestRepository.findOneOrFail({
          where: { id: result.saved.id },
          relations: {
            employee: { primary_department: true, primary_position: true },
            leave_type: true,
            approvals: { approver: { user: true }, workflow_step: true },
            medical_detail: true,
            documents: { uploaded_by: { user: true } },
          },
        }),
      ),
    };
  }

  /**
   * One decision applied to several requests. Each runs the normal approval
   * path (assignment, stage, self-approval and balance checks) in its own
   * transaction; failures are reported per request and do not stop the rest.
   */
  async bulkApprovalAction(
    companyId: number,
    dto: BulkLeaveApprovalActionDto,
    actor: AuthenticatedUser,
  ) {
    const results: Array<{
      id: number;
      ok: boolean;
      status?: string;
      error?: string;
    }> = [];
    for (const id of [...new Set(dto.ids)]) {
      try {
        const updated = (await this.approveLeaveRequest(
          companyId,
          id,
          {
            action: dto.action,
            comments: dto.comments,
            signature: dto.signature,
          },
          actor,
        )) as { status?: string };
        results.push({ id, ok: true, status: updated?.status });
      } catch (error) {
        results.push({
          id,
          ok: false,
          error: error instanceof Error ? error.message : 'Failed',
        });
      }
    }
    return {
      processed: results.length,
      succeeded: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      results,
    };
  }

  /**
   * Builds the filtered leave request query shared by the list and its
   * status counts. Visibility is decided here, server-side:
   * - pending_my_approval only matches a PENDING approval assigned to the
   *   caller at the request's ACTIVE level and cycle, so approvers at later
   *   levels never see a request before its earlier levels are complete;
   * - my_approval_history only matches approvals the caller has decided;
   * - all/mine keep the existing data-scope rules.
   */
  private async buildLeaveRequestListQuery(
    companyId: number,
    query: LeaveRequestQueryDto,
    actor: AuthenticatedUser,
    options: { withRelations: boolean; ignoreStatus?: boolean },
  ) {
    const view: LeaveRequestView = query.view ?? 'all';
    const {
      search,
      employee_id,
      leave_type_id,
      department_id,
      branch_id,
      manager_employee_id,
      approval_level,
      current_approver_company_user_id,
      from_date,
      to_date,
    } = query;
    const status = options.ignoreStatus ? undefined : query.status;

    let scopedEmployeeId: number | null = null;
    if (view === 'all') {
      if (!this.actorHasAnyPermission(actor, ['leave_requests:read'])) {
        throw new ForbiddenException(
          'You do not have permission to list leave requests.',
        );
      }
      scopedEmployeeId = await this.resolveScopedEmployeeId(
        companyId,
        employee_id,
        actor,
      );
      if (typeof scopedEmployeeId === 'number') {
        await this.assertCanAccessEmployeeById(
          companyId,
          scopedEmployeeId,
          actor,
        );
      }
    } else if (view === 'mine') {
      scopedEmployeeId = await this.resolveActorEmployeeIdOrFail(
        companyId,
        actor,
      );
    } else {
      if (!this.actorHasAnyPermission(actor, ['leave_requests:approve'])) {
        throw new ForbiddenException(
          'You do not have permission to approve leave requests.',
        );
      }
      if (!actor.companyMembershipId) {
        throw new ForbiddenException('Active company membership is required');
      }
    }

    const qb = this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .where('leaveRequest.company_id = :companyId', { companyId });
    if (options.withRelations) {
      qb.leftJoinAndSelect('leaveRequest.employee', 'employee')
        .leftJoinAndSelect('employee.company_user', 'membership')
        .leftJoinAndSelect('employee.primary_department', 'department')
        .leftJoinAndSelect('employee.primary_position', 'position')
        .leftJoinAndSelect('employee.primary_branch', 'branch')
        .leftJoinAndSelect('leaveRequest.leave_type', 'leaveType')
        .leftJoinAndSelect('leaveRequest.approvals', 'approvals')
        .leftJoinAndSelect('approvals.approver', 'approvalMembership')
        .leftJoinAndSelect('approvalMembership.user', 'approvalUser')
        .leftJoinAndSelect('approvals.workflow_step', 'workflowStep');
    } else {
      qb.leftJoin('leaveRequest.employee', 'employee').leftJoin(
        'employee.primary_department',
        'department',
      );
    }

    const activePendingFor = (param: string) =>
      `EXISTS (SELECT 1 FROM leave_request_approvals lra
        WHERE lra.leave_request_id = "leaveRequest"."id"
          AND lra.approver_company_user_id = :${param}
          AND lra.status = 'pending'
          AND lra.approval_level = "leaveRequest"."current_approval_level"
          AND lra.approval_cycle = "leaveRequest"."approval_cycle")`;

    if (view === 'pending_my_approval') {
      qb.andWhere(activePendingFor('viewerMembershipId'), {
        viewerMembershipId: actor.companyMembershipId,
      })
        .andWhere('leaveRequest.status IN (:...openStatuses)', {
          openStatuses: LEAVE_AWAITING_DECISION_STATUSES,
        })
        .andWhere('leaveRequest.routing_required = false')
        .andWhere(
          '(employee.company_user_id IS NULL OR employee.company_user_id <> :viewerMembershipId)',
          { viewerMembershipId: actor.companyMembershipId },
        );
    } else if (view === 'my_approval_history') {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM leave_request_approvals lrh
          WHERE lrh.leave_request_id = "leaveRequest"."id"
            AND lrh.approver_company_user_id = :viewerMembershipId
            AND lrh.acted_at IS NOT NULL
            AND lrh.status IN ('approved', 'rejected', 'returned'))`,
        { viewerMembershipId: actor.companyMembershipId },
      );
    }

    if (status?.trim() === 'pending') {
      qb.andWhere('leaveRequest.status IN (:...pendingStatuses)', {
        pendingStatuses: LEAVE_AWAITING_DECISION_STATUSES,
      });
    } else if (status?.trim() === 'open') {
      qb.andWhere('leaveRequest.status IN (:...openGroup)', {
        openGroup: LEAVE_OPEN_STATUSES,
      });
    } else if (status?.trim()) {
      qb.andWhere('leaveRequest.status = :status', { status: status.trim() });
    }
    if (typeof department_id === 'number') {
      qb.andWhere('employee.primary_department_id = :departmentId', {
        departmentId: department_id,
      });
    }
    if (typeof branch_id === 'number') {
      qb.andWhere('employee.primary_branch_id = :branchId', {
        branchId: branch_id,
      });
    }
    if (typeof manager_employee_id === 'number') {
      qb.andWhere(
        `(${reportingManagerSql('employee')} = :managerEmployeeId OR department.manager_employee_id = :managerEmployeeId)`,
        { managerEmployeeId: manager_employee_id },
      );
    }
    if (typeof scopedEmployeeId === 'number') {
      qb.andWhere('leaveRequest.employee_id = :employeeId', {
        employeeId: scopedEmployeeId,
      });
    } else if (typeof employee_id === 'number' && view !== 'all') {
      qb.andWhere('leaveRequest.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    }
    if (typeof leave_type_id === 'number') {
      qb.andWhere('leaveRequest.leave_type_id = :leaveTypeId', {
        leaveTypeId: leave_type_id,
      });
    }
    if (typeof approval_level === 'number') {
      qb.andWhere('leaveRequest.current_approval_level = :approvalLevel', {
        approvalLevel: approval_level,
      }).andWhere('leaveRequest.status IN (:...levelStatuses)', {
        levelStatuses: LEAVE_AWAITING_DECISION_STATUSES,
      });
    }
    if (typeof current_approver_company_user_id === 'number') {
      qb.andWhere(activePendingFor('currentApproverId'), {
        currentApproverId: current_approver_company_user_id,
      });
    }
    // Date filters match any leave overlapping the chosen period.
    if (from_date) {
      qb.andWhere('leaveRequest.end_date >= :fromDate', {
        fromDate: from_date,
      });
    }
    if (to_date) {
      qb.andWhere('leaveRequest.start_date <= :toDate', { toDate: to_date });
    }
    if (search?.trim()) {
      qb.andWhere(
        `(leaveRequest.leave_no ILIKE :term OR employee.employee_no ILIKE :term
          OR CONCAT(employee.first_name, ' ', employee.last_name) ILIKE :term)`,
        {
          term: `%${search.trim()}%`,
        },
      );
    }
    return qb;
  }

  async findAllLeaveRequests(
    companyId: number,
    query: LeaveRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder } = query;
    const qb = await this.buildLeaveRequestListQuery(companyId, query, actor, {
      withRelations: true,
    });

    const allowedSortFields = [
      'id',
      'leave_no',
      'start_date',
      'end_date',
      'total_days',
      'status',
      'created_at',
      'updated_at',
      'applied_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`leaveRequest.${safeSortBy}`, direction)
      .addOrderBy('leaveRequest.id', direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapLeaveRequest(item, actor)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  /**
   * Status-group counts for the same view and filters as the list (the
   * status filter itself is ignored so every tab shows its own count), plus
   * how many requests are waiting on the caller at their active level.
   */
  async summarizeLeaveRequests(
    companyId: number,
    query: LeaveRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const qb = await this.buildLeaveRequestListQuery(companyId, query, actor, {
      withRelations: false,
      ignoreStatus: true,
    });
    const rows = await qb
      .select('leaveRequest.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('leaveRequest.status')
      .getRawMany<{ status: LeaveStatusEnum; count: string }>();
    const byStatus = Object.fromEntries(
      rows.map((row) => [row.status, Number(row.count)]),
    ) as Partial<Record<LeaveStatusEnum, number>>;
    const sum = (statuses: LeaveStatusEnum[]) =>
      statuses.reduce((total, s) => total + (byStatus[s] ?? 0), 0);

    let pendingMyApproval: number | null = null;
    if (
      actor.companyMembershipId &&
      this.actorHasAnyPermission(actor, ['leave_requests:approve'])
    ) {
      const pendingQb = await this.buildLeaveRequestListQuery(
        companyId,
        {
          ...query,
          view: 'pending_my_approval',
          status: undefined,
        } as LeaveRequestQueryDto,
        actor,
        { withRelations: false, ignoreStatus: true },
      );
      pendingMyApproval = await pendingQb.getCount();
    }

    return {
      total: rows.reduce((total, row) => total + Number(row.count), 0),
      open: sum(LEAVE_OPEN_STATUSES),
      awaiting_decision: sum(LEAVE_AWAITING_DECISION_STATUSES),
      draft: byStatus[LeaveStatusEnum.DRAFT] ?? 0,
      approved: byStatus[LeaveStatusEnum.APPROVED] ?? 0,
      rejected: byStatus[LeaveStatusEnum.REJECTED] ?? 0,
      cancelled: byStatus[LeaveStatusEnum.CANCELLED] ?? 0,
      pending_my_approval: pendingMyApproval,
    };
  }

  async findTeamLeaveCalendar(
    companyId: number,
    query: LeaveTeamCalendarQueryDto,
    actor: AuthenticatedUser,
  ) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (
      !datePattern.test(query.from_date) ||
      !datePattern.test(query.to_date)
    ) {
      throw new BadRequestException('Calendar dates must use YYYY-MM-DD.');
    }
    const fromTime = Date.parse(`${query.from_date}T00:00:00.000Z`);
    const toTime = Date.parse(`${query.to_date}T00:00:00.000Z`);
    const inclusiveRangeDays = Math.floor((toTime - fromTime) / 86400000) + 1;
    if (
      !Number.isFinite(fromTime) ||
      !Number.isFinite(toTime) ||
      new Date(fromTime).toISOString().slice(0, 10) !== query.from_date ||
      new Date(toTime).toISOString().slice(0, 10) !== query.to_date ||
      inclusiveRangeDays < 1 ||
      inclusiveRangeDays > 93
    ) {
      throw new BadRequestException(
        'Choose a valid date range of no more than 93 days.',
      );
    }

    const managerEmployee = actor.employeeId
      ? await this.employeeRepository.findOne({
          where: { id: actor.employeeId, company_id: companyId },
          select: ['id', 'company_id'],
        })
      : actor.companyMembershipId
        ? await this.employeeRepository.findOne({
            where: {
              company_user_id: actor.companyMembershipId,
              company_id: companyId,
            },
            select: ['id', 'company_id'],
          })
        : null;
    if (!managerEmployee) {
      throw new ForbiddenException(
        'A linked employee profile is required to view a team leave calendar.',
      );
    }

    const managedDepartments = await this.departmentRepository.find({
      where: {
        company_id: companyId,
        manager_employee_id: managerEmployee.id,
        status: 'active',
      },
      select: ['id'],
    });
    const departmentIds = managedDepartments.map((department) => department.id);
    const directReports = await this.employeeRepository.find({
      where: { company_id: companyId, reports_to: managerEmployee.id },
      select: ['id'],
    });
    const departmentMembers = departmentIds.length
      ? await this.employeeRepository.find({
          where: {
            company_id: companyId,
            primary_department_id: In(departmentIds),
          },
          select: ['id'],
        })
      : [];
    const assignedDepartmentMembers = departmentIds.length
      ? await this.employeeRepository
          .createQueryBuilder('employee')
          .innerJoin('employee.department_assignments', 'departmentAssignment')
          .where('employee.company_id = :companyId', { companyId })
          .andWhere(
            'departmentAssignment.department_id IN (:...departmentIds)',
            {
              departmentIds,
            },
          )
          .select('employee.id', 'id')
          .getRawMany<{ id: number }>()
      : [];
    const teamEmployeeIds = [
      ...new Set(
        [...directReports, ...departmentMembers, ...assignedDepartmentMembers]
          .map((employee) => employee.id)
          .filter((employeeId) => employeeId !== managerEmployee.id),
      ),
    ];

    if (!teamEmployeeIds.length) {
      return {
        data: [],
        meta: {
          team_member_count: 0,
          from_date: query.from_date,
          to_date: query.to_date,
        },
      };
    }

    const rows = await this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .innerJoin('leaveRequest.employee', 'employee')
      .innerJoin('leaveRequest.leave_type', 'leaveType')
      .select('leaveRequest.id', 'request_id')
      .addSelect('leaveRequest.employee_id', 'employee_id')
      .addSelect('employee.first_name', 'first_name')
      .addSelect('employee.preferred_name', 'preferred_name')
      .addSelect('employee.last_name', 'last_name')
      .addSelect('leaveType.name', 'leave_type_name')
      .addSelect('leaveRequest.start_date', 'start_date')
      .addSelect('leaveRequest.end_date', 'end_date')
      .addSelect('leaveRequest.total_days', 'total_days')
      .addSelect('leaveRequest.duration_type', 'duration_type')
      .addSelect('leaveRequest.status', 'status')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('employee.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id IN (:...teamEmployeeIds)', {
        teamEmployeeIds,
      })
      .andWhere(
        'leaveRequest.start_date <= :toDate AND leaveRequest.end_date >= :fromDate',
        { fromDate: query.from_date, toDate: query.to_date },
      )
      .andWhere('leaveRequest.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
          LeaveStatusEnum.IN_REVIEW,
          LeaveStatusEnum.APPROVED,
        ],
      })
      .orderBy('leaveRequest.start_date', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .addOrderBy('employee.first_name', 'ASC')
      .getRawMany<{
        request_id: number;
        employee_id: number;
        first_name: string;
        preferred_name: string | null;
        last_name: string;
        leave_type_name: string;
        start_date: string;
        end_date: string;
        total_days: string;
        duration_type: LeaveDurationTypeEnum;
        status: LeaveStatusEnum;
      }>();

    return {
      data: rows.map((row) => ({
        request_id: Number(row.request_id),
        employee_id: Number(row.employee_id),
        employee_name: [row.preferred_name || row.first_name, row.last_name]
          .filter(Boolean)
          .join(' '),
        leave_type: row.leave_type_name,
        start_date: row.start_date,
        end_date: row.end_date,
        total_days: Number(row.total_days),
        duration_type: row.duration_type,
        status: row.status,
      })),
      meta: {
        team_member_count: teamEmployeeIds.length,
        from_date: query.from_date,
        to_date: query.to_date,
      },
    };
  }

  async findMyLeaveRequests(
    companyId: number,
    query: LeaveRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveActorEmployeeIdOrFail(
      companyId,
      actor,
    );

    return this.findAllLeaveRequests(
      companyId,
      {
        ...query,
        view: 'mine',
        employee_id: employeeId,
      },
      actor,
    );
  }

  async findOneLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          primary_department: true,
          primary_position: true,
          company_user: true,
        },
        leave_type: true,
        approvals: { approver: { user: true }, workflow_step: true },
        medical_detail: true,
        documents: { uploaded_by: { user: true } },
      },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    const isOwnEmployee =
      typeof actor.companyMembershipId === 'number' &&
      leaveRequest.employee.company_user_id === actor.companyMembershipId;

    if (!isOwnEmployee && !this.isReachedApprover(leaveRequest, actor)) {
      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        leaveRequest.employee,
      );
    }

    return this.mapLeaveRequest(leaveRequest, actor);
  }

  /**
   * Approves a request the system finds still pending after its leave type's
   * auto_approve_after_days. Re-checked under lock; returns false when the
   * request no longer qualifies. Remaining approvers are marked skipped.
   */
  async autoApproveOverdueRequest(
    leaveRequestId: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const locked = await repository.findOne({
        where: { id: leaveRequestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || !AUTO_APPROVABLE_STATUSES.includes(locked.status)) {
        return null;
      }
      const request = await repository.findOneOrFail({
        where: { id: leaveRequestId },
        relations: { leave_type: true },
      });
      const after = request.leave_type?.auto_approve_after_days;
      const appliedAt = request.applied_at ?? request.created_at;
      if (
        !after ||
        request.routing_required ||
        !appliedAt ||
        now.getTime() - new Date(appliedAt).getTime() < after * 86_400_000
      ) {
        return null;
      }
      const companyId = request.company_id;
      const employee = await this.findEmployeeOrFail(
        companyId,
        request.employee_id,
      );
      const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
        request.start_date,
      );
      const snapshot = request.calculation_snapshot as {
        included_dates?: unknown;
      } | null;
      const yearOf = await this.balanceYearMapper(
        companyId,
        request.employee_id,
        request.leave_type_id,
      );
      const balanceYears = Array.isArray(snapshot?.included_dates)
        ? [
            ...new Set(
              snapshot.included_dates
                .filter((date): date is string => typeof date === 'string')
                .map(yearOf),
            ),
          ].sort()
        : [yearOf(String(request.start_date))];
      const balances: LeaveBalance[] = [];
      for (const year of balanceYears) {
        balances.push(
          ...(await this.leaveBalanceService.ensureBalancesForEmployeeYear(
            companyId,
            employee,
            year,
            manager,
            request.leave_type_id,
            true,
          )),
        );
      }

      const previousStatus = request.status;
      const previousLevel = request.current_approval_level;
      await manager.getRepository(LeaveRequestApproval).update(
        {
          leave_request_id: request.id,
          approval_cycle: request.approval_cycle,
          status: LeaveApprovalStatusEnum.PENDING,
        },
        {
          status: LeaveApprovalStatusEnum.SKIPPED,
          comments: `Auto-approved by the system after ${after} day(s) without a decision`,
        },
      );
      request.status = LeaveStatusEnum.APPROVED;
      request.approved_at = now;
      request.current_approval_level = 0;
      const saved = await repository.save(request);

      await this.leaveBalanceLedgerService.consumeReservedLeaveByYear(
        balances,
        {
          companyId,
          employeeId: employee.id,
          leaveTypeId: request.leave_type_id,
          leaveYear: fiscalYear,
          effectiveDate: now.toISOString().slice(0, 10),
          days: this.leaveBalanceService.toNumber(request.total_days),
          leaveRequestId: request.id,
          createdByCompanyUserId: null,
          reason: `Leave request auto-approved after ${after} day(s) pending; reserved days consumed`,
          metadata: {
            leave_request_status: LeaveStatusEnum.APPROVED,
            calculation_snapshot: request.calculation_snapshot,
            auto_approved: true,
          },
          idempotencyKey: `leave-request:${request.id}:cycle:${request.approval_cycle}:approve`,
        },
        manager,
      );
      await this.queueAttendanceRecalculationForLeaveWindow(
        companyId,
        employee.id,
        request.start_date,
        request.end_date,
        'Leave request auto-approved after waiting period',
        { companyMembershipId: null } as unknown as AuthenticatedUser,
        manager,
      );
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: request.id,
          action: 'leave_request.auto_approved',
          entity_name: 'leave_request',
          entity_id: request.id,
          actor: undefined,
          payload: {
            previous_status: previousStatus,
            previous_approval_level: previousLevel,
            auto_approve_after_days: after,
            applied_at: appliedAt,
          },
        },
        manager,
      );
      return saved;
    });
    if (!result) return false;
    await this.leaveWorkflowService.notifyCommittedOutcome(
      result,
      'Approved automatically after the waiting period',
      null,
    );
    await this.leaveActingAssignmentService?.syncAfterCommit(result.id);
    return true;
  }

  async approveLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    dto: LeaveApprovalActionDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const membershipId = actor.companyMembershipId!;
    // Approve = sign: every human decision carries the approver's signature
    // (typed or drawn), recorded in the same transaction as the decision.
    parseSignatureMark(dto.signature);
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: { id: leaveRequestId, company_id: companyId },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    const employee = await this.findEmployeeOrFail(
      companyId,
      leaveRequest.employee_id,
    );
    if (dto.hr_override) {
      if (!hasPermission(actor.permissions, 'leave_requests:override'))
        throw new ForbiddenException(
          'You are not allowed to act in place of the manager.',
        );
      if ((dto.comments?.trim().length ?? 0) < 5)
        throw new BadRequestException(
          'Give a reason for acting in place of the manager.',
        );
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }

    let actingResult:
      | Awaited<ReturnType<LeaveActingAssignmentService['assign']>>
      | undefined;
    const updated = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(LeaveRequest).findOneOrFail({
        where: { id: leaveRequest.id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      const approvalFiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
        leaveRequest.start_date,
      );
      const approvalSnapshot = leaveRequest.calculation_snapshot as {
        included_dates?: unknown;
      } | null;
      const yearOf = await this.balanceYearMapper(
        companyId,
        leaveRequest.employee_id,
        leaveRequest.leave_type_id,
      );
      const balanceYears = Array.isArray(approvalSnapshot?.included_dates)
        ? [
            ...new Set(
              approvalSnapshot.included_dates
                .filter((date): date is string => typeof date === 'string')
                .map(yearOf),
            ),
          ].sort()
        : [yearOf(String(leaveRequest.start_date))];
      const totalDays = this.leaveBalanceService.toNumber(
        leaveRequest.total_days,
      );
      // Refresh and lock balances while the request is still pending. Doing
      // this after the status change counted the days as used twice (once by
      // the recalculation, once by the ledger consume below).
      const balances: LeaveBalance[] = [];
      for (const year of balanceYears) {
        balances.push(
          ...(await this.leaveBalanceService.ensureBalancesForEmployeeYear(
            companyId,
            employee,
            year,
            manager,
            leaveRequest.leave_type_id,
            true,
          )),
        );
      }

      const updatedRequest =
        await this.leaveWorkflowService.applyApprovalAction(
          leaveRequest.id,
          membershipId,
          dto,
          manager,
        );

      const cycle = updatedRequest.approval_cycle;

      // Acting employee appointed with the recommendation / approval: same
      // transaction, so a failed appointment also rolls back the decision.
      if (dto.acting_assignment) {
        if (dto.action !== LeaveApprovalActionEnum.APPROVE)
          throw new BadRequestException(
            'An acting employee can only be appointed when recommending or approving.',
          );
        if (!this.leaveActingAssignmentService)
          throw new ConflictException('Acting assignments are unavailable.');
        actingResult = await this.leaveActingAssignmentService.assign(
          companyId,
          leaveRequest.id,
          dto.acting_assignment,
          actor,
          manager,
        );
      }

      if (updatedRequest.status === LeaveStatusEnum.APPROVED) {
        await this.leaveBalanceLedgerService.consumeReservedLeaveByYear(
          balances,
          {
            companyId,
            employeeId: employee.id,
            leaveTypeId: leaveRequest.leave_type_id,
            leaveYear: approvalFiscalYear,
            effectiveDate:
              updatedRequest.approved_at?.toISOString().slice(0, 10) ??
              new Date().toISOString().slice(0, 10),
            days: totalDays,
            leaveRequestId: leaveRequest.id,
            createdByCompanyUserId: membershipId,
            reason: 'Leave request approved and reserved days consumed',
            metadata: {
              leave_request_status: LeaveStatusEnum.APPROVED,
              calculation_snapshot: updatedRequest.calculation_snapshot,
            },
            idempotencyKey: `leave-request:${leaveRequest.id}:cycle:${cycle}:approve`,
          },
          manager,
        );
      } else if (updatedRequest.status === LeaveStatusEnum.REJECTED) {
        await this.leaveBalanceLedgerService.releaseReservedLeaveByYear(
          balances,
          {
            companyId,
            employeeId: employee.id,
            leaveTypeId: leaveRequest.leave_type_id,
            leaveYear: approvalFiscalYear,
            effectiveDate: new Date().toISOString().slice(0, 10),
            days: totalDays,
            leaveRequestId: leaveRequest.id,
            createdByCompanyUserId: membershipId,
            reason: 'Leave request rejected and reserved days released',
            metadata: {
              leave_request_status: LeaveStatusEnum.REJECTED,
              calculation_snapshot: updatedRequest.calculation_snapshot,
            },
            idempotencyKey: `leave-request:${leaveRequest.id}:cycle:${cycle}:reject-release`,
          },
          manager,
        );
      } else if (
        updatedRequest.status === LeaveStatusEnum.RETURNED_FOR_CORRECTION
      ) {
        await this.leaveBalanceLedgerService.releaseReservedLeaveByYear(
          balances,
          {
            companyId,
            employeeId: employee.id,
            leaveTypeId: leaveRequest.leave_type_id,
            leaveYear: approvalFiscalYear,
            effectiveDate: new Date().toISOString().slice(0, 10),
            days: totalDays,
            leaveRequestId: leaveRequest.id,
            createdByCompanyUserId: membershipId,
            reason:
              'Leave request returned for correction and reserved days released',
            metadata: {
              leave_request_status: LeaveStatusEnum.RETURNED_FOR_CORRECTION,
              calculation_snapshot: updatedRequest.calculation_snapshot,
            },
            idempotencyKey: `leave-request:${leaveRequest.id}:cycle:${cycle}:return-release`,
          },
          manager,
        );
      }

      if (updatedRequest.status === LeaveStatusEnum.APPROVED) {
        await this.queueAttendanceRecalculationForLeaveWindow(
          companyId,
          updatedRequest.employee_id,
          updatedRequest.start_date,
          updatedRequest.end_date,
          'Leave request approved',
          actor,
          manager,
        );
      }

      // Sign the stage this actor just decided (same transaction).
      const decided = (
        await manager.getRepository(LeaveRequestApproval).find({
          where: {
            leave_request_id: leaveRequest.id,
            approver_company_user_id: membershipId,
          },
          order: { acted_at: 'DESC', id: 'DESC' },
        })
      ).find((approval) => approval.acted_at);
      if (!decided)
        throw new ConflictException(
          'Your decision was not recorded on an approval stage; nothing was signed.',
        );
      await new LeaveSignatureService(
        this.dataSource,
        this.leaveAuditService,
      ).signApproval(
        companyId,
        leaveRequest.id,
        decided.id,
        actor,
        true,
        {},
        dto.signature,
        manager,
      );

      // Same transaction as the decision so an approval is never unaudited.
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: updatedRequest.id,
          action: `leave_request.${dto.action}`,
          entity_name: 'leave_request',
          entity_id: updatedRequest.id,
          actor,
          payload: {
            status: updatedRequest.status,
            current_approval_level: updatedRequest.current_approval_level,
          },
        },
        manager,
      );

      return manager.getRepository(LeaveRequest).findOneOrFail({
        where: { id: leaveRequest.id },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      });
    });

    if (dto.hr_override)
      await this.leaveAuditService.log({
        company_id: companyId,
        leave_request_id: updated.id,
        action: 'leave_request.hr_override',
        entity_name: 'leave_request',
        entity_id: updated.id,
        actor,
        payload: {
          decision: dto.action,
          reason: dto.comments?.trim() ?? null,
          resulting_status: updated.status,
        },
      });

    await this.leaveWorkflowService.notifyCommittedOutcome(
      updated,
      dto.comments ?? null,
      membershipId,
    );
    if (actingResult)
      this.leaveActingAssignmentService?.notifyAssigned(actingResult, actor);
    // Approval / rejection / return moves any acting assignment along.
    await this.leaveActingAssignmentService?.syncAfterCommit(updated.id);

    return this.mapLeaveRequest(updated, actor);
  }

  /**
   * Owners may cancel their own unapproved requests. Cancelling approved leave
   * is limited by the policy cutoff, by "cancellation requires approval", and
   * by the start date; those cases fall to approvers (HR / in-scope managers),
   * who may cancel any open request with an audit entry.
   */
  private async assertCanCancelLeaveRequest(
    companyId: number,
    leaveRequest: LeaveRequest,
    employee: Employee,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const isApprover = hasPermission(
      actor.permissions,
      'leave_requests:approve',
    );
    if (!this.isOwnLeaveRequest(employee, actor)) {
      if (!isApprover) {
        throw new ForbiddenException(
          'Only the employee or an authorised approver can cancel this leave request.',
        );
      }
      return;
    }
    if (leaveRequest.status !== LeaveStatusEnum.APPROVED || isApprover) {
      return;
    }

    const startDate = normalizeDateInput(leaveRequest.start_date, 'start_date');
    if (this.daysUntil(startDate) <= 0) {
      throw new BadRequestException(
        'This leave has already started. Ask HR to cancel or shorten it.',
      );
    }
    const { policy } = await this.resolvePolicyContext(
      companyId,
      employee,
      leaveRequest.leave_type_id,
    );
    if (policy?.cancellation_requires_approval) {
      throw new BadRequestException(
        'Approved leave under this policy can only be cancelled by HR or your approver.',
      );
    }
    const cutoffDays = policy?.cancellation_cutoff_days ?? 0;
    if (cutoffDays > 0 && this.daysUntil(startDate) < cutoffDays) {
      throw new BadRequestException(
        `Approved leave cannot be cancelled less than ${cutoffDays} day(s) before it starts. Ask HR to cancel it.`,
      );
    }
  }

  async cancelLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    dto: CancelLeaveRequestDto,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: { employee: { company_user: true } },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );

    if (
      leaveRequest.status === LeaveStatusEnum.CANCELLED ||
      leaveRequest.status === LeaveStatusEnum.REJECTED
    ) {
      throw new BadRequestException('Leave request is already closed');
    }

    const employee = await this.findEmployeeOrFail(
      companyId,
      leaveRequest.employee_id,
    );
    await this.assertCanCancelLeaveRequest(
      companyId,
      leaveRequest,
      employee,
      actor,
    );

    const { request: cancelled, pendingApprovers } =
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(LeaveRequest);
        const leaveRequest = await repository.findOne({
          where: { id: leaveRequestId, company_id: companyId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!leaveRequest)
          throw new NotFoundException('Leave request not found');
        if (
          [LeaveStatusEnum.CANCELLED, LeaveStatusEnum.REJECTED].includes(
            leaveRequest.status,
          )
        )
          throw new BadRequestException('Leave request is already closed');
        const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
          leaveRequest.start_date,
        );
        const snapshot = leaveRequest.calculation_snapshot as {
          included_dates?: unknown;
        } | null;
        const yearOf = await this.balanceYearMapper(
          companyId,
          leaveRequest.employee_id,
          leaveRequest.leave_type_id,
        );
        const years = Array.isArray(snapshot?.included_dates)
          ? [
              ...new Set(
                snapshot.included_dates
                  .filter((date): date is string => typeof date === 'string')
                  .map(yearOf),
              ),
            ].sort()
          : [yearOf(String(leaveRequest.start_date))];
        const pendingApprovals = await manager
          .getRepository(LeaveRequestApproval)
          .find({
            where: {
              leave_request_id: leaveRequestId,
              approval_cycle: leaveRequest.approval_cycle,
              approval_level: leaveRequest.current_approval_level,
              status: LeaveApprovalStatusEnum.PENDING,
            },
            relations: { approver: { user: true } },
          });
        const pendingApprovers: NotificationRecipient[] =
          pendingApprovals.flatMap((approval) => {
            const recipient = buildNotificationRecipient(
              approval.approver?.user,
              {
                companyUserId: approval.approver?.id,
              },
            );
            return recipient ? [recipient] : [];
          });

        const balances: LeaveBalance[] = [];
        for (const year of years) {
          balances.push(
            ...(await this.leaveBalanceService.ensureBalancesForEmployeeYear(
              companyId,
              employee,
              year,
              manager,
              leaveRequest.leave_type_id,
              true,
            )),
          );
        }

        const cycle = leaveRequest.approval_cycle;
        const requestDays = this.leaveBalanceService.toNumber(
          leaveRequest.total_days,
        );
        const requestMetadata = {
          leave_request_status: LeaveStatusEnum.CANCELLED,
          calculation_snapshot: leaveRequest.calculation_snapshot,
        };

        if (
          leaveRequest.status === LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER ||
          leaveRequest.status === LeaveStatusEnum.PENDING_HR ||
          leaveRequest.status === LeaveStatusEnum.IN_REVIEW
        ) {
          await this.leaveBalanceLedgerService.releaseReservedLeaveByYear(
            balances,
            {
              companyId,
              employeeId: employee.id,
              leaveTypeId: leaveRequest.leave_type_id,
              leaveYear: fiscalYear,
              effectiveDate: new Date().toISOString().slice(0, 10),
              days: requestDays,
              leaveRequestId: leaveRequest.id,
              createdByCompanyUserId: actor.companyMembershipId ?? null,
              reason: 'Cancelled leave request released reserved days',
              metadata: requestMetadata,
              idempotencyKey: `leave-request:${leaveRequest.id}:cycle:${cycle}:cancel-pending`,
            },
            manager,
          );
        } else if (leaveRequest.status === LeaveStatusEnum.APPROVED) {
          await this.leaveBalanceLedgerService.reverseApprovedLeaveByYear(
            balances,
            {
              companyId,
              employeeId: employee.id,
              leaveTypeId: leaveRequest.leave_type_id,
              leaveYear: fiscalYear,
              effectiveDate: new Date().toISOString().slice(0, 10),
              days: requestDays,
              leaveRequestId: leaveRequest.id,
              createdByCompanyUserId: actor.companyMembershipId ?? null,
              reason: 'Cancelled approved leave reversed used days',
              metadata: requestMetadata,
              idempotencyKey: `leave-request:${leaveRequest.id}:cycle:${cycle}:cancel-approved`,
              onClosedYear: this.closedYearRefundHandler(
                manager,
                companyId,
                employee,
                leaveRequest.leave_type_id,
                leaveRequest.id,
                actor,
              ),
            },
            manager,
          );
        }

        await this.leaveWorkflowService.closeAllPendingApprovals(
          leaveRequest.id,
          'Skipped after leave cancellation',
          manager,
        );

        leaveRequest.status = LeaveStatusEnum.CANCELLED;
        leaveRequest.routing_required = false;
        leaveRequest.cancelled_at = new Date();
        leaveRequest.rejection_reason = dto.reason?.trim() || null;
        const savedRequest = await repository.save(leaveRequest);
        await this.queueAttendanceRecalculationForLeaveWindow(
          companyId,
          savedRequest.employee_id,
          savedRequest.start_date,
          savedRequest.end_date,
          'Leave request cancelled',
          actor,
          manager,
        );
        return {
          request: savedRequest,
          pendingApprovers,
        };
      });

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: cancelled.id,
      action: 'leave_request.cancelled',
      entity_name: 'leave_request',
      entity_id: cancelled.id,
      actor,
      payload: { reason: dto.reason ?? null },
    });

    await this.emitLeaveCancelled(
      cancelled,
      employee,
      pendingApprovers,
      actor.companyMembershipId ?? null,
    );
    await this.leaveActingAssignmentService?.syncAfterCommit(cancelled.id);

    return {
      message: 'Leave request cancelled successfully',
    };
  }

  async extendEvidenceDeadline(
    companyId: number,
    id: number,
    dto: ExtendLeaveEvidenceDto,
    actor: AuthenticatedUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveRequest);
      const request = await repo.findOne({
        where: { id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Leave request not found');
      await this.assertEvidenceAdministrator(request, actor, manager);
      const due = new Date(dto.evidence_due_at);
      if (
        !dto.reason.trim() ||
        !request.evidence_due_at ||
        request.evidence_received_at ||
        [LeaveStatusEnum.REJECTED, LeaveStatusEnum.CANCELLED].includes(
          request.status,
        ) ||
        !Number.isFinite(due.getTime()) ||
        due <= new Date() ||
        due <= new Date(request.evidence_due_at)
      ) {
        throw new BadRequestException(
          'Provide a reason and a future deadline later than the current deadline for outstanding evidence',
        );
      }
      const previous = request.evidence_due_at;
      request.evidence_due_at = due;
      request.evidence_last_reminder_at = null;
      await repo.save(request);
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: id,
          entity_name: 'leave_request',
          entity_id: id,
          action: 'leave_request.evidence_deadline_extended',
          actor,
          payload: {
            previous,
            evidence_due_at: due,
            reason: dto.reason.trim(),
          },
        },
        manager,
      );
      return this.mapLeaveRequest(request);
    });
  }

  private async assertEvidenceAdministrator(
    request: LeaveRequest,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const employee = await manager.getRepository(Employee).findOneOrFail({
      where: { id: request.employee_id, company_id: request.company_id },
    });
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    const hrIds =
      await this.leaveWorkflowService.resolveHrApproverMembershipIds(
        request.company_id,
        request.leave_type_id,
        manager,
      );
    if (
      employee.company_user_id === actor.companyMembershipId ||
      !hrIds.includes(actor.companyMembershipId!)
    ) {
      throw new ForbiddenException(
        'Only an assigned HR reviewer can manage leave evidence or routing',
      );
    }
  }

  async retryLeaveRouting(
    companyId: number,
    id: number,
    actor: AuthenticatedUser,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveRequest);
      const request = await repo.findOne({
        where: { id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Leave request not found');
      await this.assertEvidenceAdministrator(request, actor, manager);
      if (
        !request.routing_required ||
        request.status !== LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER
      ) {
        throw new BadRequestException(
          'This request is not awaiting routing correction',
        );
      }
      const employee = await manager.getRepository(Employee).findOneOrFail({
        where: { id: request.employee_id, company_id: companyId },
        relations: { company_user: { user: true } },
      });
      await manager.getRepository(LeaveRequestApproval).delete({
        leave_request_id: id,
        approval_cycle: request.approval_cycle,
      });
      await this.leaveWorkflowService.initializeWorkflowForRequest(
        companyId,
        request,
        employee,
        manager,
      );
      if (request.routing_required)
        throw new BadRequestException(
          'Assign an eligible department manager or reporting manager before retrying routing',
        );
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: id,
          entity_name: 'leave_request',
          entity_id: id,
          action: 'leave_request.routing_corrected',
          actor,
        },
        manager,
      );
      return { request, employee };
    });
    await this.emitLeaveSubmitted(
      companyId,
      result.request,
      result.employee,
      actor,
      this.dataSource.manager,
    );
    return this.findOneLeaveRequest(companyId, id, actor);
  }

  async addLeaveDocument(
    companyId: number,
    leaveRequestId: number,
    dto: AddLeaveDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: { employee: { company_user: true } },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );
    const storedFile = await this.filesService.savePrivateBase64File(dto.file, {
      directorySegments: ['documents', 'leave', `company-${companyId}`],
      fileNamePrefix: `leave-${leaveRequestId}`,
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES],
      maxFileSizeBytes: HR_PRIVATE_DOCUMENT_MAX_BYTES,
      validateFileSignature: true,
    });

    const document = await this.leaveDocumentRepository.save(
      this.leaveDocumentRepository.create({
        leave_request_id: leaveRequest.id,
        file_url: storedFile.publicPath,
        file_name: storedFile.originalFileName,
        file_type: storedFile.mimeType,
        uploaded_by_company_user_id: actor.companyMembershipId!,
      }),
    );

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.document_added',
      entity_name: 'leave_document',
      entity_id: document.id,
      actor,
      payload: {
        file_name: document.file_name,
        file_type: document.file_type,
      },
    });

    await this.leaveRequestRepository.update(
      { id: leaveRequestId, company_id: companyId },
      { evidence_received_at: document.uploaded_at ?? new Date() },
    );

    return {
      ...document,
      file_url:
        `/api/leave/requests/${leaveRequest.id}` +
        `/documents/${document.id}/download`,
    };
  }

  async downloadLeaveDocument(
    companyId: number,
    leaveRequestId: number,
    documentId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          company_user: true,
        },
        leave_type: true,
        approvals: true,
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );

    // Certificates on medical leave carry the diagnosis: besides the
    // employee and HR, only someone on this request's approval chain may
    // open them (to check the evidence before deciding).
    if (
      /sick|medical|hospital/i.test(
        `${leaveRequest.leave_type?.name ?? ''} ${leaveRequest.leave_type?.code ?? ''}`,
      ) &&
      !this.canViewClinicalDetail(actor, leaveRequest.employee) &&
      !(leaveRequest.approvals ?? []).some(
        (approval) =>
          approval.approver_company_user_id === actor.companyMembershipId,
      )
    ) {
      throw new ForbiddenException(
        'Medical documents are restricted to the employee, HR and the approvers of this request.',
      );
    }

    const document = await this.leaveDocumentRepository.findOne({
      where: {
        id: documentId,
        leave_request_id: leaveRequest.id,
      },
    });

    if (!document) {
      throw new NotFoundException('Leave document not found');
    }

    const buffer = await this.filesService.readManagedFile(document.file_url);

    if (!buffer) {
      throw new NotFoundException(
        'Leave document file was not found in storage',
      );
    }

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.document_downloaded',
      entity_name: 'leave_document',
      entity_id: document.id,
      actor,
      payload: {
        file_name: document.file_name,
      },
    });

    return {
      buffer,
      fileName: document.file_name,
      mimeType: document.file_type || 'application/octet-stream',
    };
  }

  async upsertMedicalDetail(
    companyId: number,
    leaveRequestId: number,
    dto: UpsertLeaveMedicalDetailDto,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: { employee: { company_user: true } },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );
    // Whoever cannot read clinical detail must not be able to write it.
    if (!this.canViewClinicalDetail(actor, leaveRequest.employee)) {
      throw new ForbiddenException(
        'Medical details can be recorded only by the employee or HR.',
      );
    }

    if (dto.treatment_start_date && dto.treatment_end_date) {
      this.assertDateOrder(
        dto.treatment_start_date,
        dto.treatment_end_date,
        'treatment_end_date cannot be before treatment_start_date',
      );
    }

    let medical = await this.leaveMedicalDetailRepository.findOne({
      where: { leave_request_id: leaveRequest.id },
    });
    if (!medical) {
      medical = this.leaveMedicalDetailRepository.create({
        leave_request_id: leaveRequest.id,
      });
    }

    if (dto.sickness_nature !== undefined) {
      medical.sickness_nature = this.normalizeOptionalString(
        dto.sickness_nature,
      );
    }
    if (dto.doctor_name !== undefined) {
      medical.doctor_name = this.normalizeOptionalString(dto.doctor_name);
    }
    if (dto.doctor_phone !== undefined) {
      medical.doctor_phone = this.normalizeOptionalString(dto.doctor_phone);
    }
    if (dto.hospital_name !== undefined) {
      medical.hospital_name = this.normalizeOptionalString(dto.hospital_name);
    }
    if (dto.treatment_start_date !== undefined) {
      medical.treatment_start_date = dto.treatment_start_date ?? null;
    }
    if (dto.treatment_end_date !== undefined) {
      medical.treatment_end_date = dto.treatment_end_date ?? null;
    }
    if (dto.attachment_url !== undefined) {
      medical.attachment_url = this.normalizeOptionalString(dto.attachment_url);
    }

    const saved = await this.leaveMedicalDetailRepository.save(medical);

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.medical_detail_upserted',
      entity_name: 'leave_medical_detail',
      entity_id: saved.id,
      actor,
    });

    return saved;
  }

  /** HR view of a request's QR code: active or not, and past revocations. */
  async getVerificationCodeState(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: { id: leaveRequestId, company_id: companyId },
      relations: { employee: true },
    });
    if (!leaveRequest) throw new NotFoundException('Leave request not found');
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );
    return this.leaveVerificationService.getCodeState(leaveRequest.id);
  }

  /**
   * Withdraws the QR verification code printed on this request's PDFs.
   * Scanning an old copy then shows "revoked"; the next download gets a new
   * code. The leave request itself is not changed.
   */
  async revokeVerificationCode(
    companyId: number,
    leaveRequestId: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: { id: leaveRequestId, company_id: companyId },
      relations: { employee: true },
    });
    if (!leaveRequest) throw new NotFoundException('Leave request not found');
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('Give a reason of at least 5 characters.');
    }
    await this.dataSource.transaction(async (manager) => {
      const revocation = await this.leaveVerificationService.revoke(manager, {
        companyId,
        leaveRequestId: leaveRequest.id,
        reason: trimmed,
        userId: actor.id ?? null,
      });
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: leaveRequest.id,
          action: 'leave_request.verification_revoked',
          entity_name: 'leave_request',
          entity_id: leaveRequest.id,
          actor,
          payload: { reason: trimmed, revocation_id: revocation.id },
        },
        manager,
      );
    });
    return this.leaveVerificationService.getCodeState(leaveRequest.id);
  }

  /** Accrual explanation per current balance (HR view and self-service). */
  getAccrualSummary(companyId: number, employeeId: number) {
    return this.leaveBalanceService.accrualSummary(companyId, employeeId);
  }

  /**
   * Leave Application Form PDF. Read-only: builds the view model from the
   * saved request, its workflow records and the balance ledger, then hands it
   * to LeavePdfService for layout. Nothing on the request is modified (the
   * QR verification token is created once, as before, if missing).
   */
  async getLeaveRequestPdf(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
    options: { attachments?: 'include' | 'exclude' } = {},
  ): Promise<{ buffer: Buffer; filename: string }> {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        company: true,
        medical_detail: true,
        employee: {
          primary_department: true,
          primary_position: true,
          primary_branch: true,
          manager: true,
          company_user: true,
        },
        leave_type: true,
        documents: true,
        approvals: {
          approver: { user: true, employee: { primary_position: true } },
          workflow_step: { role: true, position: true },
        },
      },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );

    // Everything below reads independent data: fetch it concurrently
    // (was ~6 sequential round trips after the request itself).
    const pdfApprovalsForDelegation = leaveRequest.approvals.filter(
      (approval) =>
        (approval.approval_cycle ?? 1) === (leaveRequest.approval_cycle ?? 1),
    );
    const delegatorIdsEarly = [
      ...new Set(
        pdfApprovalsForDelegation
          .map(
            (a) =>
              a.comments?.match(
                /Delegated approver acting for company user #(\d+);?\s*/,
              )?.[1],
          )
          .filter((id): id is string => !!id)
          .map(Number),
      ),
    ];
    const earlyLogoUrl = (() => {
      const value = (leaveRequest.company.metadata ?? {})['logo_url'];
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    })();
    const [
      { yearOf, fiscalYear, balance },
      prefetchedLogo,
      prefetchedToken,
      prefetchedDelegators,
      prefetchedResumption,
      prefetchedSignatures,
    ] = await Promise.all([
      (async () => {
        const mapper = await this.balanceYearMapper(
          companyId,
          leaveRequest.employee_id,
          leaveRequest.leave_type_id,
        );
        const year = mapper(String(leaveRequest.start_date));
        const row = await this.leaveBalanceRepository.findOne({
          where: {
            employee_id: leaveRequest.employee_id,
            leave_type_id: leaveRequest.leave_type_id,
            fiscal_year: year,
          },
        });
        return { yearOf: mapper, fiscalYear: year, balance: row };
      })(),
      earlyLogoUrl ? this.readCompanyLogoCached(earlyLogoUrl) : null,
      this.leaveVerificationService.ensureToken(leaveRequest.id),
      delegatorIdsEarly.length
        ? this.companyUserRepository.find({
            where: { id: In(delegatorIdsEarly), company_id: companyId },
            relations: { user: true },
          })
        : Promise.resolve([]),
      leaveRequest.duration_type === LeaveDurationTypeEnum.FULL_DAY
        ? this.findResumptionDate(
            companyId,
            leaveRequest.employee,
            String(leaveRequest.end_date),
          )
        : Promise.resolve(null),
      new LeaveSignatureService(this.dataSource, this.leaveAuditService).list(
        companyId,
        leaveRequest.id,
      ),
    ]);

    // Available days already net out pending + approved-future reservations,
    // so "before" = available + this request only while the request holds a
    // reservation against this one balance (active status, single year).
    const snapshotDates = (
      leaveRequest.calculation_snapshot as { included_dates?: unknown } | null
    )?.included_dates;
    const spansSingleYear =
      !Array.isArray(snapshotDates) ||
      snapshotDates.every((date) => yearOf(String(date)) === fiscalYear);
    const holdsReservation = [
      LeaveStatusEnum.SUBMITTED,
      LeaveStatusEnum.IN_REVIEW,
      LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
      LeaveStatusEnum.PENDING_HR,
      LeaveStatusEnum.APPROVED,
    ].includes(leaveRequest.status);
    const availableDays = balance
      ? this.leaveBalanceService.calculateAvailableDays(balance)
      : 0;
    const requestedDays = this.leaveBalanceService.toNumber(
      leaveRequest.total_days,
    );
    const releasedStatuses: LeaveStatusEnum[] = [
      LeaveStatusEnum.REJECTED,
      LeaveStatusEnum.CANCELLED,
    ];
    const balanceMode: LeavePdfBalance['mode'] = !spansSingleYear
      ? 'split'
      : holdsReservation
        ? 'reserved'
        : releasedStatuses.includes(leaveRequest.status)
          ? 'released'
          : 'projected';
    const n = (value: string | null | undefined) =>
      this.leaveBalanceService.toNumber(value ?? '0');
    // Section C: leave taken before this request starts (never this request
    // or later leave), and adjustments split into deductions / credits.
    const [takenBeforeDays, adjustmentBreakdown] = balance
      ? await Promise.all([
          this.leaveBalanceService.summarizeTakenBefore(
            balance,
            String(leaveRequest.start_date),
            leaveRequest.id,
          ),
          this.leaveBalanceService.summarizeAdjustmentBreakdown(balance),
        ])
      : [0, { deductionDays: 0, creditDays: 0 }];

    // Only the current approval cycle; earlier cycles were superseded by a
    // return-for-correction and resubmission.
    const currentCycle = leaveRequest.approval_cycle ?? 1;
    const approvals = leaveRequest.approvals
      .filter((approval) => (approval.approval_cycle ?? 1) === currentCycle)
      .sort((a, b) => a.approval_level - b.approval_level || a.id - b.id);

    const metadata = leaveRequest.company.metadata ?? {};
    const metaString = (...keys: string[]): string | null => {
      for (const key of keys) {
        const value = metadata[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return null;
    };
    const logoUrl = metaString('logo_url');
    const companyLogo = logoUrl ? prefetchedLogo : null;
    const manager = leaveRequest.employee.manager;
    const verificationToken = prefetchedToken;

    const verificationUrl =
      this.leaveVerificationService.buildVerificationUrl(verificationToken);

    // Approvers acting under an out-of-office delegation carry a system note
    // naming the delegator; show the delegator by name instead.
    const delegationPattern =
      /Delegated approver acting for company user #(\d+);?\s*/;
    const delegatorIds = [
      ...new Set(
        approvals
          .map((a) => a.comments?.match(delegationPattern)?.[1])
          .filter((id): id is string => !!id)
          .map(Number),
      ),
    ];
    const delegators = delegatorIds.length ? prefetchedDelegators : [];
    const delegatorName = new Map(
      delegators.map((cu) => [
        cu.id,
        cu.user ? `${cu.user.first_name} ${cu.user.last_name}` : null,
      ]),
    );

    const clinical = this.canViewClinicalDetail(actor, leaveRequest.employee);
    const medicalDetail = leaveRequest.medical_detail;
    const isMedicalType = /sick|medical|hospital/i.test(
      `${leaveRequest.leave_type.name} ${leaveRequest.leave_type.code}`,
    );
    const documents = leaveRequest.documents ?? [];
    const resumptionDate = prefetchedResumption;

    // Recorded e-signatures (never inferred from submission or approval).
    const signatures = prefetchedSignatures;
    // Drawn signature images and recorded reasons that only live in the
    // audit trail (evidence deadline extensions), for the remarks page.
    const [drawnImages, evidenceExtensions] = await Promise.all([
      new LeaveSignatureService(this.dataSource, this.leaveAuditService)
        .drawnImages(companyId, leaveRequest.id)
        .catch(() => new Map<number, Buffer>()),
      this.dataSource
        .query<Array<{ reason: string | null; created_at: Date }>>(
          `SELECT payload ->> 'reason' AS reason, created_at FROM leave_audit_logs
            WHERE company_id = $1 AND leave_request_id = $2
              AND action = 'leave_request.evidence_deadline_extended'
            ORDER BY id`,
          [companyId, leaveRequest.id],
        )
        .catch((): Array<{ reason: string | null; created_at: Date }> => []),
    ]);
    const asPdfSignature = (s: SignatureView | undefined) =>
      s
        ? {
            signer_name: s.signer_name,
            signed_at: s.signed_at,
            reference: s.reference,
            valid: s.valid,
            kind: s.kind,
            typed_text: s.typed_text,
            image: drawnImages.get(s.id) ?? null,
          }
        : null;
    const endedEarly = (
      leaveRequest.calculation_snapshot as {
        ended_early?: { previous_end_date?: string; reason?: string | null };
      } | null
    )?.ended_early;
    const employeeSignature =
      signatures.filter((s) => s.role === 'EMPLOYEE').find((s) => s.valid) ??
      [...signatures].reverse().find((s) => s.role === 'EMPLOYEE');

    // Acting employee (cancelled / replaced assignments are not printed).
    const acting = this.leaveActingAssignmentService
      ? await this.leaveActingAssignmentService
          .currentForLeave(companyId, leaveRequest.id)
          .catch(() => null)
      : null;

    // Supporting documents: medical ones follow the same rule as their
    // download (employee, HR, or an approver of this request).
    const mayOpenDocuments =
      !isMedicalType ||
      clinical ||
      (leaveRequest.approvals ?? []).some(
        (approval) =>
          approval.approver_company_user_id === actor.companyMembershipId,
      );
    const orderedDocuments = [...documents].sort(
      (a, b) =>
        new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime() ||
        a.id - b.id,
    );
    const includeDocuments =
      options.attachments !== 'exclude' && mayOpenDocuments;
    let prepared: PreparedSupporting[] = [];
    if (includeDocuments && orderedDocuments.length) {
      const sources: SupportingSource[] = await Promise.all(
        orderedDocuments.map(async (document) => ({
          id: document.id,
          file_name: document.file_name,
          mime_type: document.file_type,
          buffer: await this.filesService
            .readManagedFile(document.file_url)
            .catch(() => null),
        })),
      );
      try {
        prepared = await prepareSupportingDocuments(
          sources,
          leaveRequest.leave_no,
        );
      } catch (error) {
        if (error instanceof SupportingDocumentError) {
          await this.leaveAuditService.log({
            company_id: companyId,
            leave_request_id: leaveRequest.id,
            action: 'leave_request.pdf_attachment_failed',
            entity_name: 'leave_request',
            entity_id: leaveRequest.id,
            actor,
            payload: { failures: error.failures },
          });
          throw new UnprocessableEntityException({
            message: `${error.message}. Download the form without attachments, or re-upload the document.`,
            code: 'LEAVE_PDF_ATTACHMENT_FAILED',
            failures: error.failures,
          });
        }
        throw error;
      }
    }
    const preparedById = new Map(prepared.map((item) => [item.id, item]));
    const attachmentRows = (
      ranges: Map<number, { from: number; to: number }>,
    ): LeavePdfAttachment[] =>
      orderedDocuments.map((document) => {
        const item = preparedById.get(document.id);
        const range = ranges.get(document.id);
        return {
          file_name: document.file_name,
          uploaded_at: document.uploaded_at,
          disposition: !includeDocuments
            ? options.attachments === 'exclude'
              ? null
              : 'withheld'
            : (item?.disposition ?? null),
          page_from: range?.from ?? null,
          page_to: range?.to ?? null,
        };
      });
    const appendedPages = prepared
      .filter((item) => item.disposition === 'appended')
      .reduce((sum, item) => sum + item.page_count, 0);

    const payload: LeavePdfPayload = {
      acting_employee: acting?.acting_employee
        ? {
            name: acting.acting_employee.name,
            employee_no: acting.acting_employee.employee_no,
            department_name: acting.acting_employee.department_name,
            position_name: acting.acting_employee.position_name,
            start_date: String(acting.start_date),
            end_date: String(acting.end_date),
            status: acting.status,
            responsibilities: acting.responsibilities,
            appointed_by_name: acting.appointed_by
              ? [acting.appointed_by.name, acting.appointed_by.position_name]
                  .filter(Boolean)
                  .join(', ')
              : null,
          }
        : null,
      appended_page_count: appendedPages,
      employee_signature: asPdfSignature(employeeSignature),
      verification_url: verificationUrl,
      company_name: leaveRequest.company.name,
      company_logo: companyLogo,
      company_address: metaString('address', 'company_address'),
      company_phone: metaString('phone', 'company_phone'),
      company_email: metaString('email', 'company_email'),
      company_website: metaString('website'),
      timezone:
        metaString('timezone') ??
        this.configService.get<string>('APP_TIMEZONE') ??
        'Africa/Dar_es_Salaam',
      leave_no: leaveRequest.leave_no,
      employee_no: leaveRequest.employee.employee_no,
      employee_name: this.buildEmployeeName(leaveRequest.employee),
      department_name: leaveRequest.employee.primary_department?.name ?? null,
      position_name: leaveRequest.employee.primary_position?.name ?? null,
      branch_name: leaveRequest.employee.primary_branch?.name ?? null,
      reporting_manager_name: manager ? this.buildEmployeeName(manager) : null,
      employment_type: leaveRequest.employee.employment_type ?? null,
      hire_date: leaveRequest.employee.hire_date ?? null,
      resumption_date: resumptionDate,
      notice_override_reason: leaveRequest.notice_override_reason,
      evidence_required: leaveRequest.evidence_required,
      evidence_received_at: leaveRequest.evidence_received_at,
      // Medical section: sick / medical leave types only.
      medical: isMedicalType
        ? {
            sickness_nature: clinical
              ? (medicalDetail?.sickness_nature ?? null)
              : null,
            doctor_name: clinical ? (medicalDetail?.doctor_name ?? null) : null,
            doctor_phone: clinical
              ? (medicalDetail?.doctor_phone ?? null)
              : null,
            hospital_name: clinical
              ? (medicalDetail?.hospital_name ?? null)
              : null,
            treatment_start_date: medicalDetail?.treatment_start_date ?? null,
            treatment_end_date: medicalDetail?.treatment_end_date ?? null,
            // Only the certificate's presence is printed, never its link.
            certificate_status: medicalDetail?.attachment_url
              ? 'Attached'
              : documents.length
                ? 'Supporting document(s) on file - see section B'
                : 'Not attached',
          }
        : null,
      leave_type_name: leaveRequest.leave_type.name,
      is_paid: leaveRequest.leave_type.is_paid,
      start_date: leaveRequest.start_date,
      end_date: leaveRequest.end_date,
      total_days: leaveRequest.total_days,
      duration_type: leaveRequest.duration_type,
      half_day_session: leaveRequest.half_day_session,
      start_time: leaveRequest.start_time,
      end_time: leaveRequest.end_time,
      reason: leaveRequest.reason,
      status: leaveRequest.status,
      current_approval_level: leaveRequest.current_approval_level,
      applied_at: leaveRequest.applied_at,
      approved_at: leaveRequest.approved_at,
      cancelled_at: leaveRequest.cancelled_at,
      rejection_reason: leaveRequest.rejection_reason,
      returned_at: leaveRequest.returned_at,
      return_reason: leaveRequest.return_reason,
      // Figures come from the balance ledger as stored (same formula as the
      // HRMS balance screens); the request is added back / deducted once,
      // depending on whether it currently holds a reservation.
      current_balance: balance
        ? {
            fiscal_year: balance.fiscal_year,
            leave_year_start_date: balance.leave_year_start_date,
            leave_year_end_date: balance.leave_year_end_date,
            entitlement_days:
              n(balance.entitlement_days) > 0
                ? balance.entitlement_days
                : balance.allocated_days,
            opening_balance_days: (n(balance.opening_balance_days)
              ? n(balance.opening_balance_days)
              : n(balance.carried_forward_days)
            ).toFixed(2),
            accrued_days: balance.accrued_days,
            used_days: balance.used_days,
            taken_before_days: takenBeforeDays.toFixed(2),
            pending_days: balance.pending_days,
            approved_future_days: balance.approved_future_days,
            other_deduction_days: adjustmentBreakdown.deductionDays.toFixed(2),
            credit_days: adjustmentBreakdown.creditDays.toFixed(2),
            available_days: availableDays.toFixed(2),
            mode: balanceMode,
            before_days:
              balanceMode === 'reserved'
                ? (availableDays + requestedDays).toFixed(2)
                : balanceMode === 'projected'
                  ? availableDays.toFixed(2)
                  : null,
            after_days:
              balanceMode === 'reserved'
                ? availableDays.toFixed(2)
                : balanceMode === 'projected'
                  ? (availableDays - requestedDays).toFixed(2)
                  : null,
          }
        : null,
      approval_history: approvals.map((approval) => ({
        level: approval.approval_level,
        step_label:
          approval.workflow_step?.role?.name ??
          approval.workflow_step?.position?.name ??
          null,
        action: approval.workflow_step?.action_type ?? 'review',
        status: approval.status,
        approver_name: approval.approver?.user
          ? `${approval.approver.user.first_name} ${approval.approver.user.last_name}`
          : null,
        approver_designation:
          approval.approver?.employee?.primary_position?.name ?? null,
        delegated_for_name: (() => {
          const id = approval.comments?.match(delegationPattern)?.[1];
          return id ? (delegatorName.get(Number(id)) ?? null) : null;
        })(),
        comments:
          approval.comments?.replace(delegationPattern, '').trim() || null,
        acted_at: approval.acted_at,
        signature_url: approval.signature_url,
        signature: asPdfSignature(
          signatures.find((s) => s.approval_id === approval.id),
        ),
      })),
      attachments: attachmentRows(new Map()),
      extra_remarks: [
        ...(endedEarly
          ? [
              {
                label: `Ended early (originally to ${String(endedEarly.previous_end_date ?? '').slice(0, 10)})`,
                text: endedEarly.reason?.trim() || 'No reason recorded',
              },
            ]
          : []),
        ...evidenceExtensions.map((row) => ({
          label: `Evidence deadline extended (${new Date(row.created_at).toISOString().slice(0, 10)})`,
          text: row.reason?.trim() || 'No reason recorded',
        })),
      ],
    };

    // Page numbers of the attachments depend on the form length (and can
    // change it by a line): render until stable (normally twice).
    let form = await this.leavePdfService.generateLeaveFormPdf(payload);
    if (appendedPages) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const formPages = (await PDFLibDocument.load(form)).getPageCount();
        const rows = attachmentRows(assignPageRanges(prepared, formPages));
        const same =
          JSON.stringify(rows.map((r) => [r.page_from, r.page_to])) ===
          JSON.stringify(
            (payload.attachments ?? []).map((r) => [r.page_from, r.page_to]),
          );
        if (same) break;
        payload.attachments = rows;
        form = await this.leavePdfService.generateLeaveFormPdf(payload);
      }
    }
    const safeRef = leaveRequest.leave_no.replace(/[^A-Za-z0-9_-]+/g, '-');
    const pdf = appendedPages
      ? await mergeLeavePdf(
          form,
          prepared,
          leaveRequest.leave_no,
          `Leave Application ${leaveRequest.leave_no} (complete)`,
        )
      : form;

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.pdf_generated',
      entity_name: 'leave_request',
      entity_id: leaveRequest.id,
      actor,
      payload: {
        attachments: options.attachments ?? 'include',
        appended_document_ids: prepared
          .filter((item) => item.disposition === 'appended')
          .map((item) => item.id),
        withheld: includeDocuments ? 0 : orderedDocuments.length,
        acting_assignment_id: acting?.id ?? null,
      },
    });

    return {
      buffer: pdf,
      filename: appendedPages
        ? `Leave_Application_${safeRef}_Complete.pdf`
        : `Leave_Application_${safeRef}.pdf`,
    };
  }

  /**
   * First working day after the leave, using the same calendar as leave
   * duration (employee schedule, company + branch holidays). Read-only;
   * null when it cannot be determined within three weeks.
   */
  /**
   * Company logo bytes for PDFs, cached in memory for 10 minutes per URL.
   * A changed logo has a new managed-file URL, so the cache cannot serve a
   * stale image for a new logo; at worst an overwritten file shows for 10
   * minutes.
   */
  private static readonly logoCache = new Map<
    string,
    { at: number; data: Awaited<ReturnType<FilesService['readManagedFile']>> }
  >();

  private async readCompanyLogoCached(url: string) {
    const hit = LeaveService.logoCache.get(url);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
    const data = await this.filesService.readManagedFile(url);
    if (LeaveService.logoCache.size > 200) LeaveService.logoCache.clear();
    LeaveService.logoCache.set(url, { at: Date.now(), data });
    return data;
  }

  private async findResumptionDate(
    companyId: number,
    employee: Employee,
    endDate: string,
  ): Promise<string | null> {
    const addDays = (date: string, days: number) =>
      new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * 86400000)
        .toISOString()
        .slice(0, 10);
    try {
      const result = await this.leaveDurationCalculatorService.calculate({
        companyId,
        employee,
        policy: null,
        durationType: LeaveDurationTypeEnum.FULL_DAY,
        startDate: addDays(endDate, 1),
        endDate: addDays(endDate, 21),
      });
      return result.snapshot.included_dates[0] ?? null;
    } catch {
      return null;
    }
  }

  private async emitLeaveSubmitted(
    companyId: number,
    leaveRequest: LeaveRequest,
    employee: Employee,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    try {
      const initialApprovals = await manager
        .getRepository(LeaveRequestApproval)
        .find({
          where: {
            leave_request_id: leaveRequest.id,
            approval_level: leaveRequest.current_approval_level ?? 1,
            approval_cycle: leaveRequest.approval_cycle,
            status: LeaveApprovalStatusEnum.PENDING,
          },
          relations: { approver: { user: true } },
        });

      const approvers: NotificationRecipient[] = initialApprovals.flatMap(
        (approval) => {
          const recipient = buildNotificationRecipient(
            approval.approver?.user,
            {
              companyUserId: approval.approver?.id,
            },
          );
          return recipient ? [recipient] : [];
        },
      );

      if (!approvers.length) return;

      const leaveType = await this.dataSource
        .getRepository(LeaveType)
        .findOne({ where: { id: leaveRequest.leave_type_id } });

      const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;

      this.eventEmitter.emit(
        LeaveSubmittedEvent.EVENT,
        new LeaveSubmittedEvent(
          companyId,
          `${employee.first_name} ${employee.last_name}`,
          employee.company_user?.user?.email ?? '',
          leaveType?.name ?? `Leave #${leaveRequest.leave_type_id}`,
          leaveRequest.start_date,
          leaveRequest.end_date,
          Number(leaveRequest.total_days),
          leaveRequest.reason ?? null,
          approvers,
          `${frontendUrl}/dashboard/leave-management/requests?highlight=${leaveRequest.id}`,
          leaveRequest.id,
          actor.companyMembershipId ?? null,
          employee.company_user?.id ?? null,
          leaveRequest.approval_cycle,
        ),
      );
    } catch {
      // never block submit on notification failure
    }
  }

  private async emitLeaveCancelled(
    leaveRequest: LeaveRequest,
    employee: Employee,
    pendingApprovers: NotificationRecipient[],
    senderCompanyUserId: number | null,
  ): Promise<void> {
    try {
      if (!pendingApprovers.length) return;

      const leaveType = await this.dataSource
        .getRepository(LeaveType)
        .findOne({ where: { id: leaveRequest.leave_type_id } });

      this.eventEmitter.emit(
        LeaveCancelledEvent.EVENT,
        new LeaveCancelledEvent(
          `${employee.first_name} ${employee.last_name}`,
          leaveType?.name ?? `Leave #${leaveRequest.leave_type_id}`,
          leaveRequest.start_date,
          leaveRequest.end_date,
          pendingApprovers,
          leaveRequest.id,
          leaveRequest.company_id,
          senderCompanyUserId,
        ),
      );
    } catch {
      // never block cancel on notification failure
    }
  }
}
