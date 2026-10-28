import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../attendance/processing/enums/attendance-daily-status.enum';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../leave/enums/leave-status.enum';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OnboardingRequestStatusEnum } from '../onboarding/enums/onboarding-request-status.enum';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingRequestStatusEnum } from '../offboarding/enums/offboarding-request-status.enum';
import { OffboardingTypeEnum } from '../offboarding/enums/offboarding-type.enum';
import { ProbationService } from '../probation/probation.service';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { PayrollReportsService } from '../payroll/services/payroll-core.services';
import { DashboardDateService } from './dashboard-date.service';
import { DashboardQueryDto } from './dtos/dashboard-query.dto';
import {
  buildDashboardEmployeeSubquery,
  DashboardEmployeeSubquery,
} from './dashboard-employee-scope';
import { resolveCompanyAggregateAccess } from './dashboard-sensitive-access';
import { EmployeeDocumentRequirement } from './entities/employee-document-requirement.entity';
import { CreateEmployeeDocumentRequirementDto } from './dtos/employee-document-requirement.dto';
import { DashboardLeaveService } from './dashboard-leave.service';
import { EmployeeDocumentComplianceDrilldownQueryDto } from './dtos/employee-document-compliance-drilldown-query.dto';
import { isolateDashboardSource } from './dashboard-api-contract';

const CLOSED_ONBOARDING_STATUSES = [
  OnboardingRequestStatusEnum.COMPLETED,
  OnboardingRequestStatusEnum.REJECTED,
  OnboardingRequestStatusEnum.CANCELLED,
];

const CLOSED_OFFBOARDING_STATUSES = [
  OffboardingRequestStatusEnum.COMPLETED,
  OffboardingRequestStatusEnum.REJECTED,
  OffboardingRequestStatusEnum.CANCELLED,
];

@Injectable()
export class HrDashboardService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly dateService: DashboardDateService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(EmployeeDocumentRequirement)
    private readonly documentRequirementRepository: Repository<EmployeeDocumentRequirement>,
    @InjectRepository(OnboardingRequest)
    private readonly onboardingRequestRepository: Repository<OnboardingRequest>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRequestRepository: Repository<OffboardingRequest>,
    private readonly workActivityInsightsService: WorkActivityInsightsService,
    private readonly payrollReportsService: PayrollReportsService,
    private readonly probationService: ProbationService,
    private readonly actionItemsService: ActionItemsService,
    private readonly dashboardLeaveService: DashboardLeaveService,
  ) {}

  async getDashboard(actor: AuthenticatedUser, query: DashboardQueryDto) {
    const companyId = actor.companyId!;
    const period = await this.dateService.resolve(query, companyId);
    const accessScope =
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor);
    const scopedEmployees = buildDashboardEmployeeSubquery(
      companyId,
      query,
      accessScope,
    );
    const payrollAccess = resolveCompanyAggregateAccess(actor, query, [
      'payroll:reports',
      'payroll:runs:read',
    ]);

    const [
      workforceSummary,
      joiners,
      completedExitTypes,
      probationResult,
      attendance,
      employeesOnLeave,
      approvedLeaveDaysByTypeResult,
      pendingLeaveApprovals,
      assignedOpenActionItems,
      onboardingActive,
      offboardingActive,
      documentComplianceResult,
      manpower,
      workActivitySummaryResult,
      payrollSummaryResult,
    ] = await Promise.all([
      this.getWorkforceSummary(companyId, scopedEmployees),
      this.countJoiners(
        companyId,
        scopedEmployees,
        period.dateFrom,
        period.dateTo,
      ),
      this.countCompletedExitsByType(
        companyId,
        scopedEmployees,
        period.dateFrom,
        period.dateTo,
      ),
      isolateDashboardSource(
        'PROBATION',
        this.probationService.getDashboardSummary(actor, period.today, {
          ...(query.branch_id ? { branch_id: query.branch_id } : {}),
          ...(query.department_id
            ? { department_id: query.department_id }
            : {}),
          ...(query.employee_id ? { employee_id: query.employee_id } : {}),
        }),
        {
          total_on_probation: null,
          confirmation_due_30_days: null,
          overdue: null,
          pending_manager_review: null,
          pending_hr_review: null,
          extended_cases: null,
        },
      ),
      this.getAttendanceSummary(
        companyId,
        scopedEmployees,
        period.dateFrom,
        period.dateTo,
        period.today,
      ),
      this.countEmployeesOnLeave(companyId, scopedEmployees, period.today),
      isolateDashboardSource(
        'APPROVED_LEAVE_DAY_TREND',
        this.dashboardLeaveService.getApprovedLeaveDaysByType(
          companyId,
          scopedEmployees,
          period.dateFrom,
          period.dateTo,
        ),
        {
          available: false,
          reason: 'SOURCE_ERROR',
          unallocated_approved_requests: 0,
          items: [],
        },
      ),
      this.countPendingLeaveApprovals(companyId, scopedEmployees),
      actor.companyMembershipId
        ? this.actionItemsService.countOpen(
            companyId,
            actor.companyMembershipId,
          )
        : Promise.resolve(null),
      this.countOnboardingActive(companyId, scopedEmployees),
      this.countOffboardingActive(companyId, scopedEmployees),
      isolateDashboardSource(
        'DOCUMENT_COMPLIANCE',
        this.getDocumentInventory(companyId, scopedEmployees, period.today),
        {
          total_documents: null,
          verified_documents: null,
          unverified_documents: null,
          expired_documents: null,
          verified_expired_documents: null,
          expiring_within_30_days: null,
          verified_unexpired_documents: null,
          compliance: { available: false, reason: 'SOURCE_ERROR' },
          configured_requirements: [],
        },
      ),
      this.getManpowerDistribution(companyId, scopedEmployees),
      isolateDashboardSource(
        'WORK_ACTIVITY',
        this.workActivityInsightsService.getCompanySummary(
          actor,
          period.dateFrom,
          period.dateTo,
          {
            ...(query.branch_id ? { branch_id: query.branch_id } : {}),
            ...(query.department_id
              ? { department_id: query.department_id }
              : {}),
            ...(query.employee_id ? { employee_id: query.employee_id } : {}),
          },
        ),
        null,
      ),
      isolateDashboardSource(
        'PAYROLL',
        payrollAccess.allowed
          ? this.payrollReportsService.dashboard(actor)
          : Promise.resolve(null),
        null,
      ),
    ]);
    const headcount =
      workforceSummary.status_counts[EmploymentStatusEnum.ACTIVE] ?? 0;

    const probation = probationResult.value;
    const approvedLeaveDaysByType = approvedLeaveDaysByTypeResult.value;
    const documentCompliance = documentComplianceResult.value;
    const workActivitySummary = workActivitySummaryResult.value;
    const payrollSummary = payrollSummaryResult.value;
    const partialErrors = [
      probationResult.unavailableWidget,
      approvedLeaveDaysByTypeResult.unavailableWidget,
      documentComplianceResult.unavailableWidget,
      workActivitySummaryResult.unavailableWidget,
      payrollSummaryResult.unavailableWidget,
    ].flatMap((widget) => (widget ? [widget] : []));
    const partialErrorCodes = new Set(
      partialErrors.map((widget) => widget.code),
    );

    const exits = Object.values(completedExitTypes).reduce(
      (total, count) => total + count,
      0,
    );

    return {
      contract_version: 1,
      generated_at: new Date().toISOString(),
      period,
      filters: {
        branch_id: query.branch_id ?? null,
        department_id: query.department_id ?? null,
        employee_id: query.employee_id ?? null,
      },
      headcount,
      workforce_summary: workforceSummary,
      movements: {
        new_joiners: joiners,
        exits,
        resignations: completedExitTypes[OffboardingTypeEnum.RESIGNATION] ?? 0,
        completed_exits_by_type: completedExitTypes,
      },
      probation: {
        employees_on_probation: probation.total_on_probation,
        confirmation_due: probation.confirmation_due_30_days,
        overdue: probation.overdue,
        pending_manager_review: probation.pending_manager_review,
        pending_hr_review: probation.pending_hr_review,
        extended_cases: probation.extended_cases,
      },
      attendance,
      leave: {
        employees_currently_on_leave: employeesOnLeave,
        today_on_leave: employeesOnLeave,
        pending_requests: pendingLeaveApprovals,
        approved_days_by_type: approvedLeaveDaysByType,
      },
      action_inbox:
        assignedOpenActionItems === null
          ? null
          : {
              assigned_open_items: assignedOpenActionItems,
              population: 'SIGNED_IN_ASSIGNEE',
            },
      workflow_pipeline: {
        leave: pendingLeaveApprovals,
        onboarding_active: onboardingActive,
        offboarding_active: offboardingActive,
      },
      employee_document_inventory: documentCompliance,
      manpower,
      work_activities: workActivitySummary,
      payroll: payrollSummary,
      unavailable_widgets: [
        ...partialErrors,
        ...(!payrollAccess.allowed
          ? [
              {
                code: 'PAYROLL',
                available: false,
                reason: payrollAccess.reason,
              },
            ]
          : []),
        ...('reason' in documentCompliance.compliance &&
        !partialErrorCodes.has('DOCUMENT_COMPLIANCE')
          ? [
              {
                code: 'DOCUMENT_COMPLIANCE',
                available: false,
                reason: documentCompliance.compliance.reason,
              },
            ]
          : []),
        ...(attendance.scheduled_employee_days === 0
          ? [
              {
                code: 'ATTENDANCE_RATE',
                available: false,
                reason: 'NO_SCHEDULED_EMPLOYEE_DAY_DATA',
              },
              {
                code: 'ABSENTEEISM_RATE',
                available: false,
                reason: 'NO_SCHEDULED_EMPLOYEE_DAY_DATA',
              },
            ]
          : []),
        ...(assignedOpenActionItems === null
          ? [
              {
                code: 'ACTION_INBOX',
                available: false,
                reason: 'MISSING_ACTIVE_MEMBERSHIP',
              },
            ]
          : []),
        ...(!approvedLeaveDaysByType.available &&
        !partialErrorCodes.has('APPROVED_LEAVE_DAY_TREND')
          ? [
              {
                code: 'APPROVED_LEAVE_DAY_TREND',
                available: false,
                reason: approvedLeaveDaysByType.reason,
              },
            ]
          : []),
      ].map((widget) => ({
        ...widget,
        state: 'state' in widget ? widget.state : 'UNAVAILABLE',
      })),
      partial_errors: partialErrors,
    };
  }

  async listDocumentRequirements(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.documentRequirementRepository.find({
      where: { company_id: companyId },
      order: { document_type_code: 'ASC' },
    });
  }

  async getDocumentComplianceDetails(
    actor: AuthenticatedUser,
    requirementId: number,
    query: EmployeeDocumentComplianceDrilldownQueryDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.dateService.resolve(query, companyId);
    const requirement = await this.documentRequirementRepository.findOne({
      where: {
        id: requirementId,
        company_id: companyId,
        is_active: true,
      },
    });
    if (
      !requirement ||
      (requirement.effective_from &&
        requirement.effective_from > period.today) ||
      (requirement.effective_to && requirement.effective_to < period.today)
    ) {
      throw new NotFoundException('Active document requirement not found.');
    }

    const accessScope =
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor);
    const employeeScope = buildDashboardEmployeeSubquery(
      companyId,
      query,
      accessScope,
    );
    const matchingDocument = (alias: string, predicate = '') => `EXISTS (
      SELECT 1 FROM documents ${alias}
      WHERE ${alias}.company_id = employee.company_id
        AND ${alias}.entity_type = 'EMPLOYEE'
        AND ${alias}.entity_id = employee.id
        AND UPPER(COALESCE(${alias}.document_type, '')) = UPPER(requirement.document_type_code)
        ${predicate}
    )`;
    const validDocument = matchingDocument(
      'state_document',
      'AND state_document.is_verified = true AND (state_document.expiry_date IS NULL OR state_document.expiry_date::date >= :asOfDate)',
    );
    const anyDocument = matchingDocument('any_state_document');
    const expiredDocument = matchingDocument(
      'expired_state_document',
      'AND expired_state_document.expiry_date IS NOT NULL AND expired_state_document.expiry_date::date < :asOfDate',
    );
    const unverifiedDocument = matchingDocument(
      'unverified_state_document',
      'AND unverified_state_document.is_verified = false',
    );
    const builder = this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(
        EmployeeDocumentRequirement,
        'requirement',
        'requirement.company_id = employee.company_id AND requirement.id = :requirementId',
      )
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.employment_status = :activeStatus', {
        activeStatus: EmploymentStatusEnum.ACTIVE,
      })
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .andWhere('requirement.is_active = true')
      .andWhere(
        '(requirement.effective_from IS NULL OR requirement.effective_from <= :asOfDate)',
      )
      .andWhere(
        '(requirement.effective_to IS NULL OR requirement.effective_to >= :asOfDate)',
      )
      .setParameters({
        ...employeeScope.params,
        companyId,
        requirementId: requirement.id,
        asOfDate: period.today,
      });
    this.applyDocumentRequirementApplicability(builder);
    switch (query.state) {
      case 'COMPLIANT':
        builder.andWhere(validDocument);
        break;
      case 'MISSING':
        builder.andWhere(`NOT ${anyDocument}`);
        break;
      case 'EXPIRED':
        builder.andWhere(`NOT ${validDocument}`).andWhere(expiredDocument);
        break;
      case 'UNVERIFIED':
        builder.andWhere(`NOT ${validDocument}`).andWhere(unverifiedDocument);
        break;
    }
    const search = query.search?.trim();
    if (search) {
      builder.andWhere(
        `(employee.employee_no ILIKE :search OR CONCAT_WS(' ', employee.first_name, NULLIF(employee.middle_name, ''), employee.last_name) ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const total = await builder.clone().getCount();
    const evidencePredicate =
      query.state === 'COMPLIANT'
        ? 'AND evidence.is_verified = true AND (evidence.expiry_date IS NULL OR evidence.expiry_date::date >= :asOfDate)'
        : query.state === 'EXPIRED'
          ? 'AND evidence.expiry_date IS NOT NULL AND evidence.expiry_date::date < :asOfDate'
          : query.state === 'UNVERIFIED'
            ? 'AND evidence.is_verified = false'
            : '';
    const evidence = (column: string) =>
      `(SELECT evidence.${column} FROM documents evidence
        WHERE evidence.company_id = employee.company_id
          AND evidence.entity_type = 'EMPLOYEE'
          AND evidence.entity_id = employee.id
          AND UPPER(COALESCE(evidence.document_type, '')) = UPPER(requirement.document_type_code)
          ${evidencePredicate}
        ORDER BY evidence.created_at DESC, evidence.id DESC LIMIT 1)`;
    const rows = await builder
      .clone()
      .select('employee.id', 'employee_id')
      .addSelect('employee.employee_no', 'employee_no')
      .addSelect(
        `CONCAT_WS(' ', employee.first_name, NULLIF(employee.middle_name, ''), employee.last_name)`,
        'employee_name',
      )
      .addSelect('employee.primary_branch_id', 'branch_id')
      .addSelect('employee.primary_department_id', 'department_id')
      .addSelect(evidence('id'), 'document_id')
      .addSelect(evidence('title'), 'document_title')
      .addSelect(evidence('expiry_date'), 'document_expiry_date')
      .addSelect(evidence('is_verified'), 'document_is_verified')
      .orderBy('employee.employee_no', 'ASC')
      .addOrderBy('employee.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<Record<string, string | number | boolean | null>>();

    return {
      generated_at: new Date().toISOString(),
      as_of_date: period.today,
      requirement: {
        id: requirement.id,
        document_type_code: requirement.document_type_code,
        label: requirement.label,
      },
      filters: {
        state: query.state,
        branch_id: query.branch_id ?? null,
        department_id: query.department_id ?? null,
        employee_id: query.employee_id ?? null,
        search: search || null,
      },
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
      items: rows.map((row) => ({
        employee_id: Number(row.employee_id),
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        branch_id: row.branch_id === null ? null : Number(row.branch_id),
        department_id:
          row.department_id === null ? null : Number(row.department_id),
        state: query.state,
        document:
          row.document_id == null
            ? null
            : {
                id: Number(row.document_id),
                title: row.document_title,
                expiry_date: row.document_expiry_date,
                is_verified:
                  row.document_is_verified === true ||
                  row.document_is_verified === 'true',
              },
      })),
    };
  }

  async createDocumentRequirement(
    actor: AuthenticatedUser,
    dto: CreateEmployeeDocumentRequirementDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const code = dto.document_type_code.trim().toUpperCase();
    if (
      dto.effective_from &&
      dto.effective_to &&
      dto.effective_to < dto.effective_from
    ) {
      throw new BadRequestException(
        'effective_to must be on or after effective_from',
      );
    }
    const existing = await this.documentRequirementRepository.findOne({
      where: { company_id: companyId, document_type_code: code },
    });
    if (existing) {
      throw new ConflictException(
        `A document requirement for ${code} already exists. Remove it before replacing the definition.`,
      );
    }
    const requirement = this.documentRequirementRepository.create({
      company_id: companyId,
      document_type_code: code,
      label: dto.label.trim(),
      applicability: {
        ...(dto.branch_ids?.length
          ? { branch_ids: [...new Set(dto.branch_ids)] }
          : {}),
        ...(dto.department_ids?.length
          ? { department_ids: [...new Set(dto.department_ids)] }
          : {}),
        ...(dto.employment_types?.length
          ? {
              employment_types: [
                ...new Set<string>(
                  dto.employment_types.map((value: string) =>
                    value.trim().toUpperCase(),
                  ),
                ),
              ],
            }
          : {}),
      },
      effective_from: dto.effective_from ?? null,
      effective_to: dto.effective_to ?? null,
      is_active: dto.is_active ?? true,
      created_by_company_user_id: actor.companyMembershipId ?? null,
    });
    const saved = await this.documentRequirementRepository.save(requirement);
    return {
      id: saved.id,
      document_type_code: saved.document_type_code,
      label: saved.label,
      applicability: saved.applicability,
      effective_from: saved.effective_from,
      effective_to: saved.effective_to,
      is_active: saved.is_active,
    };
  }

  async deleteDocumentRequirement(
    actor: AuthenticatedUser,
    requirementId: number,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const requirement = await this.documentRequirementRepository.findOne({
      where: { id: requirementId, company_id: companyId },
    });
    if (!requirement)
      throw new NotFoundException('Document requirement not found');
    await this.documentRequirementRepository.delete({
      id: requirementId,
      company_id: companyId,
    });
    return { deleted: true, id: requirementId };
  }

  private async getWorkforceSummary(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ) {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId })
      .select("COALESCE(employee.employment_status::text, 'unknown')", 'status')
      .addSelect('COUNT(*)', 'employee_count')
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .groupBy('employee.employment_status');
    const rows = await query.getRawMany<{
      status: string;
      employee_count: string;
    }>();
    const historical = new Set([
      EmploymentStatusEnum.INACTIVE,
      EmploymentStatusEnum.RESIGNED,
      EmploymentStatusEnum.TERMINATED,
      EmploymentStatusEnum.RETIRED,
      EmploymentStatusEnum.DECEASED,
      EmploymentStatusEnum.EXITED,
    ]);
    const statusCounts: Record<string, number> = {};
    let currentCount = 0;
    let totalCount = 0;
    for (const row of rows) {
      const status = String(row.status || 'unknown').toLowerCase();
      const count = Number(row.employee_count || 0);
      statusCounts[status] = count;
      totalCount += count;
      if (!historical.has(status as EmploymentStatusEnum)) {
        currentCount += count;
      }
    }
    return {
      total_count: totalCount,
      current_count: currentCount,
      status_counts: statusCounts,
    };
  }

  private async countJoiners(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.hire_date >= :dateFrom', { dateFrom })
      .andWhere('employee.hire_date <= :dateTo', { dateTo });
    query
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query.getCount();
  }

  private async countCompletedExitsByType(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    dateFrom: string,
    dateTo: string,
  ): Promise<Record<string, number>> {
    const query = this.offboardingRequestRepository
      .createQueryBuilder('request')
      .select('request.offboarding_type', 'exit_type')
      .addSelect('COUNT(request.id)', 'exit_count')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status = :status', {
        status: OffboardingRequestStatusEnum.COMPLETED,
      });
    query
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    const rows = await query
      .andWhere('request.last_working_date >= :dateFrom', { dateFrom })
      .andWhere('request.last_working_date <= :dateTo', { dateTo })
      .groupBy('request.offboarding_type')
      .getRawMany<{ exit_type: string; exit_count: string }>();

    return Object.fromEntries(
      rows.map((row) => [row.exit_type, Number(row.exit_count)]),
    );
  }

  private async getAttendanceSummary(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    dateFrom: string,
    dateTo: string,
    today: string,
  ) {
    const presentStatuses = [
      AttendanceDailyStatusEnum.PRESENT,
      AttendanceDailyStatusEnum.LATE,
      AttendanceDailyStatusEnum.EARLY_DEPARTURE,
      AttendanceDailyStatusEnum.LATE_AND_EARLY_DEPARTURE,
      AttendanceDailyStatusEnum.OVERTIME,
      AttendanceDailyStatusEnum.HALF_DAY,
      AttendanceDailyStatusEnum.BUSINESS_TRIP,
      AttendanceDailyStatusEnum.OFFICIAL_DUTY,
      AttendanceDailyStatusEnum.MANUAL_CORRECTION,
    ];
    const excludedScheduledStatuses = [
      AttendanceDailyStatusEnum.OFF_DAY,
      AttendanceDailyStatusEnum.OFF_DAY_PRESENT,
      AttendanceDailyStatusEnum.HOLIDAY,
      AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE,
      AttendanceDailyStatusEnum.LEAVE,
      AttendanceDailyStatusEnum.SICK_LEAVE,
      AttendanceDailyStatusEnum.ANNUAL_LEAVE,
      AttendanceDailyStatusEnum.UNPAID_LEAVE,
    ];

    const attendanceQuery = this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .select(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo)`,
        'total_records',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo AND summary.attendance_status = 'PRESENT')`,
        'present',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo AND summary.attendance_status = 'ABSENT')`,
        'absent',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo AND summary.attendance_status NOT IN (:...excludedScheduledStatuses) AND NOT EXISTS (
          SELECT 1 FROM leave_requests approved_leave
          WHERE approved_leave.company_id = summary.company_id
            AND approved_leave.employee_id = summary.employee_id
            AND approved_leave.status = :approvedLeaveStatus
            AND approved_leave.start_date <= summary.attendance_date
            AND approved_leave.end_date >= summary.attendance_date
        ))`,
        'scheduled_employee_days',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo AND summary.attendance_status NOT IN (:...excludedScheduledStatuses) AND summary.attendance_status IN (:...presentStatuses) AND NOT EXISTS (
          SELECT 1 FROM leave_requests approved_leave
          WHERE approved_leave.company_id = summary.company_id
            AND approved_leave.employee_id = summary.employee_id
            AND approved_leave.status = :approvedLeaveStatus
            AND approved_leave.start_date <= summary.attendance_date
            AND approved_leave.end_date >= summary.attendance_date
        ))`,
        'scheduled_present_days',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo AND summary.attendance_status = 'ABSENT' AND NOT EXISTS (
          SELECT 1 FROM leave_requests approved_leave
          WHERE approved_leave.company_id = summary.company_id
            AND approved_leave.employee_id = summary.employee_id
            AND approved_leave.status = :approvedLeaveStatus
            AND approved_leave.start_date <= summary.attendance_date
            AND approved_leave.end_date >= summary.attendance_date
        ))`,
        'scheduled_absent_days',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo AND summary.late_minutes > 0)`,
        'late',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date >= :dateFrom AND summary.attendance_date <= :dateTo AND summary.early_departure_minutes > 0)`,
        'early_departure',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date = :today)`,
        'today_total_records',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date = :today AND summary.attendance_status IN (:...presentStatuses))`,
        'today_present',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE summary.attendance_date = :today AND summary.attendance_status = 'ABSENT')`,
        'today_absent',
      )
      .where('summary.companyId = :companyId', { companyId })
      .andWhere(
        '(summary.attendanceDate BETWEEN :dateFrom AND :dateTo OR summary.attendanceDate = :today)',
        { dateFrom, dateTo, today },
      )
      .setParameters({
        presentStatuses,
        excludedScheduledStatuses,
        approvedLeaveStatus: LeaveStatusEnum.APPROVED,
      })
      .andWhere(`summary.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    const result = await attendanceQuery.getRawOne<Record<string, string>>();

    const scheduledEmployeeDays = Number(result?.scheduled_employee_days ?? 0);
    const scheduledPresentDays = Number(result?.scheduled_present_days ?? 0);
    const scheduledAbsentDays = Number(result?.scheduled_absent_days ?? 0);
    return {
      total_records: Number(result?.total_records ?? 0),
      present: Number(result?.present ?? 0),
      absent: Number(result?.absent ?? 0),
      late: Number(result?.late ?? 0),
      early_departure: Number(result?.early_departure ?? 0),
      today_date: today,
      today_total_records: Number(result?.today_total_records ?? 0),
      today_present: Number(result?.today_present ?? 0),
      today_absent: Number(result?.today_absent ?? 0),
      scheduled_employee_days: scheduledEmployeeDays,
      scheduled_present_days: scheduledPresentDays,
      scheduled_absent_days: scheduledAbsentDays,
      attendance_rate:
        scheduledEmployeeDays > 0
          ? Number(
              ((scheduledPresentDays / scheduledEmployeeDays) * 100).toFixed(2),
            )
          : null,
      absenteeism_rate:
        scheduledEmployeeDays > 0
          ? Number(
              ((scheduledAbsentDays / scheduledEmployeeDays) * 100).toFixed(2),
            )
          : null,
    };
  }

  private async countEmployeesOnLeave(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    today: string,
  ): Promise<number> {
    const leaveStatuses = [
      AttendanceDailyStatusEnum.LEAVE,
      AttendanceDailyStatusEnum.SICK_LEAVE,
      AttendanceDailyStatusEnum.ANNUAL_LEAVE,
      AttendanceDailyStatusEnum.UNPAID_LEAVE,
    ];
    const [approvedLeaveRows, attendanceLeaveRows] = await Promise.all([
      this.leaveRequestRepository
        .createQueryBuilder('leave')
        .select('leave.employee_id', 'employee_id')
        .where('leave.company_id = :companyId', { companyId })
        .andWhere('leave.status = :status', {
          status: LeaveStatusEnum.APPROVED,
        })
        .andWhere('leave.start_date <= :today', { today })
        .andWhere('leave.end_date >= :today', { today })
        .andWhere(`leave.employee_id IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params)
        .getRawMany<{ employee_id: number }>(),
      this.attendanceDailySummaryRepository
        .createQueryBuilder('summary')
        .select('summary.employeeId', 'employee_id')
        .where('summary.companyId = :companyId', { companyId })
        .andWhere('summary.attendanceDate = :today', { today })
        .andWhere('summary.attendanceStatus IN (:...leaveStatuses)', {
          leaveStatuses,
        })
        .andWhere(`summary.employeeId IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params)
        .getRawMany<{ employee_id: number }>(),
    ]);
    return new Set(
      [...approvedLeaveRows, ...attendanceLeaveRows].map((row) =>
        Number(row.employee_id),
      ),
    ).size;
  }

  private async countPendingLeaveApprovals(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    const query = this.leaveRequestRepository
      .createQueryBuilder('leave')
      .where('leave.company_id = :companyId', { companyId })
      .andWhere('leave.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
          LeaveStatusEnum.IN_REVIEW,
        ],
      });
    query
      .andWhere(`leave.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query.getCount();
  }

  private async countOnboardingActive(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    const query = this.onboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status NOT IN (:...closedStatuses)', {
        closedStatuses: CLOSED_ONBOARDING_STATUSES,
      })
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query.getCount();
  }

  private async countOffboardingActive(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    const query = this.offboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status NOT IN (:...closedStatuses)', {
        closedStatuses: CLOSED_OFFBOARDING_STATUSES,
      })
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query.getCount();
  }

  private async getDocumentInventory(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    asOfDate: string,
  ) {
    const expiryWindowEnd = new Date(`${asOfDate}T00:00:00.000Z`);
    expiryWindowEnd.setUTCDate(expiryWindowEnd.getUTCDate() + 30);
    const expiryWindowEndDate = expiryWindowEnd.toISOString().slice(0, 10);

    const query = this.documentRepository
      .createQueryBuilder('document')
      .select('COUNT(*)', 'total_documents')
      .addSelect(
        'COUNT(*) FILTER (WHERE document.is_verified = true)',
        'verified_documents',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE document.expiry_date IS NOT NULL AND document.expiry_date::date < :asOfDate)',
        'expired_documents',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE document.is_verified = true AND (document.expiry_date IS NULL OR document.expiry_date::date >= :asOfDate))',
        'verified_unexpired_documents',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE document.is_verified = true AND document.expiry_date IS NOT NULL AND document.expiry_date::date < :asOfDate)',
        'verified_expired_documents',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE document.expiry_date IS NOT NULL AND document.expiry_date::date BETWEEN :asOfDate AND :expiryWindowEndDate)',
        'expiring_within_30_days',
      )
      .where('document.company_id = :companyId', { companyId })
      .andWhere('document.entity_type = :entityType', {
        entityType: DocumentEntityTypeEnum.EMPLOYEE,
      })
      .setParameters({ asOfDate, expiryWindowEndDate });
    query
      .andWhere(`document.entity_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    const [counts, allRequirements] = await Promise.all([
      query.getRawOne<{
        total_documents: string;
        verified_documents: string;
        expired_documents: string;
        verified_expired_documents: string;
        expiring_within_30_days: string;
        verified_unexpired_documents: string;
      }>(),
      this.documentRequirementRepository.find({
        where: { company_id: companyId, is_active: true },
        order: { document_type_code: 'ASC' },
      }),
    ]);

    const totalDocuments = Number(counts?.total_documents ?? 0);
    const verifiedDocuments = Number(counts?.verified_documents ?? 0);

    const requirements = allRequirements.filter(
      (requirement) =>
        (!requirement.effective_from ||
          requirement.effective_from <= asOfDate) &&
        (!requirement.effective_to || requirement.effective_to >= asOfDate),
    );
    const compliance = requirements.length
      ? await this.getDocumentRequirementCompliance(
          companyId,
          employeeScope,
          asOfDate,
        )
      : {
          available: false,
          reason: allRequirements.length
            ? 'NO_EFFECTIVE_REQUIREMENTS'
            : 'REQUIREMENT_CATALOG_NOT_CONFIGURED',
          applicable_requirement_count: 0,
          compliant_requirement_count: 0,
          non_compliant_requirement_count: 0,
          compliance_rate: null,
          requirements: [],
        };

    return {
      total_documents: totalDocuments,
      verified_documents: verifiedDocuments,
      unverified_documents: totalDocuments - verifiedDocuments,
      expired_documents: Number(counts?.expired_documents ?? 0),
      verified_expired_documents: Number(
        counts?.verified_expired_documents ?? 0,
      ),
      expiring_within_30_days: Number(counts?.expiring_within_30_days ?? 0),
      verified_unexpired_documents: Number(
        counts?.verified_unexpired_documents ?? 0,
      ),
      compliance,
      configured_requirements: allRequirements.map((requirement) => ({
        id: requirement.id,
        document_type_code: requirement.document_type_code,
        label: requirement.label,
        applicability: requirement.applicability,
        effective_from: requirement.effective_from,
        effective_to: requirement.effective_to,
      })),
    };
  }

  private async getDocumentRequirementCompliance(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    asOfDate: string,
  ) {
    const matchingDocument = (predicate = '') => `EXISTS (
      SELECT 1 FROM documents requirement_document
      WHERE requirement_document.company_id = employee.company_id
        AND requirement_document.entity_type = 'EMPLOYEE'
        AND requirement_document.entity_id = employee.id
        AND UPPER(COALESCE(requirement_document.document_type, '')) = UPPER(requirement.document_type_code)
        ${predicate}
    )`;
    const validDocument = matchingDocument(
      'AND requirement_document.is_verified = true AND (requirement_document.expiry_date IS NULL OR requirement_document.expiry_date::date >= :asOfDate)',
    );
    const anyDocument = matchingDocument();
    const expiredDocument = matchingDocument(
      'AND requirement_document.expiry_date IS NOT NULL AND requirement_document.expiry_date::date < :asOfDate',
    );
    const unverifiedDocument = matchingDocument(
      'AND requirement_document.is_verified = false',
    );
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(
        EmployeeDocumentRequirement,
        'requirement',
        'requirement.company_id = employee.company_id',
      )
      .select('requirement.id', 'requirement_id')
      .addSelect('requirement.document_type_code', 'document_type_code')
      .addSelect('requirement.label', 'label')
      .addSelect('COUNT(DISTINCT employee.id)', 'applicable_employee_count')
      .addSelect(
        `COUNT(DISTINCT employee.id) FILTER (WHERE ${validDocument})`,
        'compliant_employee_count',
      )
      .addSelect(
        `COUNT(DISTINCT employee.id) FILTER (WHERE NOT ${anyDocument})`,
        'missing_document_employee_count',
      )
      .addSelect(
        `COUNT(DISTINCT employee.id) FILTER (WHERE NOT ${validDocument} AND ${expiredDocument})`,
        'expired_document_employee_count',
      )
      .addSelect(
        `COUNT(DISTINCT employee.id) FILTER (WHERE NOT ${validDocument} AND ${unverifiedDocument})`,
        'unverified_document_employee_count',
      )
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.employment_status = :activeStatus', {
        activeStatus: EmploymentStatusEnum.ACTIVE,
      })
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .andWhere('requirement.is_active = true')
      .andWhere(
        '(requirement.effective_from IS NULL OR requirement.effective_from <= :asOfDate)',
      )
      .andWhere(
        '(requirement.effective_to IS NULL OR requirement.effective_to >= :asOfDate)',
      )
      .setParameters({
        ...employeeScope.params,
        companyId,
        asOfDate,
      })
      .groupBy('requirement.id')
      .addGroupBy('requirement.document_type_code')
      .addGroupBy('requirement.label');
    this.applyDocumentRequirementApplicability(query);
    const rows = await query.getRawMany<{
      requirement_id: number | string;
      document_type_code: string;
      label: string;
      applicable_employee_count: number | string;
      compliant_employee_count: number | string;
      missing_document_employee_count: number | string;
      expired_document_employee_count: number | string;
      unverified_document_employee_count: number | string;
    }>();
    const requirements = rows.map((row) => ({
      requirement_id: Number(row.requirement_id),
      document_type_code: row.document_type_code,
      label: row.label,
      applicable_employee_count: Number(row.applicable_employee_count),
      compliant_employee_count: Number(row.compliant_employee_count),
      missing_document_employee_count: Number(
        row.missing_document_employee_count,
      ),
      expired_document_employee_count: Number(
        row.expired_document_employee_count,
      ),
      unverified_document_employee_count: Number(
        row.unverified_document_employee_count,
      ),
    }));
    const applicableRequirementCount = requirements.reduce(
      (total, row) => total + row.applicable_employee_count,
      0,
    );
    const compliantRequirementCount = requirements.reduce(
      (total, row) => total + row.compliant_employee_count,
      0,
    );
    return {
      available: true,
      as_of_date: asOfDate,
      applicable_requirement_count: applicableRequirementCount,
      compliant_requirement_count: compliantRequirementCount,
      non_compliant_requirement_count:
        applicableRequirementCount - compliantRequirementCount,
      compliance_rate:
        applicableRequirementCount > 0
          ? Number(
              (
                (compliantRequirementCount / applicableRequirementCount) *
                100
              ).toFixed(2),
            )
          : null,
      requirements,
    };
  }

  private applyDocumentRequirementApplicability(
    query: SelectQueryBuilder<Employee>,
  ) {
    return query
      .andWhere(
        `(COALESCE(jsonb_array_length(requirement.applicability->'branch_ids'), 0) = 0 OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(requirement.applicability->'branch_ids') branch_filter(value)
          WHERE branch_filter.value::int = employee.primary_branch_id
        ))`,
      )
      .andWhere(
        `(COALESCE(jsonb_array_length(requirement.applicability->'department_ids'), 0) = 0 OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(requirement.applicability->'department_ids') department_filter(value)
          WHERE department_filter.value::int = employee.primary_department_id
        ))`,
      )
      .andWhere(
        `(COALESCE(jsonb_array_length(requirement.applicability->'employment_types'), 0) = 0 OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(requirement.applicability->'employment_types') employment_filter(value)
          WHERE UPPER(employment_filter.value) = UPPER(employee.employment_type::text)
        ))`,
      );
  }

  private async getManpowerDistribution(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ) {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin('employee.primary_department', 'department')
      .where('employee.company_id = :companyId', { companyId })
      .select('department.id', 'department_id')
      .addSelect('department.name', 'department_name')
      .addSelect('COUNT(*)', 'headcount')
      .groupBy('department.id');
    query
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .andWhere(
        '(employee.employment_status IS NULL OR employee.employment_status NOT IN (:...historicalStatuses))',
        {
          historicalStatuses: [
            EmploymentStatusEnum.INACTIVE,
            EmploymentStatusEnum.RESIGNED,
            EmploymentStatusEnum.TERMINATED,
            EmploymentStatusEnum.RETIRED,
            EmploymentStatusEnum.DECEASED,
            EmploymentStatusEnum.EXITED,
          ],
        },
      )
      .setParameters(employeeScope.params);
    const rows = await query.addGroupBy('department.name').getRawMany<{
      department_id: number | null;
      department_name: string | null;
      headcount: string;
    }>();

    return rows.map((row) => ({
      department_id: row.department_id,
      department_name: row.department_name ?? 'Unassigned',
      headcount: Number(row.headcount),
    }));
  }
}
