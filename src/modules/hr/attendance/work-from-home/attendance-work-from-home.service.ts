import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceWorkFromHomeRequest } from './entities/attendance-work-from-home-request.entity';
import { AttendanceWorkFromHomeStatusEnum } from './enums/attendance-work-from-home-status.enum';
import {
  AttendanceWorkFromHomeReviewDecisionEnum,
  ReviewAttendanceWorkFromHomeRequestDto,
} from './dtos/review-attendance-work-from-home-request.dto';
import { CreateAttendanceWorkFromHomeRequestDto } from './dtos/create-attendance-work-from-home-request.dto';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AppNotification } from '../../../notifications/entities/app-notification.entity';
import { Employee } from '../../employees/entities/employee.entity';

@Injectable()
export class AttendanceWorkFromHomeService {
  constructor(
    @InjectRepository(AttendanceWorkFromHomeRequest)
    private readonly requestRepository: Repository<AttendanceWorkFromHomeRequest>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(AppNotification)
    private readonly notificationRepository: Repository<AppNotification>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async createRequest(
    companyId: number,
    employeeId: number,
    dto: CreateAttendanceWorkFromHomeRequestDto,
  ) {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('reason must not be empty');
    }
    const startDate = this.normalizeDate(dto.start_date, 'start_date');
    const endDate = this.normalizeDate(dto.end_date, 'end_date');
    if (endDate < startDate) {
      throw new BadRequestException('end_date must be on or after start_date');
    }

    const overlapping = await this.requestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id = :employeeId', { employeeId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: [
          AttendanceWorkFromHomeStatusEnum.PENDING,
          AttendanceWorkFromHomeStatusEnum.APPROVED,
        ],
      })
      .andWhere('request.start_date <= :endDate', { endDate })
      .andWhere('request.end_date >= :startDate', { startDate })
      .getOne();
    if (overlapping) {
      throw new ConflictException(
        'An active work-from-home request already covers part of these dates.',
      );
    }

    const request = await this.requestRepository.save(
      this.requestRepository.create({
        companyId,
        employeeId,
        startDate,
        endDate,
        reason,
        status: AttendanceWorkFromHomeStatusEnum.PENDING,
        reviewedByCompanyUserId: null,
        reviewedAt: null,
        reviewComment: null,
      }),
    );
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    const reviewers = await this.findReviewers(companyId, employee);
    if (reviewers.length) {
      const employeeName = employee
        ? [employee.first_name, employee.middle_name, employee.last_name]
            .filter(Boolean)
            .join(' ')
        : `Employee #${employeeId}`;
      await this.notificationRepository.save(
        reviewers.map((reviewer) =>
          this.notificationRepository.create({
            company_id: companyId,
            sender_company_user_id: employee?.company_user_id ?? null,
            receiver_company_user_id: reviewer.id,
            title: 'Work-from-home request awaiting review',
            message: `${employeeName} requested remote work from ${startDate} to ${endDate}.`,
            related_module: 'attendance',
            entity_type: 'ATTENDANCE_WORK_FROM_HOME_REQUEST',
            entity_id: String(request.id),
            action_url: '/dashboard/attendance/work-from-home-requests',
            dedupe_key: `attendance:wfh:review:${request.id}:${reviewer.id}`,
            metadata: {
              request_id: request.id,
              employee_id: employeeId,
              start_date: startDate,
              end_date: endDate,
            },
          }),
        ),
      );
    }
    return this.toResponse(request);
  }

  async listRequests(
    companyId: number,
    employeeId?: number | null,
    status?: AttendanceWorkFromHomeStatusEnum,
  ) {
    const query = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('request.company_id = :companyId', { companyId });
    if (employeeId) {
      query.andWhere('request.employee_id = :employeeId', { employeeId });
    }
    if (status) {
      query.andWhere('request.status = :status', { status });
    }
    const requests = await query
      .orderBy('request.startDate', 'DESC')
      .addOrderBy('request.id', 'DESC')
      .take(200)
      .getMany();
    return requests.map((request) => this.toResponse(request));
  }

  async listTeamRequests(companyId: number, managerEmployeeId: number) {
    const requests = await this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('employee.reports_to = :managerEmployeeId', {
        managerEmployeeId,
      })
      .orderBy('request.startDate', 'DESC')
      .addOrderBy('request.id', 'DESC')
      .take(200)
      .getMany();
    return requests.map((request) => this.toResponse(request));
  }

  async reviewRequest(
    companyId: number,
    id: number,
    reviewerCompanyUserId: number,
    dto: ReviewAttendanceWorkFromHomeRequestDto,
    reviewerEmployeeId?: number,
    reviewerPermissions: string[] = [],
  ) {
    const request = await this.requestRepository.findOne({
      where: { id, companyId },
      relations: { employee: true },
    });
    if (!request) {
      throw new NotFoundException('Work-from-home request not found.');
    }
    if (request.status !== AttendanceWorkFromHomeStatusEnum.PENDING) {
      throw new ConflictException('Only pending requests can be reviewed.');
    }
    if (request.employee.company_user_id === reviewerCompanyUserId) {
      throw new ForbiddenException(
        'You cannot review your own work-from-home request.',
      );
    }
    const isAttendanceOperator = reviewerPermissions.includes(
      'attendance_processing:execute',
    );
    const isDirectManager = Boolean(
      reviewerEmployeeId && request.employee.reports_to === reviewerEmployeeId,
    );
    if (!isAttendanceOperator && !isDirectManager) {
      throw new ForbiddenException(
        'Only the employee’s reporting manager or an attendance operator can review this request.',
      );
    }
    const comment = dto.comment?.trim() || null;
    if (
      dto.decision === AttendanceWorkFromHomeReviewDecisionEnum.REJECT &&
      !comment
    ) {
      throw new BadRequestException('A comment is required when rejecting.');
    }

    const result = await this.requestRepository.update(
      {
        id,
        companyId,
        status: AttendanceWorkFromHomeStatusEnum.PENDING,
      },
      {
        status:
          dto.decision === AttendanceWorkFromHomeReviewDecisionEnum.APPROVE
            ? AttendanceWorkFromHomeStatusEnum.APPROVED
            : AttendanceWorkFromHomeStatusEnum.REJECTED,
        reviewedByCompanyUserId: reviewerCompanyUserId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
    );
    if (!result.affected) {
      throw new ConflictException(
        'The request was updated by another reviewer. Reload and try again.',
      );
    }

    if (request.employee.company_user_id) {
      const approved =
        dto.decision === AttendanceWorkFromHomeReviewDecisionEnum.APPROVE;
      await this.notificationRepository.save(
        this.notificationRepository.create({
          company_id: companyId,
          sender_company_user_id: reviewerCompanyUserId,
          receiver_company_user_id: request.employee.company_user_id,
          title: approved
            ? 'Work-from-home request approved'
            : 'Work-from-home request declined',
          message: approved
            ? `Your remote-work request for ${request.startDate} to ${request.endDate} was approved.`
            : `Your remote-work request for ${request.startDate} to ${request.endDate} was declined${comment ? `: ${comment}` : '.'}`,
          related_module: 'attendance',
          entity_type: 'ATTENDANCE_WORK_FROM_HOME_REQUEST',
          entity_id: String(request.id),
          action_url: '/dashboard/attendance/work-from-home-requests',
          dedupe_key: `attendance:wfh:decision:${request.id}:${approved ? 'approved' : 'rejected'}`,
          metadata: { request_id: request.id, decision: dto.decision },
        }),
      );
    }

    return this.toResponse({
      ...request,
      status:
        dto.decision === AttendanceWorkFromHomeReviewDecisionEnum.APPROVE
          ? AttendanceWorkFromHomeStatusEnum.APPROVED
          : AttendanceWorkFromHomeStatusEnum.REJECTED,
      reviewedByCompanyUserId: reviewerCompanyUserId,
      reviewedAt: new Date(),
      reviewComment: comment,
    });
  }

  async cancelOwnRequest(companyId: number, employeeId: number, id: number) {
    const request = await this.requestRepository.findOne({
      where: { id, companyId, employeeId },
    });
    if (!request) {
      throw new NotFoundException('Work-from-home request not found.');
    }
    return this.cancelRequest(request, { id, companyId, employeeId });
  }

  async cancelManagedRequest(companyId: number, id: number) {
    const request = await this.requestRepository.findOne({
      where: { id, companyId },
    });
    if (!request) {
      throw new NotFoundException('Work-from-home request not found.');
    }
    return this.cancelRequest(request, { id, companyId });
  }

  private async cancelRequest(
    request: AttendanceWorkFromHomeRequest,
    criteria: { id: number; companyId: number; employeeId?: number },
  ) {
    if (
      request.status !== AttendanceWorkFromHomeStatusEnum.PENDING &&
      request.status !== AttendanceWorkFromHomeStatusEnum.APPROVED
    ) {
      throw new ConflictException(
        'Only pending or approved requests can be cancelled.',
      );
    }
    const cancelledAt = new Date();
    const result = await this.requestRepository.update(
      {
        ...criteria,
        status: request.status,
      },
      {
        status: AttendanceWorkFromHomeStatusEnum.CANCELLED,
        updatedAt: cancelledAt,
      },
    );
    if (!result.affected) {
      throw new ConflictException(
        'The request was updated before it could be cancelled.',
      );
    }
    return {
      ...this.toResponse({
        ...request,
        status: AttendanceWorkFromHomeStatusEnum.CANCELLED,
        updatedAt: cancelledAt,
      }),
    };
  }

  async assertApprovedForDate(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
  ): Promise<void> {
    const request = await this.requestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id = :employeeId', { employeeId })
      .andWhere('request.status = :status', {
        status: AttendanceWorkFromHomeStatusEnum.APPROVED,
      })
      .andWhere('request.start_date <= :attendanceDate', { attendanceDate })
      .andWhere('request.end_date >= :attendanceDate', { attendanceDate })
      .getOne();
    if (!request) {
      throw new ForbiddenException(
        `An approved work-from-home request is required for ${attendanceDate}.`,
      );
    }
  }

  private normalizeDate(value: string, field: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`${field} must be a valid calendar date`);
    }
    return value;
  }

  private async findReviewers(companyId: number, employee?: Employee | null) {
    if (employee?.reports_to) {
      const manager = await this.employeeRepository.findOne({
        where: { id: employee.reports_to, company_id: companyId },
      });
      if (manager?.company_user_id) {
        const managerUser = await this.companyUserRepository.findOne({
          where: {
            id: manager.company_user_id,
            company_id: companyId,
            status: 'active',
          },
        });
        if (managerUser) return [managerUser];
      }
    }

    const query = this.companyUserRepository
      .createQueryBuilder('companyUser')
      .leftJoin('companyUser.permission_assignments', 'directAssignment')
      .leftJoin('directAssignment.permission', 'directPermission')
      .leftJoin('companyUser.role_assignments', 'roleAssignment')
      .leftJoin('roleAssignment.role', 'role')
      .leftJoin('role.permissions', 'rolePermission')
      .where('companyUser.company_id = :companyId', { companyId })
      .andWhere('companyUser.status = :status', { status: 'active' })
      .andWhere(
        '(directPermission.name = :permission OR rolePermission.name = :permission)',
        {
          permission: 'attendance_processing:execute',
        },
      )
      .distinct(true);
    if (employee?.company_user_id) {
      query.andWhere('companyUser.id != :requesterCompanyUserId', {
        requesterCompanyUserId: employee.company_user_id,
      });
    }
    return query.getMany();
  }

  private toResponse(request: AttendanceWorkFromHomeRequest) {
    const requestedDays = this.inclusiveDays(
      request.startDate,
      request.endDate,
    );
    const cancelledAt =
      request.status === AttendanceWorkFromHomeStatusEnum.CANCELLED
        ? request.updatedAt
        : null;
    const cancellationDate = cancelledAt
      ? cancelledAt.toISOString().slice(0, 10)
      : null;
    const usedEnd = cancellationDate
      ? cancellationDate < request.endDate
        ? cancellationDate
        : request.endDate
      : null;
    const usedDays = cancellationDate
      ? cancellationDate < request.startDate
        ? 0
        : this.inclusiveDays(request.startDate, usedEnd!)
      : null;
    return {
      id: request.id,
      company_id: request.companyId,
      employee_id: request.employeeId,
      employee_name: request.employee
        ? [
            request.employee.first_name,
            request.employee.middle_name,
            request.employee.last_name,
          ]
            .filter(Boolean)
            .join(' ')
        : null,
      start_date: request.startDate,
      end_date: request.endDate,
      reason: request.reason,
      status: request.status,
      reviewed_by_company_user_id: request.reviewedByCompanyUserId,
      reviewed_at: request.reviewedAt,
      review_comment: request.reviewComment,
      approval_stage:
        request.status === AttendanceWorkFromHomeStatusEnum.PENDING
          ? 'Attendance / HR review'
          : null,
      waiting_on:
        request.status === AttendanceWorkFromHomeStatusEnum.PENDING
          ? 'Attendance or HR reviewer'
          : null,
      created_at: request.createdAt,
      updated_at: request.updatedAt,
      cancelled_at: cancelledAt,
      requested_days: requestedDays,
      used_days: usedDays,
      unused_days:
        usedDays === null ? null : Math.max(requestedDays - usedDays, 0),
    };
  }

  private inclusiveDays(startDate: string, endDate: string): number {
    const start = Date.parse(`${startDate}T00:00:00.000Z`);
    const end = Date.parse(`${endDate}T00:00:00.000Z`);
    return Math.floor((end - start) / 86_400_000) + 1;
  }
}
