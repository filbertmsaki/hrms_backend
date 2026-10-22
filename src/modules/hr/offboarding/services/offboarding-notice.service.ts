import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { OffboardingNoticePolicy } from '../entities/offboarding-notice-policy.entity';
import { UpsertOffboardingNoticePolicyDto } from '../dtos/upsert-offboarding-notice-policy.dto';

@Injectable()
export class OffboardingNoticeService {
  constructor(
    @InjectRepository(OffboardingNoticePolicy)
    private readonly policyRepository: Repository<OffboardingNoticePolicy>,
    private readonly configService: ConfigService,
  ) {}

  listPolicies(companyId: number) {
    return this.policyRepository.find({
      where: { company_id: companyId },
      order: { priority: 'DESC', id: 'DESC' },
    });
  }

  async createPolicy(companyId: number, dto: UpsertOffboardingNoticePolicyDto) {
    const policy = this.policyRepository.create({
      ...dto,
      company_id: companyId,
    });
    return this.policyRepository.save(policy);
  }

  async updatePolicy(
    companyId: number,
    id: number,
    dto: Partial<UpsertOffboardingNoticePolicyDto>,
  ) {
    const policy = await this.policyRepository.findOne({
      where: { company_id: companyId, id },
    });
    if (!policy)
      throw new NotFoundException('Offboarding notice policy not found');
    Object.assign(policy, dto);
    return this.policyRepository.save(policy);
  }

  async deletePolicy(companyId: number, id: number) {
    const result = await this.policyRepository.delete({
      company_id: companyId,
      id,
    });
    if (!result.affected)
      throw new NotFoundException('Offboarding notice policy not found');
    return { deleted: true };
  }

  private daysBetween(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    return Math.floor((end.getTime() - start.getTime()) / 86400000);
  }

  private addNoticeDays(
    startDate: string,
    days: number,
    calendarDays: boolean,
  ): string {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    let remaining = days;
    while (remaining > 0) {
      date.setUTCDate(date.getUTCDate() + 1);
      if (calendarDays || (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)) {
        remaining -= 1;
      }
    }
    return date.toISOString().slice(0, 10);
  }

  private countNoticeDays(
    startDate: string,
    endDate: string,
    calendarDays: boolean,
  ): number {
    if (calendarDays) return this.daysBetween(startDate, endDate);

    const date = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    let days = 0;
    while (date < end) {
      date.setUTCDate(date.getUTCDate() + 1);
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) days += 1;
    }
    return days;
  }

  private async resolvePolicy(
    companyId: number,
    employee: Employee,
  ): Promise<OffboardingNoticePolicy | null> {
    const policies = await this.policyRepository.find({
      where: { company_id: companyId, status: 'active' },
      order: { priority: 'DESC', id: 'DESC' },
    });

    return (
      policies.find((policy) => {
        if (
          policy.employment_type &&
          String(policy.employment_type) !== String(employee.employment_type)
        )
          return false;
        if (policy.grade_id && policy.grade_id !== employee.grade_id)
          return false;
        if (
          policy.position_id &&
          policy.position_id !== employee.primary_position_id
        )
          return false;
        if (
          policy.confirmation_status &&
          String(policy.confirmation_status) !==
            String(employee.confirmation_status)
        )
          return false;
        return true;
      }) ?? null
    );
  }

  async resolveNoticeDays(
    companyId: number,
    employee: Employee,
  ): Promise<number> {
    const matched = await this.resolvePolicy(companyId, employee);
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
    lastWorkingDate?: string | null;
    waived?: boolean;
    waiverReason?: string;
  }) {
    if (!input.lastWorkingDate && input.noticeDate) {
      const policy = await this.resolvePolicy(input.companyId, input.employee);
      if (!policy) {
        throw new BadRequestException(
          'An active notice policy is required to calculate the last working date.',
        );
      }
    }
    const matchedPolicy = await this.resolvePolicy(
      input.companyId,
      input.employee,
    );
    const noticeDays =
      matchedPolicy?.notice_days ??
      this.configService.get<number>('OFFBOARDING_DEFAULT_NOTICE_DAYS') ??
      30;
    const calendarDays = matchedPolicy?.calculate_calendar_days ?? true;

    if (input.waived && !input.waiverReason?.trim()) {
      throw new BadRequestException(
        'notice_period_waiver_reason is required when notice period is waived',
      );
    }

    if (!input.noticeDate && !input.lastWorkingDate) {
      throw new BadRequestException(
        'Provide a notice date or last working date to calculate offboarding notice.',
      );
    }

    const recommendedLastWorkingDate = input.noticeDate
      ? this.addNoticeDays(input.noticeDate, noticeDays, calendarDays)
      : input.lastWorkingDate!;
    const lastWorkingDate = input.lastWorkingDate ?? recommendedLastWorkingDate;

    if (!input.noticeDate) {
      return {
        notice_period_days: noticeDays,
        served_days: 0,
        shortfall_days: input.waived ? 0 : noticeDays,
        excess_days: 0,
        last_working_date: lastWorkingDate,
        recommended_last_working_date: recommendedLastWorkingDate,
        calculation_mode: calendarDays ? 'CALENDAR_DAYS' : 'WEEKDAYS',
      };
    }

    const servedDays = this.countNoticeDays(
      input.noticeDate,
      lastWorkingDate,
      calendarDays,
    );
    if (servedDays < 0) {
      throw new BadRequestException(
        'notice_date cannot be after last_working_date',
      );
    }

    return {
      notice_period_days: noticeDays,
      served_days: servedDays,
      shortfall_days: input.waived ? 0 : Math.max(0, noticeDays - servedDays),
      excess_days: Math.max(0, servedDays - noticeDays),
      last_working_date: lastWorkingDate,
      recommended_last_working_date: recommendedLastWorkingDate,
      calculation_mode: calendarDays ? 'CALENDAR_DAYS' : 'WEEKDAYS',
    };
  }
}
