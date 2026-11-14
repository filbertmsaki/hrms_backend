import { LeaveRequestApproval } from './entities/leave-request-approval.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveApprovalStatusEnum } from './enums/leave-approval-status.enum';
import { LeaveStatusEnum } from './enums/leave-status.enum';
import { LeaveService } from './leave.service';

const DAY = 86_400_000;
const now = new Date('2026-11-13T07:30:00Z');

function buildRequest(overrides: Partial<LeaveRequest> = {}) {
  return {
    id: 1,
    company_id: 10,
    employee_id: 501,
    leave_type_id: 7,
    status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
    routing_required: false,
    approval_cycle: 1,
    current_approval_level: 1,
    start_date: '2026-11-20',
    end_date: '2026-11-21',
    total_days: '2.00',
    applied_at: new Date(now.getTime() - 3 * DAY),
    created_at: new Date(now.getTime() - 3 * DAY),
    calculation_snapshot: { included_dates: ['2026-11-20', '2026-11-21'] },
    leave_type: { id: 7, auto_approve_after_days: 3 },
    ...overrides,
  } as unknown as LeaveRequest;
}

function setup(request: LeaveRequest) {
  const saved: LeaveRequest[] = [];
  const approvalUpdate = jest.fn().mockResolvedValue(undefined);
  const requestRepo = {
    findOne: jest.fn().mockResolvedValue(request),
    findOneOrFail: jest.fn().mockResolvedValue(request),
    save: jest.fn(async (row: LeaveRequest) => {
      saved.push({ ...row });
      return row;
    }),
  };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === LeaveRequestApproval ? { update: approvalUpdate } : requestRepo,
  };
  const instance = Object.create(LeaveService.prototype) as LeaveService;
  const deps = {
    dataSource: { transaction: (fn: (m: unknown) => unknown) => fn(manager) },
    findEmployeeOrFail: jest.fn().mockResolvedValue({ id: 501 }),
    leaveBalanceService: {
      getFiscalYearFromDate: (date: string) => date.slice(0, 4),
      ensureBalancesForEmployeeYear: jest.fn().mockResolvedValue([{ id: 1 }]),
      toNumber: (value: unknown) => Number(value),
    },
    leaveBalanceLedgerService: {
      consumeReservedLeaveByYear: jest.fn().mockResolvedValue(undefined),
    },
    queueAttendanceRecalculationForLeaveWindow: jest
      .fn()
      .mockResolvedValue(undefined),
    leaveAuditService: { log: jest.fn().mockResolvedValue(undefined) },
    leaveWorkflowService: {
      notifyCommittedOutcome: jest.fn().mockResolvedValue(undefined),
    },
  };
  Object.assign(instance, deps);
  return { instance, deps, saved, approvalUpdate };
}

describe('LeaveService.autoApproveOverdueRequest', () => {
  it('approves a request that waited the leave type period', async () => {
    const { instance, deps, saved, approvalUpdate } = setup(buildRequest());

    await expect(instance.autoApproveOverdueRequest(1, now)).resolves.toBe(
      true,
    );

    expect(saved[0].status).toBe(LeaveStatusEnum.APPROVED);
    expect(saved[0].current_approval_level).toBe(0);
    expect(approvalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: LeaveApprovalStatusEnum.PENDING }),
      expect.objectContaining({ status: LeaveApprovalStatusEnum.SKIPPED }),
    );
    expect(
      deps.leaveBalanceLedgerService.consumeReservedLeaveByYear,
    ).toHaveBeenCalledWith(
      [{ id: 1 }],
      expect.objectContaining({
        days: 2,
        createdByCompanyUserId: null,
        idempotencyKey: 'leave-request:1:cycle:1:approve',
      }),
      expect.anything(),
    );
    expect(deps.queueAttendanceRecalculationForLeaveWindow).toHaveBeenCalled();
    expect(deps.leaveAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'leave_request.auto_approved' }),
      expect.anything(),
    );
    expect(
      deps.leaveWorkflowService.notifyCommittedOutcome,
    ).toHaveBeenCalledWith(expect.anything(), expect.any(String), null);
  });

  it.each([
    ['the leave type has auto-approval off', { leave_type: { auto_approve_after_days: null } }],
    ['the waiting period has not passed', { applied_at: new Date(now.getTime() - 2 * DAY) }],
    ['the request is already approved', { status: LeaveStatusEnum.APPROVED }],
    ['the request is rejected', { status: LeaveStatusEnum.REJECTED }],
    ['routing still needs HR correction', { routing_required: true }],
  ])('does nothing when %s', async (_label, overrides) => {
    const { instance, deps, saved } = setup(
      buildRequest(overrides as Partial<LeaveRequest>),
    );

    await expect(instance.autoApproveOverdueRequest(1, now)).resolves.toBe(
      false,
    );

    expect(saved).toHaveLength(0);
    expect(
      deps.leaveBalanceLedgerService.consumeReservedLeaveByYear,
    ).not.toHaveBeenCalled();
    expect(
      deps.leaveWorkflowService.notifyCommittedOutcome,
    ).not.toHaveBeenCalled();
  });
});
