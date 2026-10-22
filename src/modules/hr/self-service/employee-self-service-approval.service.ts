import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { In } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummaryService } from '../attendance/processing/attendance-daily-summary.service';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from '../attendance/processing/enums/attendance-processing-job-status.enum';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { EmployeeProfileUpdateRequest } from './entities/employee-profile-update-request.entity';
import { SelfServiceRequestStatusEnum } from './enums/self-service-request-status.enum';
import { AttendanceCorrectionRequestTypeEnum } from './enums/attendance-correction-request-type.enum';
import { QuerySelfServiceApprovalDto } from './dtos/query-self-service-approval.dto';
import { ReviewSelfServiceRequestDto } from './dtos/review-self-service-request.dto';
import { AttendanceCorrectionDocument } from './entities/attendance-correction-document.entity';
import { FilesService } from '../../files/files.service';

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

    if (!this.isHrAttendanceReviewer(actor)) {
      if (!actor.employeeId) {
        throw new ForbiddenException(
          'A linked manager employee account is required to review attendance corrections.',
        );
      }
      qb.innerJoin(
        Employee,
        'reviewedEmployee',
        'reviewedEmployee.id = r.employeeId AND reviewedEmployee.company_id = :companyId',
      ).andWhere('reviewedEmployee.reports_to = :managerEmployeeId', {
        managerEmployeeId: actor.employeeId,
      });
    }

    if (query.employee_id) {
      qb.andWhere('r.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }

    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    } else {
      qb.andWhere('r.status = :status', {
        status: SelfServiceRequestStatusEnum.SUBMITTED,
      });
    }

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
      data: await this.mapCorrectionRequestsWithEvidence(items),
      meta: this.buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findAttendanceCorrectionRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const request = await this.findCorrectionOrFail(companyId, id);
    await this.assertCanReviewAttendanceCorrection(actor, request.employeeId);
    return this.mapCorrectionRequestWithEvidence(request);
  }

  async downloadAttendanceCorrectionEvidence(
    actor: AuthenticatedUser,
    requestId: number,
    documentId: number,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const request = await this.findCorrectionOrFail(companyId, requestId);
    await this.assertCanReviewAttendanceCorrection(actor, request.employeeId);
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
    requests: AttendanceCorrectionRequest[],
  ) {
    if (!requests.length) return [];
    const documents = await this.correctionDocumentRepository.find({
      where: {
        companyId: requests[0].companyId,
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
    return requests.map((request) => ({
      ...this.mapCorrectionRequest(request),
      evidence: (byRequest.get(request.id) ?? []).map((document) => ({
        id: document.id,
        file_name: document.fileName,
        file_type: document.fileType,
        uploaded_at: document.uploadedAt,
        file_url: `/api/hr/self-service/approvals/attendance-corrections/${request.id}/documents/${document.id}/download`,
      })),
    }));
  }

  private async mapCorrectionRequestWithEvidence(
    request: AttendanceCorrectionRequest,
  ) {
    const [mapped] = await this.mapCorrectionRequestsWithEvidence([request]);
    return mapped;
  }

  async approveAttendanceCorrectionRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    return this.correctionRequestRepository.manager.transaction(
      async (manager) => {
        const request = await this.findCorrectionOrFail(companyId, id, manager);
        await this.assertCanReviewAttendanceCorrection(
          actor,
          request.employeeId,
          manager,
        );

        if (request.status !== SelfServiceRequestStatusEnum.SUBMITTED) {
          throw new BadRequestException(
            'Only submitted attendance correction requests can be approved.',
          );
        }

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

        request.status = SelfServiceRequestStatusEnum.APPROVED;
        request.reviewedAt = new Date();
        request.reviewedByCompanyUserId = reviewerCompanyUserId;
        request.reviewComment = dto.comment ?? null;
        request.metadata = {
          ...this.toObject(request.metadata),
          approval: {
            approved_at: new Date().toISOString(),
            approved_by_company_user_id: reviewerCompanyUserId,
            comment: dto.comment ?? null,
            applied_to_summary_id: summary?.id ?? null,
          },
          ...(dto.metadata ? { review_metadata: dto.metadata } : {}),
        };

        const savedRequest = await manager
          .getRepository(AttendanceCorrectionRequest)
          .save(request);

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
          message:
            'Attendance correction request approved and applied successfully.',
          data: this.mapCorrectionRequest(savedRequest),
          applied_summary: {
            id: summary?.id ?? null,
            employee_id: summary?.employeeId ?? request.employeeId,
            attendance_date: summary?.attendanceDate ?? request.attendanceDate,
            attendance_status: summary?.attendanceStatus ?? null,
            check_in_at: summary?.checkInAt ?? null,
            check_out_at: summary?.checkOutAt ?? null,
          },
        };
      },
    );
  }

  async rejectAttendanceCorrectionRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    return this.correctionRequestRepository.manager.transaction(
      async (manager) => {
        const request = await this.findCorrectionOrFail(companyId, id, manager);
        await this.assertCanReviewAttendanceCorrection(
          actor,
          request.employeeId,
          manager,
        );

        if (request.status !== SelfServiceRequestStatusEnum.SUBMITTED) {
          throw new BadRequestException(
            'Only submitted attendance correction requests can be rejected.',
          );
        }

        request.status = SelfServiceRequestStatusEnum.REJECTED;
        request.reviewedAt = new Date();
        request.reviewedByCompanyUserId = reviewerCompanyUserId;
        request.reviewComment = dto.comment ?? null;
        request.metadata = {
          ...this.toObject(request.metadata),
          rejection: {
            rejected_at: new Date().toISOString(),
            rejected_by_company_user_id: reviewerCompanyUserId,
            comment: dto.comment ?? null,
          },
          ...(dto.metadata ? { review_metadata: dto.metadata } : {}),
        };

        const saved = await manager
          .getRepository(AttendanceCorrectionRequest)
          .save(request);

        return {
          message: 'Attendance correction request rejected.',
          data: this.mapCorrectionRequest(saved),
        };
      },
    );
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

    if (query.employee_id) {
      qb.andWhere('r.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }

    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    } else {
      qb.andWhere('r.status = :status', {
        status: SelfServiceRequestStatusEnum.SUBMITTED,
      });
    }

    const [items, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapProfileUpdateRequest(item)),
      meta: this.buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findProfileUpdateRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    return this.mapProfileUpdateRequest(
      await this.findProfileUpdateOrFail(companyId, id),
    );
  }

  async approveProfileUpdateRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    return this.profileUpdateRequestRepository.manager.transaction(
      async (manager) => {
        const request = await this.findProfileUpdateOrFail(
          companyId,
          id,
          manager,
        );

        if (request.status !== SelfServiceRequestStatusEnum.SUBMITTED) {
          throw new BadRequestException(
            'Only submitted profile update requests can be approved.',
          );
        }

        const employee = await manager.getRepository(Employee).findOne({
          where: { id: request.employeeId, company_id: companyId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!employee) {
          throw new NotFoundException('Employee record not found.');
        }

        this.applyProfileChangesToEmployee(employee, request.requestedChanges);

        request.status = SelfServiceRequestStatusEnum.APPROVED;
        request.reviewedAt = new Date();
        request.reviewedByCompanyUserId = reviewerCompanyUserId;
        request.reviewComment = dto.comment ?? null;
        request.metadata = {
          ...this.toObject(request.metadata),
          approval: {
            approved_at: new Date().toISOString(),
            approved_by_company_user_id: reviewerCompanyUserId,
            comment: dto.comment ?? null,
            applied_to_employee_id: employee.id,
          },
          ...(dto.metadata ? { review_metadata: dto.metadata } : {}),
        };

        await manager.getRepository(Employee).save(employee);
        const savedRequest = await manager
          .getRepository(EmployeeProfileUpdateRequest)
          .save(request);

        return {
          message: 'Profile update request approved and applied successfully.',
          data: this.mapProfileUpdateRequest(savedRequest),
        };
      },
    );
  }

  async rejectProfileUpdateRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    return this.profileUpdateRequestRepository.manager.transaction(
      async (manager) => {
        const request = await this.findProfileUpdateOrFail(
          companyId,
          id,
          manager,
        );

        if (request.status !== SelfServiceRequestStatusEnum.SUBMITTED) {
          throw new BadRequestException(
            'Only submitted profile update requests can be rejected.',
          );
        }

        request.status = SelfServiceRequestStatusEnum.REJECTED;
        request.reviewedAt = new Date();
        request.reviewedByCompanyUserId = reviewerCompanyUserId;
        request.reviewComment = dto.comment ?? null;
        request.metadata = {
          ...this.toObject(request.metadata),
          rejection: {
            rejected_at: new Date().toISOString(),
            rejected_by_company_user_id: reviewerCompanyUserId,
            comment: dto.comment ?? null,
          },
          ...(dto.metadata ? { review_metadata: dto.metadata } : {}),
        };

        const saved = await manager
          .getRepository(EmployeeProfileUpdateRequest)
          .save(request);

        return {
          message: 'Profile update request rejected.',
          data: this.mapProfileUpdateRequest(saved),
        };
      },
    );
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

  private isHrAttendanceReviewer(actor: AuthenticatedUser) {
    return (actor.roles ?? []).some((role) =>
      ['COMPANY_ADMIN', 'HR_MANAGER', 'HR_OFFICER'].includes(
        role.trim().toUpperCase(),
      ),
    );
  }

  private async assertCanReviewAttendanceCorrection(
    actor: AuthenticatedUser,
    requestEmployeeId: number,
    manager?: EntityManager,
  ) {
    if (actor.employeeId === requestEmployeeId) {
      throw new ForbiddenException(
        'You cannot review your own attendance correction request.',
      );
    }

    if (this.isHrAttendanceReviewer(actor)) {
      return;
    }

    if (!actor.employeeId) {
      throw new ForbiddenException(
        'A linked manager employee account is required to review attendance corrections.',
      );
    }

    const employee = await (
      manager?.getRepository(Employee) ?? this.employeeRepository
    ).findOne({
      where: { id: requestEmployeeId, company_id: actor.companyId },
      select: ['id', 'reports_to'],
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });

    if (!employee || employee.reports_to !== actor.employeeId) {
      // Do not disclose another manager's employee or request.
      throw new NotFoundException('Attendance correction request not found.');
    }
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
      reason: r.reason,
      status: r.status,
      submitted_at: r.submittedAt,
      cancelled_at: r.cancelledAt,
      reviewed_at: r.reviewedAt,
      reviewed_by_company_user_id: r.reviewedByCompanyUserId,
      review_comment: r.reviewComment,
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
      reviewed_at: r.reviewedAt,
      reviewed_by_company_user_id: r.reviewedByCompanyUserId,
      review_comment: r.reviewComment,
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
