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

@Injectable()
export class AttendanceWorkFromHomeService {
  constructor(
    @InjectRepository(AttendanceWorkFromHomeRequest)
    private readonly requestRepository: Repository<AttendanceWorkFromHomeRequest>,
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
      .orderBy('request.start_date', 'DESC')
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
    if (request.status !== AttendanceWorkFromHomeStatusEnum.PENDING) {
      throw new ConflictException('Only pending requests can be cancelled.');
    }
    const result = await this.requestRepository.update(
      {
        id,
        companyId,
        employeeId,
        status: AttendanceWorkFromHomeStatusEnum.PENDING,
      },
      { status: AttendanceWorkFromHomeStatusEnum.CANCELLED },
    );
    if (!result.affected) {
      throw new ConflictException(
        'The request was updated before it could be cancelled.',
      );
    }
    return {
      ...this.toResponse(request),
      status: AttendanceWorkFromHomeStatusEnum.CANCELLED,
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

  private toResponse(request: AttendanceWorkFromHomeRequest) {
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
      created_at: request.createdAt,
      updated_at: request.updatedAt,
    };
  }
}
