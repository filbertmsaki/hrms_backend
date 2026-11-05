import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../employees/entities/employee.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveStatusEnum } from './enums/leave-status.enum';
import { LeaveService } from './leave.service';
import { LeaveAccrualMethodEnum } from './enums/leave-accrual-method.enum';
import { LeaveBalanceService } from './services/leave-balance.service';

type RuleHelpers = {
  assertMinimumNotice: (
    policy: LeavePolicy | null,
    employee: Employee,
    startDate: string,
    actor: AuthenticatedUser,
  ) => void;
  assertCanCancelLeaveRequest: (
    companyId: number,
    leaveRequest: LeaveRequest,
    employee: Employee,
    actor: AuthenticatedUser,
  ) => Promise<void>;
  resolvePolicyContext: jest.Mock;
};

function isoInDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const employee = { id: 501, company_user_id: 33 } as Employee;
const owner = {
  companyId: 10,
  companyMembershipId: 33,
  permissions: ['leave_requests:create', 'leave_requests:cancel'],
} as unknown as AuthenticatedUser;
const hr = {
  companyId: 10,
  companyMembershipId: 90,
  permissions: ['leave_requests:approve', 'leave_requests:cancel'],
} as unknown as AuthenticatedUser;
const colleague = {
  companyId: 10,
  companyMembershipId: 77,
  permissions: ['leave_requests:cancel'],
} as unknown as AuthenticatedUser;

function service(policy: Partial<LeavePolicy> | null = null) {
  const instance = Object.create(LeaveService.prototype) as LeaveService &
    RuleHelpers;
  instance.resolvePolicyContext = jest.fn().mockResolvedValue({ policy });
  return instance;
}

function request(status: LeaveStatusEnum, startInDays: number) {
  return {
    id: 1,
    leave_type_id: 7,
    status,
    start_date: isoInDays(startInDays),
  } as LeaveRequest;
}

describe('accrued booking limit', () => {
  const balanceService = Object.create(
    LeaveBalanceService.prototype,
  ) as LeaveBalanceService;
  const daily = {
    accrual_method: LeaveAccrualMethodEnum.DAILY,
    accrual_rate: null,
  };

  function check(days: number, endDate: string, usedDays = '0.00') {
    const instance = Object.create(LeaveService.prototype) as LeaveService & {
      assertWithinAccruedEntitlement: (...args: unknown[]) => void;
      leaveBalanceService: LeaveBalanceService;
      leaveBalanceLedgerService: { daysForBalanceYear: jest.Mock };
    };
    instance.leaveBalanceService = balanceService;
    instance.leaveBalanceLedgerService = {
      daysForBalanceYear: jest.fn(() => days),
    };
    instance.assertWithinAccruedEntitlement(
      [
        {
          leave_type_id: 7,
          fiscal_year: '2026',
          entitlement_days: '28.00',
          opening_balance_days: '0.00',
          carried_forward_days: '0.00',
          adjusted_days: '0.00',
          used_days: usedDays,
          pending_days: '0.00',
          approved_future_days: '0.00',
          expired_days: '0.00',
          attendance_deduction_days: '0.00',
        },
      ],
      { leave_type_id: 7, end_date: endDate, calculation_snapshot: null },
      days,
      '2026',
      { hire_date: '2026-01-01', exit_date: null },
      { accrual: daily, allowNegativeBalance: false },
    );
  }

  it('allows booking up to what accrues by the last day of the leave', () => {
    // 28 × 181/365 ≈ 13.88 days accrued by 30 June
    expect(() => check(13, '2026-06-30')).not.toThrow();
  });

  it('rejects booking beyond what accrues by the last day of the leave', () => {
    expect(() => check(15, '2026-06-30')).toThrow('will have accrued by');
  });

  it('subtracts leave already used', () => {
    expect(() => check(5, '2026-06-30', '10.00')).toThrow(
      'will have accrued by',
    );
  });
});

describe('leave request rules', () => {
  describe('minimum notice', () => {
    const policy = { minimum_notice_days: 5 } as LeavePolicy;

    it('rejects an employee filing inside the notice window', () => {
      expect(() =>
        service().assertMinimumNotice(policy, employee, isoInDays(2), owner),
      ).toThrow(BadRequestException);
    });

    it('accepts an employee filing with enough notice', () => {
      expect(() =>
        service().assertMinimumNotice(policy, employee, isoInDays(5), owner),
      ).not.toThrow();
    });

    it('lets HR record leave on behalf of an employee without notice', () => {
      expect(() =>
        service().assertMinimumNotice(policy, employee, isoInDays(0), hr),
      ).not.toThrow();
    });

    it('does nothing when the policy has no notice rule', () => {
      expect(() =>
        service().assertMinimumNotice(null, employee, isoInDays(0), owner),
      ).not.toThrow();
    });
  });

  describe('cancellation', () => {
    it('refuses someone who is neither the owner nor an approver', async () => {
      await expect(
        service().assertCanCancelLeaveRequest(
          10,
          request(LeaveStatusEnum.PENDING_HR, 10),
          employee,
          colleague,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the owner cancel a pending request', async () => {
      await expect(
        service().assertCanCancelLeaveRequest(
          10,
          request(LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER, 1),
          employee,
          owner,
        ),
      ).resolves.toBeUndefined();
    });

    it('stops the owner cancelling approved leave that has started', async () => {
      await expect(
        service().assertCanCancelLeaveRequest(
          10,
          request(LeaveStatusEnum.APPROVED, 0),
          employee,
          owner,
        ),
      ).rejects.toThrow('already started');
    });

    it('enforces the policy cancellation cutoff for the owner', async () => {
      await expect(
        service({ cancellation_cutoff_days: 3 }).assertCanCancelLeaveRequest(
          10,
          request(LeaveStatusEnum.APPROVED, 2),
          employee,
          owner,
        ),
      ).rejects.toThrow('less than 3 day(s)');
    });

    it('requires an approver when the policy says cancellation needs approval', async () => {
      await expect(
        service({
          cancellation_requires_approval: true,
        }).assertCanCancelLeaveRequest(
          10,
          request(LeaveStatusEnum.APPROVED, 10),
          employee,
          owner,
        ),
      ).rejects.toThrow('only be cancelled by HR');
    });

    it('lets an approver cancel approved leave after it started', async () => {
      await expect(
        service({
          cancellation_requires_approval: true,
          cancellation_cutoff_days: 5,
        }).assertCanCancelLeaveRequest(
          10,
          request(LeaveStatusEnum.APPROVED, -1),
          employee,
          hr,
        ),
      ).resolves.toBeUndefined();
    });
  });
});
