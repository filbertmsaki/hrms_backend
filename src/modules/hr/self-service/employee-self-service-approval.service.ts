import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../attendance/processing/enums/attendance-daily-status.enum';
import { AttendanceDailyRemarkEnum } from '../attendance/processing/enums/attendance-daily-remark.enum';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { EmployeeProfileUpdateRequest } from './entities/employee-profile-update-request.entity';
import { SelfServiceRequestStatusEnum } from './enums/self-service-request-status.enum';
import { AttendanceCorrectionRequestTypeEnum } from './enums/attendance-correction-request-type.enum';
import { QuerySelfServiceApprovalDto } from './dtos/query-self-service-approval.dto';
import { ReviewSelfServiceRequestDto } from './dtos/review-self-service-request.dto';

@Injectable()
export class EmployeeSelfServiceApprovalService {
  constructor(
    @InjectRepository(AttendanceCorrectionRequest)
    private readonly correctionRequestRepository: Repository<AttendanceCorrectionRequest>,

    @InjectRepository(EmployeeProfileUpdateRequest)
    private readonly profileUpdateRequestRepository: Repository<EmployeeProfileUpdateRequest>,

    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,

    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
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
      data: items.map((item) => this.mapCorrectionRequest(item)),
      meta: this.buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findAttendanceCorrectionRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    return this.mapCorrectionRequest(
      await this.findCorrectionOrFail(companyId, id),
    );
  }

  async approveAttendanceCorrectionRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    const request = await this.findCorrectionOrFail(companyId, id);

    if (request.status !== SelfServiceRequestStatusEnum.SUBMITTED) {
      throw new BadRequestException(
        'Only submitted attendance correction requests can be approved.',
      );
    }

    const summary = await this.attendanceDailySummaryRepository.findOne({
      where: {
        companyId,
        employeeId: request.employeeId,
        attendanceDate: request.attendanceDate,
      },
    });

    if (!summary) {
      throw new BadRequestException(
        'Attendance daily summary not found for this date. Process attendance first before approving.',
      );
    }

    this.applyAttendanceCorrectionToSummary(
      summary,
      request,
      actor,
      reviewerCompanyUserId,
      dto,
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
        applied_to_summary_id: summary.id,
      },
      ...(dto.metadata ? { review_metadata: dto.metadata } : {}),
    };

    await this.attendanceDailySummaryRepository.save(summary);
    const savedRequest = await this.correctionRequestRepository.save(request);

    return {
      message:
        'Attendance correction request approved and applied successfully.',
      data: this.mapCorrectionRequest(savedRequest),
      applied_summary: {
        id: summary.id,
        employee_id: summary.employeeId,
        attendance_date: summary.attendanceDate,
        attendance_status: summary.attendanceStatus,
        check_in_at: summary.checkInAt,
        check_out_at: summary.checkOutAt,
      },
    };
  }

  async rejectAttendanceCorrectionRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    const request = await this.findCorrectionOrFail(companyId, id);

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

    const saved = await this.correctionRequestRepository.save(request);

    return {
      message: 'Attendance correction request rejected.',
      data: this.mapCorrectionRequest(saved),
    };
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
    const request = await this.findProfileUpdateOrFail(companyId, id);

    if (request.status !== SelfServiceRequestStatusEnum.SUBMITTED) {
      throw new BadRequestException(
        'Only submitted profile update requests can be approved.',
      );
    }

    const employee = await this.employeeRepository.findOne({
      where: { id: request.employeeId },
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

    await this.employeeRepository.save(employee);
    const savedRequest =
      await this.profileUpdateRequestRepository.save(request);

    return {
      message: 'Profile update request approved and applied successfully.',
      data: this.mapProfileUpdateRequest(savedRequest),
    };
  }

  async rejectProfileUpdateRequest(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const reviewerCompanyUserId = this.ensureCompanyMembershipId(actor);
    const request = await this.findProfileUpdateOrFail(companyId, id);

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

    const saved = await this.profileUpdateRequestRepository.save(request);

    return {
      message: 'Profile update request rejected.',
      data: this.mapProfileUpdateRequest(saved),
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private applyAttendanceCorrectionToSummary(
    summary: AttendanceDailySummary,
    request: AttendanceCorrectionRequest,
    actor: AuthenticatedUser,
    reviewerCompanyUserId: number,
    dto: ReviewSelfServiceRequestDto,
  ) {
    const previousSnapshot = {
      attendanceStatus: summary.attendanceStatus,
      checkInAt: summary.checkInAt,
      checkOutAt: summary.checkOutAt,
    };

    const type = request.requestType;

    if (
      type === AttendanceCorrectionRequestTypeEnum.CHECK_IN ||
      type === AttendanceCorrectionRequestTypeEnum.CHECK_IN_AND_CHECK_OUT ||
      type === AttendanceCorrectionRequestTypeEnum.MISSING_PUNCH
    ) {
      if (request.requestedCheckInAt) {
        summary.checkInAt = request.requestedCheckInAt;
      }
    }

    if (
      type === AttendanceCorrectionRequestTypeEnum.CHECK_OUT ||
      type === AttendanceCorrectionRequestTypeEnum.CHECK_IN_AND_CHECK_OUT ||
      type === AttendanceCorrectionRequestTypeEnum.MISSING_PUNCH
    ) {
      if (request.requestedCheckOutAt) {
        summary.checkOutAt = request.requestedCheckOutAt;
      }
    }

    if (
      type === AttendanceCorrectionRequestTypeEnum.STATUS_CORRECTION &&
      request.requestedStatus
    ) {
      summary.attendanceStatus =
        request.requestedStatus as AttendanceDailyStatusEnum;
    }

    const remarks: AttendanceDailyRemarkEnum[] = Array.isArray(summary.remarks)
      ? [...summary.remarks]
      : [];

    if (!remarks.includes(AttendanceDailyRemarkEnum.MANUALLY_CORRECTED)) {
      remarks.push(AttendanceDailyRemarkEnum.MANUALLY_CORRECTED);
    }

    summary.remarks = remarks;
    summary.isAdjusted = true;
    summary.adjustedByCompanyUserId = reviewerCompanyUserId;
    summary.adjustedAt = new Date();

    summary.flags = {
      ...this.toObject(summary.flags),
      manual_correction: {
        approved: true,
        request_id: request.id,
        approved_at: new Date().toISOString(),
        approved_by_user_id: actor.id,
        approved_by_company_user_id: reviewerCompanyUserId,
        comment: dto.comment ?? null,
        previous: previousSnapshot,
      },
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

  private async findCorrectionOrFail(companyId: number, id: number) {
    const item = await this.correctionRequestRepository.findOne({
      where: { id, companyId },
    });

    if (!item) {
      throw new NotFoundException('Attendance correction request not found.');
    }

    return item;
  }

  private async findProfileUpdateOrFail(companyId: number, id: number) {
    const item = await this.profileUpdateRequestRepository.findOne({
      where: { id, companyId },
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
