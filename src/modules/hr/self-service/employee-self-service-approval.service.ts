import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  In,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummaryService } from '../attendance/processing/attendance-daily-summary.service';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from '../attendance/processing/enums/attendance-processing-job-status.enum';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { SelfServiceRequestTransitionedEvent } from '../notifications/events/self-service.events';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { EmployeeProfileUpdateRequest } from './entities/employee-profile-update-request.entity';
import {
  SelfServiceApprovalAction,
  SelfServiceRequestKind,
} from './entities/self-service-request-approval.entity';
import {
  SELF_SERVICE_PENDING_STATUSES,
  SelfServiceRequestStatusEnum,
} from './enums/self-service-request-status.enum';
import { AttendanceCorrectionRequestTypeEnum } from './enums/attendance-correction-request-type.enum';
import { QuerySelfServiceApprovalDto } from './dtos/query-self-service-approval.dto';
import { ReviewSelfServiceRequestDto } from './dtos/review-self-service-request.dto';
import { AttendanceCorrectionDocument } from './entities/attendance-correction-document.entity';
import { FilesService } from '../../files/files.service';
import {
  applyManagerScope,
  isHrSelfServiceReviewer,
  isPendingManagerStatus,
  loadEmployeeSummaries,
  loadSelfServiceApprovalHistory,
  recordSelfServiceApproval,
  resolveEmployeeManagerIds,
} from './self-service-approval-workflow';

type ReviewDecision = 'approve' | 'reject' | 'return';

type ReviewStage = 'manager' | 'hr';

type ReviewableRequest = {
  id: number;
  companyId: number;
  employeeId: number;
  status: SelfServiceRequestStatusEnum;
  reviewedByCompanyUserId: number | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  managerReviewedByCompanyUserId: number | null;
  managerReviewedAt: Date | null;
  managerReviewComment: string | null;
  metadata: Record<string, unknown> | null;
};

const REQUEST_LABELS: Record<SelfServiceRequestKind, string> = {
  attendance_correction: 'Attendance correction request',
  profile_update: 'Profile update request',
};

const DECISION_ACTIONS: Record<ReviewDecision, SelfServiceApprovalAction> = {
  approve: 'approved',
  reject: 'rejected',
  return: 'returned_for_correction',
};

const DECISION_VERBS: Record<ReviewDecision, string> = {
  approve: 'approved',
  reject: 'rejected',
  return: 'returned',
};

@Injectable()
export class EmployeeSelfServiceApprovalService {
  constructor(
    @InjectRepository(AttendanceCorrectionRequest)
    private readonly correctionRequestRepository: Repository<AttendanceCorrectionRequest>,

    @InjectRepository(EmployeeProfileUpdateRequest)
    private readonly profileUpdateRequestRepository: Repository<EmployeeProfileUpdateRequest>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly attendanceDailySummaryService: AttendanceDailySummaryService,
    @Optional()
    @InjectRepository(AttendanceCorrectionDocument)
    private readonly correctionDocumentRepository: Repository<AttendanceCorrectionDocument> = {
      find: () => Promise.resolve([]),
      findOne: () => Promise.resolve(null),
    } as unknown as Repository<AttendanceCorrectionDocument>,
    @Optional()
    private readonly filesService: FilesService = {
      readManagedFile: () => Promise.resolve(null),
    } as unknown as FilesService,
    @Optional()
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  // ─── Attendance Correction Requests ────────────────────────────────────────

  async findAttendanceCorrectionRequests(
    actor: AuthenticatedUser,
    query: QuerySelfServiceApprovalDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    const qb = this.correctionRequestRepository
      .createQueryBuilder('r')
      .where('r.companyId = :companyId', { companyId });
    this.applyReviewerListFilters(qb, actor, companyId, query);

    if (query.from_date) {
      qb.andWhere('r.attendanceDate >= :fromDate', {
        fromDate: query.from_date,
      });
    }

    if (query.to_date) {
      qb.andWhere('r.attendanceDate <= :toDate', { toDate: query.to_date });
    }

    const [items, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: await this.mapCorrectionRequestsWithEvidence(actor, items, false),
      meta: this.buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findAttendanceCorrectionRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const request = await this.findCorrectionOrFail(companyId, id);
    await this.assertCanViewRequest(
      actor,
      request.employeeId,
      'attendance_correction',
    );
    const [mapped] = await this.mapCorrectionRequestsWithEvidence(
      actor,
      [request],
      true,
    );
    return mapped;
  }

  async downloadAttendanceCorrectionEvidence(
    actor: AuthenticatedUser,
    requestId: number,
    documentId: number,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const request = await this.findCorrectionOrFail(companyId, requestId);
    await this.assertCanViewRequest(
      actor,
      request.employeeId,
      'attendance_correction',
    );
    const document = await this.correctionDocumentRepository.findOne({
      where: { id: documentId, companyId, requestId },
    });
    if (!document)
      throw new NotFoundException('Attendance correction evidence not found.');
    const buffer = await this.filesService.readManagedFile(document.fileUrl);
    if (!buffer)
      throw new NotFoundException(
        'Attendance correction evidence file was not found.',
      );
    return { buffer, fileName: document.fileName, mimeType: document.fileType };
  }

  private async mapCorrectionRequestsWithEvidence(
    actor: AuthenticatedUser,
    requests: AttendanceCorrectionRequest[],
    includeHistory: boolean,
  ) {
    if (!requests.length) return [];
    const companyId = requests[0].companyId;
    const documents = await this.correctionDocumentRepository.find({
      where: {
        companyId,
        requestId: In(requests.map((request) => request.id)),
      },
      order: { uploadedAt: 'ASC' },
    });
    const byRequest = new Map<number, AttendanceCorrectionDocument[]>();
    for (const document of documents) {
      const current = byRequest.get(document.requestId) ?? [];
      current.push(document);
      byRequest.set(document.requestId, current);
    }
    const context = await this.loadReviewContext(
      actor,
      'attendance_correction',
      requests,
      includeHistory,
    );
    return requests.map((request) => ({
      ...this.mapCorrectionRequest(request),
      ...context(request),
      evidence: (byRequest.get(request.id) ?? []).map((document) => ({
        id: document.id,
        file_name: document.fileName,
        file_type: document.fileType,
        uploaded_at: document.uploadedAt,
        file_url: `/api/hr/self-service/approvals/attendance-corrections/${request.id}/documents/${document.id}/download`,
      })),
    }));
  }

  approveAttendanceCorrectionRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    return this.decideAttendanceCorrection(actor, id, dto, 'approve');
  }

  rejectAttendanceCorrectionRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    return this.decideAttendanceCorrection(actor, id, dto, 'reject');
  }

  returnAttendanceCorrectionRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    return this.decideAttendanceCorrection(actor, id, dto, 'return');
  }

  private async decideAttendanceCorrection(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
    decision: ReviewDecision,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const result = await this.correctionRequestRepository.manager.transaction(
      async (manager) => {
        const request = await this.findCorrectionOrFail(companyId, id, manager);
        const outcome = await this.applyDecision(
          manager,
          actor,
          'attendance_correction',
          request,
          dto,
          decision,
          async (reviewerCompanyUserId) => {
            const summary =
              await this.attendanceDailySummaryService.upsertAdjustment(
                companyId,
                request.employeeId,
                request.attendanceDate,
                this.buildAttendanceCorrectionAdjustment(request, dto),
                reviewerCompanyUserId,
                {
                  metadata: {
                    source: 'ATTENDANCE_CORRECTION_REQUEST',
                    correction_request_id: request.id,
                    correction_request_type: request.requestType,
                    approved_by_user_id: actor.id,
                    approved_comment: dto.comment ?? null,
                  },
                },
                manager,
              );

            await manager.getRepository(AttendanceRecalculationJob).save(
              manager.getRepository(AttendanceRecalculationJob).create({
                companyId,
                employeeId: request.employeeId,
                dateFrom: request.attendanceDate,
                dateTo: request.attendanceDate,
                reason: `Approved attendance correction request ${request.id}`,
                status: AttendanceProcessingJobStatusEnum.PENDING,
                attempts: 0,
                requestedByCompanyUserId: reviewerCompanyUserId,
                metadata: {
                  source: 'attendance_correction_approval',
                  correction_request_id: request.id,
                },
              }),
            );

            return {
              applied_to_summary_id: summary?.id ?? null,
              applied_summary: {
                id: summary?.id ?? null,
                employee_id: summary?.employeeId ?? request.employeeId,
                attendance_date:
                  summary?.attendanceDate ?? request.attendanceDate,
                attendance_status: summary?.attendanceStatus ?? null,
                check_in_at: summary?.checkInAt ?? null,
                check_out_at: summary?.checkOutAt ?? null,
              },
            };
          },
        );

        const saved = await manager
          .getRepository(AttendanceCorrectionRequest)
          .save(request);

        return {
          ...outcome,
          response: {
            message: outcome.message,
            data: this.mapCorrectionRequest(saved),
            ...(outcome.applied ? outcome.applied : {}),
          },
        };
      },
    );
    this.emitTransition(result.event);
    return result.response;
  }

  // ─── Profile Update Requests ────────────────────────────────────────────────

  async findProfileUpdateRequests(
    actor: AuthenticatedUser,
    query: QuerySelfServiceApprovalDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    const qb = this.profileUpdateRequestRepository
      .createQueryBuilder('r')
      .where('r.companyId = :companyId', { companyId });
    this.applyReviewerListFilters(qb, actor, companyId, query);

    if (query.from_date) {
      qb.andWhere('r.createdAt >= :fromDate', { fromDate: query.from_date });
    }

    if (query.to_date) {
      qb.andWhere("r.createdAt < (CAST(:toDate AS date) + INTERVAL '1 day')", {
        toDate: query.to_date,
      });
    }

    const [items, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const context = await this.loadReviewContext(
      actor,
      'profile_update',
      items,
      false,
    );
    return {
      data: items.map((item) => ({
        ...this.mapProfileUpdateRequest(item),
        ...context(item),
      })),
      meta: this.buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findProfileUpdateRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const request = await this.findProfileUpdateOrFail(companyId, id);
    await this.assertCanViewRequest(
      actor,
      request.employeeId,
      'profile_update',
    );
    const context = await this.loadReviewContext(
      actor,
      'profile_update',
      [request],
      true,
    );
    return { ...this.mapProfileUpdateRequest(request), ...context(request) };
  }

  approveProfileUpdateRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    return this.decideProfileUpdate(actor, id, dto, 'approve');
  }

  rejectProfileUpdateRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    return this.decideProfileUpdate(actor, id, dto, 'reject');
  }

  returnProfileUpdateRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    return this.decideProfileUpdate(actor, id, dto, 'return');
  }

  private async decideProfileUpdate(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
    decision: ReviewDecision,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const result =
      await this.profileUpdateRequestRepository.manager.transaction(
        async (manager) => {
          const request = await this.findProfileUpdateOrFail(
            companyId,
            id,
            manager,
          );
          const outcome = await this.applyDecision(
            manager,
            actor,
            'profile_update',
            request,
            dto,
            decision,
            async () => {
              const employee = await manager.getRepository(Employee).findOne({
                where: { id: request.employeeId, company_id: companyId },
                lock: { mode: 'pessimistic_write' },
              });

              if (!employee) {
                throw new NotFoundException('Employee record not found.');
              }

              this.applyProfileChangesToEmployee(
                employee,
                request.requestedChanges,
              );
              await manager.getRepository(Employee).save(employee);
              return { applied_to_employee_id: employee.id };
            },
          );

          const saved = await manager
            .getRepository(EmployeeProfileUpdateRequest)
            .save(request);

          return {
            ...outcome,
            response: {
              message: outcome.message,
              data: this.mapProfileUpdateRequest(saved),
            },
          };
        },
      );
    this.emitTransition(result.event);
    return result.response;
  }

  // ─── Shared two-stage workflow ──────────────────────────────────────────────

  /**
   * Applies a manager or HR decision to a locked request. Managers move a
   * request from the manager stage to HR; HR gives final approval at either
   * pending stage, which runs `applyFinal` inside the same transaction.
   */
  private async applyDecision(
    manager: EntityManager,
    actor: AuthenticatedUser,
    kind: SelfServiceRequestKind,
    request: ReviewableRequest,
    dto: ReviewSelfServiceRequestDto,
    decision: ReviewDecision,
    applyFinal: (
      reviewerCompanyUserId: number,
    ) => Promise<Record<string, unknown>>,
  ) {
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    const stage = await this.resolveReviewStage(
      manager,
      actor,
      kind,
      request,
      decision,
    );

    const fromStatus = request.status;
    const managerStageSkipped =
      stage === 'hr' && isPendingManagerStatus(fromStatus);
    const comment = dto.comment ?? null;
    const now = new Date();

    let toStatus: SelfServiceRequestStatusEnum;
    if (decision === 'approve') {
      toStatus =
        stage === 'manager'
          ? SelfServiceRequestStatusEnum.PENDING_HR_APPROVAL
          : SelfServiceRequestStatusEnum.APPROVED;
    } else if (decision === 'reject') {
      toStatus = SelfServiceRequestStatusEnum.REJECTED;
    } else {
      toStatus = SelfServiceRequestStatusEnum.RETURNED_FOR_CORRECTION;
    }

    let applied: Record<string, unknown> | null = null;
    if (toStatus === SelfServiceRequestStatusEnum.APPROVED) {
      applied = await applyFinal(reviewerCompanyUserId);
    }

    if (stage === 'manager') {
      request.managerReviewedByCompanyUserId = reviewerCompanyUserId;
      request.managerReviewedAt = now;
      request.managerReviewComment = comment;
    }
    if (stage === 'hr' || decision !== 'approve') {
      request.reviewedByCompanyUserId = reviewerCompanyUserId;
      request.reviewedAt = now;
      request.reviewComment = comment;
    }
    request.status = toStatus;

    const decisionKey =
      stage === 'manager' && decision === 'approve'
        ? 'manager_approval'
        : decision === 'approve'
          ? 'approval'
          : decision === 'reject'
            ? 'rejection'
            : 'return';
    const appliedRefs = { ...(applied ?? {}) };
    delete appliedRefs.applied_summary;
    request.metadata = {
      ...this.toObject(request.metadata),
      [decisionKey]: {
        at: now.toISOString(),
        by_company_user_id: reviewerCompanyUserId,
        stage,
        comment,
        ...(managerStageSkipped ? { manager_stage_skipped: true } : {}),
        ...appliedRefs,
      },
      ...(dto.metadata ? { review_metadata: dto.metadata } : {}),
    };

    await recordSelfServiceApproval(manager, {
      companyId: request.companyId,
      requestKind: kind,
      requestId: request.id,
      stage,
      action: DECISION_ACTIONS[decision],
      fromStatus,
      toStatus,
      actorCompanyUserId: reviewerCompanyUserId,
      actorEmployeeId: actor.employeeId ?? null,
      comment,
      metadata: managerStageSkipped ? { manager_stage_skipped: true } : null,
    });

    const label = REQUEST_LABELS[kind];
    const message =
      toStatus === SelfServiceRequestStatusEnum.PENDING_HR_APPROVAL
        ? `${label} approved by manager and forwarded to HR for final approval.`
        : toStatus === SelfServiceRequestStatusEnum.APPROVED
          ? `${label} approved and applied successfully.`
          : `${label} ${DECISION_VERBS[decision]}.`;

    return {
      message,
      applied:
        kind === 'attendance_correction' && applied?.applied_summary
          ? { applied_summary: applied.applied_summary }
          : null,
      event: new SelfServiceRequestTransitionedEvent(
        request.companyId,
        kind,
        request.id,
        request.employeeId,
        DECISION_ACTIONS[decision],
        fromStatus,
        toStatus,
        reviewerCompanyUserId,
        comment,
      ),
    };
  }

  private async resolveReviewStage(
    manager: EntityManager,
    actor: AuthenticatedUser,
    kind: SelfServiceRequestKind,
    request: ReviewableRequest,
    decision: ReviewDecision,
  ): Promise<ReviewStage> {
    await this.assertCanViewRequest(actor, request.employeeId, kind, manager);
    const label = REQUEST_LABELS[kind].toLowerCase();

    if (
      !(SELF_SERVICE_PENDING_STATUSES as readonly string[]).includes(
        request.status,
      )
    ) {
      throw new BadRequestException(
        `Only pending ${label}s can be ${DECISION_VERBS[decision]}.`,
      );
    }

    if (isHrSelfServiceReviewer(actor)) return 'hr';

    if (!isPendingManagerStatus(request.status)) {
      throw new ForbiddenException(
        `This ${label} has passed manager review and awaits HR final approval.`,
      );
    }
    return 'manager';
  }

  /** HR sees every request; managers only their reports and departments. */
  private async assertCanViewRequest(
    actor: AuthenticatedUser,
    requestEmployeeId: number,
    kind: SelfServiceRequestKind,
    manager?: EntityManager,
  ) {
    if (actor.employeeId === requestEmployeeId) {
      throw new ForbiddenException(
        `You cannot review your own ${REQUEST_LABELS[kind].toLowerCase()}.`,
      );
    }

    if (isHrSelfServiceReviewer(actor)) {
      return;
    }

    if (!actor.employeeId) {
      throw new ForbiddenException(
        'A linked manager employee account is required to review self-service requests.',
      );
    }

    const managerIds = await resolveEmployeeManagerIds(
      manager ?? this.employeeRepository.manager,
      actor.companyId!,
      requestEmployeeId,
    );
    if (!managerIds.includes(actor.employeeId)) {
      // Do not disclose another manager's employee or request.
      throw new NotFoundException(`${REQUEST_LABELS[kind]} not found.`);
    }
  }

  private applyReviewerListFilters<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    actor: AuthenticatedUser,
    companyId: number,
    query: QuerySelfServiceApprovalDto,
  ) {
    const isHr = isHrSelfServiceReviewer(actor);
    if (!isHr) {
      if (!actor.employeeId) {
        throw new ForbiddenException(
          'A linked manager employee account is required to review self-service requests.',
        );
      }
      applyManagerScope(qb, 'r.employeeId', companyId, actor.employeeId);
    }

    if (query.employee_id) {
      qb.andWhere('r.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }

    if (query.department_id || query.manager_employee_id) {
      qb.innerJoin(
        Employee,
        'filterEmployee',
        'filterEmployee.id = r.employeeId AND filterEmployee.company_id = :companyId',
      );
      if (query.department_id) {
        qb.andWhere('filterEmployee.primary_department_id = :departmentId', {
          departmentId: query.department_id,
        });
      }
      if (query.manager_employee_id) {
        qb.leftJoin(
          Department,
          'filterDepartment',
          'filterDepartment.id = filterEmployee.primary_department_id AND filterDepartment.company_id = :companyId',
        ).andWhere(
          new Brackets((where) => {
            where
              .where('filterEmployee.reports_to = :filterManagerId')
              .orWhere(
                'filterDepartment.manager_employee_id = :filterManagerId',
              );
          }),
          { filterManagerId: query.manager_employee_id },
        );
      }
    }

    if (query.status && query.status !== 'all') {
      const statuses =
        query.status === SelfServiceRequestStatusEnum.PENDING_MANAGER_APPROVAL
          ? [query.status, SelfServiceRequestStatusEnum.SUBMITTED]
          : [query.status];
      qb.andWhere('r.status IN (:...statuses)', { statuses });
    } else if (!query.status) {
      // Default queue: requests awaiting this reviewer's decision.
      qb.andWhere('r.status IN (:...statuses)', {
        statuses: isHr
          ? [...SELF_SERVICE_PENDING_STATUSES]
          : [
              SelfServiceRequestStatusEnum.PENDING_MANAGER_APPROVAL,
              SelfServiceRequestStatusEnum.SUBMITTED,
            ],
      });
    }
  }

  /** Employee/department labels, approval history and actor's review stage. */
  private async loadReviewContext(
    actor: AuthenticatedUser,
    kind: SelfServiceRequestKind,
    requests: ReviewableRequest[],
    includeHistory: boolean,
  ) {
    const entityManager = this.employeeRepository.manager;
    const companyId = actor.companyId!;
    const [employees, history] = await Promise.all([
      loadEmployeeSummaries(
        entityManager,
        companyId,
        requests.map((request) => request.employeeId),
      ),
      includeHistory
        ? loadSelfServiceApprovalHistory(
            entityManager,
            companyId,
            kind,
            requests.map((request) => request.id),
          )
        : Promise.resolve(null),
    ]);
    const isHr = isHrSelfServiceReviewer(actor);

    return (request: ReviewableRequest) => {
      const pending = (
        SELF_SERVICE_PENDING_STATUSES as readonly string[]
      ).includes(request.status);
      const ownRequest = actor.employeeId === request.employeeId;
      const reviewStage: ReviewStage | null =
        !pending || ownRequest
          ? null
          : isHr
            ? 'hr'
            : isPendingManagerStatus(request.status)
              ? 'manager'
              : null;
      return {
        ...(employees.get(request.employeeId) ?? {
          employee_name: null,
          employee_no: null,
          department_id: null,
          department_name: null,
          reports_to: null,
        }),
        review_stage: reviewStage,
        can_approve: reviewStage !== null,
        can_reject: reviewStage !== null,
        can_return: reviewStage !== null,
        is_final_approval: reviewStage === 'hr',
        ...(history ? { approval_history: history.get(request.id) ?? [] } : {}),
      };
    };
  }

  private emitTransition(event: SelfServiceRequestTransitionedEvent) {
    try {
      this.eventEmitter?.emit(SelfServiceRequestTransitionedEvent.EVENT, event);
    } catch {
      // Notifications must never fail a committed decision.
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildAttendanceCorrectionAdjustment(
    request: AttendanceCorrectionRequest,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const type = request.requestType;
    const notes = [
      `Approved attendance correction request #${request.id}.`,
      request.reason?.trim() || null,
      dto.comment?.trim() || null,
    ]
      .filter((value): value is string => !!value)
      .join(' ');

    return {
      check_in_at:
        type === AttendanceCorrectionRequestTypeEnum.CHECK_IN ||
        type === AttendanceCorrectionRequestTypeEnum.CHECK_IN_AND_CHECK_OUT ||
        type === AttendanceCorrectionRequestTypeEnum.MISSING_PUNCH
          ? (request.requestedCheckInAt?.toISOString() ?? undefined)
          : undefined,
      check_out_at:
        type === AttendanceCorrectionRequestTypeEnum.CHECK_OUT ||
        type === AttendanceCorrectionRequestTypeEnum.CHECK_IN_AND_CHECK_OUT ||
        type === AttendanceCorrectionRequestTypeEnum.MISSING_PUNCH
          ? (request.requestedCheckOutAt?.toISOString() ?? undefined)
          : undefined,
      attendance_status:
        type === AttendanceCorrectionRequestTypeEnum.STATUS_CORRECTION
          ? (request.requestedStatus ?? undefined)
          : undefined,
      notes,
    };
  }

  private applyProfileChangesToEmployee(
    employee: Employee,
    changes: Record<string, unknown>,
  ) {
    const allowedFields = new Set([
      'first_name',
      'middle_name',
      'last_name',
      'phone_number',
      'personal_email',
      'emergency_contact_name',
      'emergency_contact_phone',
      'address',
      'city',
      'region',
      'country',
      'postal_code',
    ]);

    const blocked = new Set([
      'id',
      'company_id',
      'employee_no',
      'salary',
      'password',
      'role',
      'roles',
      'permissions',
      'status',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);

    for (const [key, value] of Object.entries(changes)) {
      if (blocked.has(key) || !allowedFields.has(key)) continue;
      (employee as unknown as Record<string, unknown>)[key] = value;
    }
  }

  private async findCorrectionOrFail(
    companyId: number,
    id: number,
    manager?: EntityManager,
  ) {
    const item = await (
      manager?.getRepository(AttendanceCorrectionRequest) ??
      this.correctionRequestRepository
    ).findOne({
      where: { id, companyId },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });

    if (!item) {
      throw new NotFoundException('Attendance correction request not found.');
    }

    return item;
  }

  private async findProfileUpdateOrFail(
    companyId: number,
    id: number,
    manager?: EntityManager,
  ) {
    const item = await (
      manager?.getRepository(EmployeeProfileUpdateRequest) ??
      this.profileUpdateRequestRepository
    ).findOne({
      where: { id, companyId },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });

    if (!item) {
      throw new NotFoundException('Profile update request not found.');
    }

    return item;
  }

  private mapReviewFields(r: ReviewableRequest) {
    return {
      manager_reviewed_by_company_user_id: r.managerReviewedByCompanyUserId,
      manager_reviewed_at: r.managerReviewedAt,
      manager_review_comment: r.managerReviewComment,
      reviewed_at: r.reviewedAt,
      reviewed_by_company_user_id: r.reviewedByCompanyUserId,
      review_comment: r.reviewComment,
    };
  }

  private mapCorrectionRequest(r: AttendanceCorrectionRequest) {
    return {
      id: r.id,
      company_id: r.companyId,
      employee_id: r.employeeId,
      attendance_date: r.attendanceDate,
      request_type: r.requestType,
      requested_check_in_at: r.requestedCheckInAt,
      requested_check_out_at: r.requestedCheckOutAt,
      requested_status: r.requestedStatus,
      original_snapshot: r.originalSnapshot ?? null,
      reason: r.reason,
      status: r.status,
      submitted_at: r.submittedAt,
      cancelled_at: r.cancelledAt,
      ...this.mapReviewFields(r),
      metadata: r.metadata,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    };
  }

  private mapProfileUpdateRequest(r: EmployeeProfileUpdateRequest) {
    return {
      id: r.id,
      company_id: r.companyId,
      employee_id: r.employeeId,
      requested_changes: r.requestedChanges,
      reason: r.reason,
      status: r.status,
      submitted_at: r.submittedAt,
      cancelled_at: r.cancelledAt,
      ...this.mapReviewFields(r),
      metadata: r.metadata,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    };
  }

  private ensureCompanyId(actor: AuthenticatedUser): number {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }

    return actor.companyId;
  }

  private ensureCompanyMembershipId(actor: AuthenticatedUser): number {
    if (!actor.companyMembershipId) {
      throw new ForbiddenException(
        'Active company membership context is required.',
      );
    }

    return actor.companyMembershipId;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private buildPaginationMeta(
    total: number,
    count: number,
    limit: number,
    page: number,
  ) {
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      total,
      count,
      limit,
      page,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_previous_page: page > 1,
    };
  }
}
