import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { OffboardingNoticePolicy } from '../entities/offboarding-notice-policy.entity';
import { OffboardingNoticeService } from './offboarding-notice.service';

describe('OffboardingNoticeService', () => {
  const employee = {
    employment_type: 'permanent',
    grade_id: 2,
    primary_position_id: 3,
    confirmation_status: 'confirmed',
  } as Employee;

  it('uses the matching company policy and calculates notice shortfall/excess', async () => {
    const policies = [
      {
        notice_days: 30,
        employment_type: 'permanent',
        grade_id: 2,
        position_id: 3,
        confirmation_status: 'confirmed',
      },
    ];
    const repository = {
      find: jest.fn().mockResolvedValue(policies),
    } as unknown as Repository<OffboardingNoticePolicy>;
    const service = new OffboardingNoticeService(repository, {
      get: jest.fn().mockReturnValue(14),
    } as unknown as ConfigService);

    await expect(
      service.calculate({
        companyId: 10,
        employee,
        noticeDate: '2026-10-01',
        lastWorkingDate: '2026-10-20',
      }),
    ).resolves.toEqual({
      notice_period_days: 30,
      served_days: 19,
      shortfall_days: 11,
      excess_days: 0,
      last_working_date: '2026-10-20',
      recommended_last_working_date: '2026-10-31',
      calculation_mode: 'CALENDAR_DAYS',
    });
    expect(repository.find).toHaveBeenCalledWith({
      where: { company_id: 10, status: 'active' },
      order: { priority: 'DESC', id: 'DESC' },
    });
  });

  it('requires a reason for a notice waiver and clears the shortfall when waived', async () => {
    const service = new OffboardingNoticeService(
      {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<OffboardingNoticePolicy>,
      { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService,
    );

    await expect(
      service.calculate({
        companyId: 10,
        employee,
        noticeDate: null,
        lastWorkingDate: '2026-10-30',
        waived: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.calculate({
        companyId: 10,
        employee,
        noticeDate: null,
        lastWorkingDate: '2026-10-30',
        waived: true,
        waiverReason: 'Approved by HR',
      }),
    ).resolves.toEqual({
      notice_period_days: 30,
      served_days: 0,
      shortfall_days: 0,
      excess_days: 0,
      last_working_date: '2026-10-30',
      recommended_last_working_date: '2026-10-30',
      calculation_mode: 'CALENDAR_DAYS',
    });
  });

  it('derives the last working date from a calendar-day notice policy', async () => {
    const service = new OffboardingNoticeService(
      {
        find: jest
          .fn()
          .mockResolvedValue([
            { notice_days: 30, calculate_calendar_days: true },
          ]),
      } as unknown as Repository<OffboardingNoticePolicy>,
      { get: jest.fn() } as unknown as ConfigService,
    );

    await expect(
      service.calculate({
        companyId: 10,
        employee,
        noticeDate: '2026-10-01',
      }),
    ).resolves.toMatchObject({
      last_working_date: '2026-10-31',
      recommended_last_working_date: '2026-10-31',
      served_days: 30,
      shortfall_days: 0,
    });
  });

  it('derives workdays when the matching policy excludes weekends', async () => {
    const service = new OffboardingNoticeService(
      {
        find: jest
          .fn()
          .mockResolvedValue([
            { notice_days: 5, calculate_calendar_days: false },
          ]),
      } as unknown as Repository<OffboardingNoticePolicy>,
      { get: jest.fn() } as unknown as ConfigService,
    );

    await expect(
      service.calculate({
        companyId: 10,
        employee,
        noticeDate: '2026-10-22',
      }),
    ).resolves.toMatchObject({
      last_working_date: '2026-10-29',
      recommended_last_working_date: '2026-10-29',
      served_days: 5,
      calculation_mode: 'WEEKDAYS',
    });
  });
});
