import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { OffboardingNoticePolicy } from '../entities/offboarding-notice-policy.entity';

@Injectable()
export class OffboardingNoticeService {
  constructor(
    @InjectRepository(OffboardingNoticePolicy)
    private readonly policyRepository: Repository<OffboardingNoticePolicy>,
    private readonly configService: ConfigService,
  ) {}

  private daysBetween(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    return Math.floor((end.getTime() - start.getTime()) / 86400000);
  }

  async resolveNoticeDays(
    companyId: number,
    employee: Employee,
  ): Promise<number> {
    const policies = await this.policyRepository.find({
      where: {
        company_id: companyId,
        status: 'active',
      },
      order: {
        priority: 'DESC',
        id: 'DESC',
      },
    });

    const matched = policies.find((policy) => {
      if (policy.employment_type && policy.employment_type !== employee.employment_type) {
        return false;
      }

      if (policy.grade_id && policy.grade_id !== employee.grade_id) {
        return false;
      }

      if (
        policy.position_id &&
        policy.position_id !== employee.primary_position_id
      ) {
        return false;
      }

      if (
        policy.confirmation_status &&
        policy.confirmation_status !== employee.confirmation_status
      ) {
        return false;
      }

      return true;
    });

    return (
      matched?.notice_days ??
      this.configService.get<number>('OFFBOARDING_DEFAULT_NOTICE_DAYS') ??
      30
    );
  }

  async calculate(input: {
    companyId: number;
    employee: Employee;
    noticeDate: string | null;
    lastWorkingDate: string;
    waived?: boolean;
    waiverReason?: string;
  }) {
    const noticeDays = await this.resolveNoticeDays(
      input.companyId,
      input.employee,
    );

    if (input.waived && !input.waiverReason?.trim()) {
      throw new BadRequestException(
        'notice_period_waiver_reason is required when notice period is waived',
      );
    }

    if (!input.noticeDate) {
      return {
        notice_period_days: noticeDays,
        served_days: 0,
        shortfall_days: input.waived ? 0 : noticeDays,
        excess_days: 0,
      };
    }

    const servedDays = this.daysBetween(input.noticeDate, input.lastWorkingDate);
    if (servedDays < 0) {
      throw new BadRequestException(
        'notice_date cannot be after last_working_date',
      );
    }

    return {
      notice_period_days: noticeDays,
      served_days: servedDays,
      shortfall_days: input.waived
        ? 0
        : Math.max(0, noticeDays - servedDays),
      excess_days: Math.max(0, servedDays - noticeDays),
    };
  }
}
