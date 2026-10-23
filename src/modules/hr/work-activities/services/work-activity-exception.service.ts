import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { DailyActivityReport } from '../entities/daily-activity.entities';
import { FieldVisit } from '../entities/field-visit.entities';
import { WorkActivityException } from '../entities/analytics.entities';
import {
  DailyActivityReportStatusEnum,
  FieldVisitStatusEnum,
  WorkActivityExceptionStatusEnum,
  WorkActivityExceptionTypeEnum,
} from '../enums/work-activity.enums';
import { WorkActivityEligibilityService } from './work-activity-eligibility.service';

@Injectable()
export class WorkActivityExceptionService {
  constructor(
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(FieldVisit)
    private readonly visitRepository: Repository<FieldVisit>,
    @InjectRepository(WorkActivityException)
    private readonly exceptionRepository: Repository<WorkActivityException>,
    private readonly eligibilityService: WorkActivityEligibilityService,
  ) {}

  async reconcileForEmployeeDate(
    employee: Employee,
    activityDate: string,
    policy: {
      dailySubmissionRequired?: boolean;
      fieldVisitPlanRequired?: boolean;
    },
  ): Promise<void> {
    const dateEligibility = await this.eligibilityService.evaluate(
      employee,
      activityDate,
    );
    const isAttendanceEligible = dateEligibility.attendanceExceptionEligible;

    const submittedReport = await this.reportRepository.findOne({
      where: {
        companyId: employee.company_id,
        employeeId: employee.id,
        activityDate,
        status: In([
          DailyActivityReportStatusEnum.SUBMITTED,
          DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING,
          DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
          DailyActivityReportStatusEnum.APPROVED,
          DailyActivityReportStatusEnum.LOCKED,
        ]),
      },
    });

    const reviewedVisitCount = await this.visitRepository.count({
      where: {
        companyId: employee.company_id,
        employeeId: employee.id,
        visitDate: activityDate,
        status: FieldVisitStatusEnum.REVIEWED,
      },
    });

    await this.upsertOrResolve(
      employee.company_id,
      employee.id,
      activityDate,
      WorkActivityExceptionTypeEnum.ATTENDANCE_WITHOUT_ACTIVITY,
      isAttendanceEligible &&
        Boolean(policy.dailySubmissionRequired) &&
        !submittedReport,
      'Attendance exists without a submitted daily activity report.',
    );

    await this.upsertOrResolve(
      employee.company_id,
      employee.id,
      activityDate,
      WorkActivityExceptionTypeEnum.FIELD_ATTENDANCE_WITHOUT_VISIT,
      isAttendanceEligible &&
        Boolean(policy.fieldVisitPlanRequired) &&
        reviewedVisitCount === 0,
      'Field attendance exists without an approved field visit.',
    );
  }

  async list(
    companyId: number,
    filters: { employeeId?: number; status?: string },
  ) {
    const qb = this.exceptionRepository
      .createQueryBuilder('exception')
      .where('exception.companyId = :companyId', { companyId })
      .orderBy('exception.exceptionDate', 'DESC')
      .addOrderBy('exception.id', 'DESC');

    if (filters.employeeId) {
      qb.andWhere('exception.employeeId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    if (filters.status) {
      qb.andWhere('exception.status = :status', { status: filters.status });
    }

    return qb.getMany();
  }

  private async upsertOrResolve(
    companyId: number,
    employeeId: number,
    exceptionDate: string,
    exceptionType: WorkActivityExceptionTypeEnum,
    shouldBeOpen: boolean,
    message: string,
  ) {
    const existing = await this.exceptionRepository.findOne({
      where: {
        companyId,
        employeeId,
        exceptionDate,
        exceptionType,
      },
    });

    if (shouldBeOpen) {
      if (existing) {
        if (existing.status !== WorkActivityExceptionStatusEnum.OPEN) {
          existing.status = WorkActivityExceptionStatusEnum.OPEN;
          existing.resolvedAt = null;
          existing.resolutionNote = null;
          existing.message = message;
          await this.exceptionRepository.save(existing);
        }
        return;
      }

      await this.exceptionRepository.save(
        this.exceptionRepository.create({
          companyId,
          employeeId,
          exceptionDate,
          exceptionType,
          status: WorkActivityExceptionStatusEnum.OPEN,
          message,
        }),
      );
      return;
    }

    if (existing && existing.status === WorkActivityExceptionStatusEnum.OPEN) {
      existing.status = WorkActivityExceptionStatusEnum.RESOLVED;
      existing.resolvedAt = new Date();
      existing.resolutionNote =
        'Resolved automatically by work-activity reconciliation.';
      await this.exceptionRepository.save(existing);
    }
  }
}
