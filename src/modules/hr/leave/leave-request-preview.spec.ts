import { BadRequestException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveDurationTypeEnum } from './enums/leave-duration-type.enum';
import { LeaveRecordStatusEnum } from './enums/leave-record-status.enum';
import { LeaveService } from './leave.service';

const actor = {
  companyId: 10,
  companyMembershipId: 33,
  permissions: ['leave_requests:create'],
} as unknown as AuthenticatedUser;

function setup(options: {
  chargeable?: number;
  excluded?: Array<{ date: string; reason: string }>;
  requiresAttachment?: boolean;
  thresholdDays?: number | null;
  overlap?: boolean;
  available?: string;
}) {
  const service = Object.create(LeaveService.prototype) as LeaveService &
    Record<string, unknown>;
  Object.assign(service, {
    findEmployeeOrFail: jest.fn().mockResolvedValue({
      id: 501,
      company_user_id: 33,
      employment_status: 'active',
    }),
    hrAccessService: { assertCanAccessEmployee: jest.fn() },
    findLeaveTypeOrFail: jest.fn().mockResolvedValue({
      id: 7,
      status: LeaveRecordStatusEnum.ACTIVE,
      is_paid: true,
      requires_attachment: options.requiresAttachment ?? false,
      attachment_required_after_days: options.thresholdDays ?? null,
      allow_deferred_attachment: true,
      attachment_grace_days: 3,
      gender_restriction: 'all',
    }),
    assertEmployeeCanRequestLeave: jest.fn(),
    validateNoOverlap: options.overlap
      ? jest
          .fn()
          .mockRejectedValue(new BadRequestException('Overlaps leave LV-1'))
      : jest.fn(),
    resolvePolicyContext: jest.fn().mockResolvedValue({
      policy: null,
      accrual: null,
      allowNegativeBalance: false,
      maxConsecutiveDays: null,
      maxPerRequestDays: null,
    }),
    calculateLeaveDuration: jest.fn().mockResolvedValue({
      totalDays: options.chargeable ?? 5,
      snapshot: {
        included_dates: [],
        excluded_dates: options.excluded ?? [],
      },
    }),
    leaveBalanceRepository: {
      findOne: jest.fn().mockResolvedValue({
        fiscal_year: '2026',
        accrued_days: options.available ?? '21',
        entitlement_days: '21',
        opening_balance_days: '0',
      }),
    },
    leaveBalanceService: {
      isAccruingPolicy: () => false,
      cycleForDate: (_config: unknown, date: string) => ({
        label: date.slice(0, 4),
        startDate: `${date.slice(0, 4)}-01-01`,
        endDate: `${date.slice(0, 4)}-12-31`,
      }),
    },
  });
  return service;
}

const dto = {
  employee_id: 501,
  leave_type_id: 7,
  duration_type: LeaveDurationTypeEnum.FULL_DAY,
  start_date: '2026-12-07',
  end_date: '2026-12-13',
};

describe('LeaveService.previewLeaveRequest', () => {
  it('reports the server day count with weekly offs and holidays split out', async () => {
    const result = await setup({
      chargeable: 4,
      excluded: [
        { date: '2026-12-09', reason: 'holiday' },
        { date: '2026-12-12', reason: 'weekly_off' },
        { date: '2026-12-13', reason: 'weekly_off' },
      ],
    }).previewLeaveRequest(10, dto, actor);
    expect(result).toMatchObject({
      calendar_days: 7,
      chargeable_days: 4,
      weekly_off_days: 2,
      public_holiday_days: 1,
      can_submit: true,
    });
  });

  it('applies the document threshold to working days, not calendar days', async () => {
    // 7 calendar days but only 4 working days; documents after 5 days.
    const result = await setup({
      chargeable: 4,
      requiresAttachment: true,
      thresholdDays: 5,
    }).previewLeaveRequest(10, dto, actor);
    expect(result.evidence.required).toBe(false);
    const longer = await setup({
      chargeable: 6,
      requiresAttachment: true,
      thresholdDays: 5,
    }).previewLeaveRequest(10, dto, actor);
    expect(longer.evidence.required).toBe(true);
  });

  it('returns problems as issues instead of failing', async () => {
    const result = await setup({
      overlap: true,
      chargeable: 5,
      available: '3',
    }).previewLeaveRequest(10, dto, actor);
    expect(result.can_submit).toBe(false);
    expect(result.issues).toEqual([
      'Overlaps leave LV-1',
      expect.stringContaining('Insufficient leave balance: 3 day(s)'),
    ]);
  });
});
