import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { PayrollPeriod } from '../payroll/entities/payroll-configuration.entities';
import { PayrollInput } from '../payroll/entities/payroll-run.entities';
import {
  PayrollInputStatusEnum,
  PayrollPeriodStatusEnum,
} from '../payroll/payroll.enums';
import { LeaveService } from './leave.service';

const actor = { companyMembershipId: 33 } as unknown as AuthenticatedUser;
const dto = {
  payroll_period_code: '2026-11',
  currency: 'tzs',
  payable_amount: 250000,
};

function setup(options: {
  status?: string;
  periodStatus?: PayrollPeriodStatusEnum | null;
  handedOff?: boolean;
}) {
  const item = {
    id: 5,
    company_id: 10,
    employee_id: 501,
    leave_type_id: 7,
    fiscal_year: '2026',
    approved_days: '4.00',
    status: options.status ?? 'approved',
    ledger_transaction_id: 900,
    payroll_handoff_reference: options.handedOff ? 'X' : null,
  };
  const inputSave = jest.fn(async (row: Record<string, unknown>) => ({
    ...row,
    id: 77,
  }));
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === PayrollPeriod)
        return {
          findOne: jest.fn().mockResolvedValue(
            options.periodStatus === null
              ? null
              : {
                  id: 3,
                  status: options.periodStatus ?? PayrollPeriodStatusEnum.OPEN,
                },
          ),
        };
      if (entity === PayrollInput)
        return { create: (row: unknown) => row, save: inputSave };
      return {
        findOne: jest.fn().mockResolvedValue(item),
        save: jest.fn(async (row: unknown) => row),
      };
    },
  };
  const instance = Object.create(LeaveService.prototype) as LeaveService;
  Object.assign(instance, {
    dataSource: { transaction: (fn: (m: unknown) => unknown) => fn(manager) },
    leaveAuditService: { log: jest.fn().mockResolvedValue(undefined) },
  });
  return { instance, inputSave, item };
}

describe('LeaveService.recordLeaveEncashmentPayrollHandoff', () => {
  it('creates a draft LEAVE_ENCASHMENT payroll input and links it', async () => {
    const { instance, inputSave } = setup({});
    const saved = await instance.recordLeaveEncashmentPayrollHandoff(
      10,
      5,
      dto as never,
      actor,
    );
    expect(inputSave).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        payrollPeriodId: 3,
        employeeId: 501,
        componentCode: 'LEAVE_ENCASHMENT',
        sourceReference: 'leave-encashment:5',
        amount: '250000.00',
        currency: 'TZS',
        status: PayrollInputStatusEnum.DRAFT,
      }),
    );
    expect(saved.payroll_input_id).toBe(77);
    expect(saved.payroll_handoff_reference).toBe('PAYROLL-INPUT-77');
  });

  it('keeps a reference typed by HR', async () => {
    const { instance } = setup({});
    const saved = await instance.recordLeaveEncashmentPayrollHandoff(
      10,
      5,
      { ...dto, reference: 'HR-REF-1' } as never,
      actor,
    );
    expect(saved.payroll_handoff_reference).toBe('HR-REF-1');
  });

  it('refuses a locked period, a missing period, or a zero amount', async () => {
    await expect(
      setup({
        periodStatus: PayrollPeriodStatusEnum.LOCKED,
      }).instance.recordLeaveEncashmentPayrollHandoff(10, 5, dto as never, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup({ periodStatus: null }).instance.recordLeaveEncashmentPayrollHandoff(
        10,
        5,
        dto as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({}).instance.recordLeaveEncashmentPayrollHandoff(
        10,
        5,
        { ...dto, payable_amount: 0 } as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses unapproved or already handed-off encashments', async () => {
    await expect(
      setup({ status: 'pending' }).instance.recordLeaveEncashmentPayrollHandoff(
        10,
        5,
        dto as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup({ handedOff: true }).instance.recordLeaveEncashmentPayrollHandoff(
        10,
        5,
        dto as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
