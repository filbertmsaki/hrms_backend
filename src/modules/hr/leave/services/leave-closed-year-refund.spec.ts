import { BadRequestException } from '@nestjs/common';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';

const ledger = new LeaveBalanceLedgerService(
  {} as never,
  {} as never,
  {} as never,
);

const balance = (year: string, closed: boolean) =>
  ({
    id: Number(year),
    fiscal_year: year,
    used_days: '5.00',
    pending_days: '0.00',
    closed_at: closed ? new Date('2026-01-02') : null,
  }) as unknown as LeaveBalance;

const params = {
  companyId: 1,
  employeeId: 2,
  leaveTypeId: 3,
  leaveYear: '2025',
  effectiveDate: '2026-02-01',
  days: 3,
  idempotencyKey: 'leave-request:9:cycle:1:cancel-approved',
};

describe('reversing approved leave in a year closed by rollover', () => {
  it('refuses a direct refund into a closed year', async () => {
    await expect(
      ledger.reverseApprovedLeave(balance('2025', true), params),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses when no closed-year handler is given', async () => {
    await expect(
      ledger.reverseApprovedLeaveByYear([balance('2025', true)], params),
    ).rejects.toThrow(/closed by the year-end rollover/);
  });

  it('hands closed-year days to the handler with a stable key', async () => {
    const onClosedYear = jest.fn().mockResolvedValue(null);
    await ledger.reverseApprovedLeaveByYear([balance('2025', true)], {
      ...params,
      onClosedYear,
    });
    expect(onClosedYear).toHaveBeenCalledWith(
      expect.objectContaining({ fiscal_year: '2025' }),
      3,
      'leave-request:9:cycle:1:cancel-approved:year:2025:closed',
    );
  });
});
