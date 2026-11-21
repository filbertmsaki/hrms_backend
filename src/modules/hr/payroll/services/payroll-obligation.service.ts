import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Not, Repository } from 'typeorm';
import {
  PayrollObligationStatusEnum,
  PayrollPaymentObligation,
} from '../entities/payroll-payment-obligation.entities';
import { PayrollComponentTypeEnum } from '../payroll.enums';
import { PayrollMoney } from './payroll-money.util';

const EARNING_TYPES = new Set<string>([
  PayrollComponentTypeEnum.EARNING,
  PayrollComponentTypeEnum.TAXABLE_BENEFIT,
  PayrollComponentTypeEnum.REIMBURSEMENT,
]);

export type ObligationLine = {
  componentCode?: string | null;
  componentType?: string | null;
  amount?: string | null;
  sourceType?: string | null;
  sourceReference?: string | null;
  calculationSnapshot?: Record<string, unknown> | null;
};

export type ObligationCandidate = {
  employeeId: number;
  componentCode: string;
  kind: 'RECURRING' | 'ONE_OFF';
  sourceKey: string;
  amount: string;
  entitlement: string | null;
};

export type ObligationConflict = {
  employee_id: number;
  component_code: string;
  source_key: string;
  amount: string;
  already_claimed: string;
  entitlement: string | null;
  claimed_by_run_ids: number[];
  reason: string;
};

/** Recurring salary components (amount-checked against the entitlement). */
export function isRecurringSalaryLine(line: ObligationLine) {
  return (
    (line.componentCode === 'BASIC' && line.sourceType === 'COMPENSATION') ||
    line.sourceType === 'SALARY_STRUCTURE'
  );
}

/**
 * Maps a calculated earning line to the obligation it settles. Deductions,
 * statutory and employer lines are not payment obligations.
 */
export function obligationFor(
  employeeId: number,
  line: ObligationLine,
): ObligationCandidate | null {
  if (!line.componentType || !EARNING_TYPES.has(line.componentType))
    return null;
  const amount = line.amount ?? '0.00';
  if (PayrollMoney.toCents(amount) <= 0n) return null;
  const componentCode = String(line.componentCode ?? '').toUpperCase();
  const snapshot = line.calculationSnapshot ?? {};
  if (isRecurringSalaryLine(line)) {
    return {
      employeeId,
      componentCode,
      kind: 'RECURRING',
      sourceKey: String(line.sourceType),
      amount,
      entitlement: amount,
    };
  }
  // An explicit input paying a recurring component (e.g. an unpaid-salary
  // settlement in an off-cycle run) is checked by amount, against the
  // entitlement already established for the period or the approved
  // entitlement recorded on the input.
  const rawInputId = snapshot.input_id;
  const inputId =
    typeof rawInputId === 'number' || typeof rawInputId === 'string'
      ? String(rawInputId)
      : null;
  const schemeId =
    typeof snapshot.scheme_id === 'number' ||
    typeof snapshot.scheme_id === 'string'
      ? String(snapshot.scheme_id)
      : null;
  if (inputId !== null && snapshot.settles_recurring_salary === true) {
    return {
      employeeId,
      componentCode,
      kind: 'RECURRING',
      sourceKey: `INPUT:${inputId}`,
      amount,
      entitlement:
        typeof snapshot.salary_entitlement === 'string'
          ? snapshot.salary_entitlement
          : null,
    };
  }
  const sourceKey =
    inputId !== null
      ? `INPUT:${inputId}`
      : line.sourceType === 'CORRECTION'
        ? `INPUT:${line.sourceReference}`
        : schemeId !== null
          ? `BONUS_SCHEME:${schemeId}`
          : `${line.sourceType ?? 'LINE'}:${line.sourceReference ?? componentCode}`;
  return {
    employeeId,
    componentCode,
    kind: 'ONE_OFF',
    sourceKey,
    amount,
    entitlement: null,
  };
}

/**
 * Pure check of new candidates against claims already held by other runs.
 * Recurring: total claimed + new may not exceed the period entitlement.
 * One-off: the same source may be claimed once.
 */
export function findObligationConflicts(
  candidates: ObligationCandidate[],
  existing: Array<
    Pick<
      PayrollPaymentObligation,
      | 'employeeId'
      | 'componentCode'
      | 'obligationKind'
      | 'sourceKey'
      | 'amount'
      | 'entitlementAmount'
      | 'payrollRunId'
    >
  >,
): ObligationConflict[] {
  const conflicts: ObligationConflict[] = [];
  const pendingRecurring = new Map<string, bigint>();
  for (const candidate of candidates) {
    const sameComponent = existing.filter(
      (row) =>
        row.employeeId === candidate.employeeId &&
        row.componentCode === candidate.componentCode,
    );
    if (candidate.kind === 'ONE_OFF') {
      const holders = sameComponent.filter(
        (row) => row.sourceKey === candidate.sourceKey,
      );
      if (holders.length > 0) {
        conflicts.push({
          employee_id: candidate.employeeId,
          component_code: candidate.componentCode,
          source_key: candidate.sourceKey,
          amount: candidate.amount,
          already_claimed: holders.reduce(
            (sum, row) => PayrollMoney.add(sum, row.amount),
            '0.00',
          ),
          entitlement: null,
          claimed_by_run_ids: [
            ...new Set(holders.map((row) => row.payrollRunId)),
          ],
          reason: 'This item is already paid or being paid by another run.',
        });
      }
      continue;
    }
    const recurring = sameComponent.filter(
      (row) => row.obligationKind === 'RECURRING',
    );
    const entitlementCandidates = [
      candidate.entitlement,
      ...recurring.map((row) => row.entitlementAmount),
    ].filter((value): value is string => Boolean(value));
    const entitlement = entitlementCandidates.length
      ? entitlementCandidates
          .map((value) => PayrollMoney.toCents(value))
          .reduce((max, value) => (value > max ? value : max), 0n)
      : null;
    const key = `${candidate.employeeId}|${candidate.componentCode}`;
    const claimed =
      recurring.reduce(
        (sum, row) => sum + PayrollMoney.toCents(row.amount),
        0n,
      ) + (pendingRecurring.get(key) ?? 0n);
    const total = claimed + PayrollMoney.toCents(candidate.amount);
    if (entitlement === null || total > entitlement) {
      conflicts.push({
        employee_id: candidate.employeeId,
        component_code: candidate.componentCode,
        source_key: candidate.sourceKey,
        amount: candidate.amount,
        already_claimed: PayrollMoney.fromCents(claimed),
        entitlement:
          entitlement === null ? null : PayrollMoney.fromCents(entitlement),
        claimed_by_run_ids: [
          ...new Set(recurring.map((row) => row.payrollRunId)),
        ],
        reason:
          entitlement === null
            ? 'No salary entitlement is established for this period; record the approved entitlement on the input.'
            : 'This would pay more salary for the period than the employee is entitled to.',
      });
      continue;
    }
    pendingRecurring.set(
      key,
      (pendingRecurring.get(key) ?? 0n) +
        PayrollMoney.toCents(candidate.amount),
    );
  }
  return conflicts;
}

@Injectable()
export class PayrollObligationService {
  constructor(
    @InjectRepository(PayrollPaymentObligation)
    private readonly repository: Repository<PayrollPaymentObligation>,
  ) {}

  /**
   * Releases the run's previous claims and claims the new calculation, under
   * a per-employee-and-period advisory lock so concurrent runs serialize.
   * Throws PAYROLL_DUPLICATE_PAYMENT with every conflict when any exists.
   */
  async reserveForRun(args: {
    companyId: number;
    payrollPeriodId: number;
    payrollRunId: number;
    runType: string;
    employees: Array<{ employeeId: number; lines: ObligationLine[] }>;
  }) {
    const candidates = args.employees.flatMap((employee) =>
      employee.lines
        .map((line) => obligationFor(employee.employeeId, line))
        .filter((item): item is ObligationCandidate => item !== null),
    );
    return this.repository.manager.transaction(async (manager) => {
      await this.releaseWith(manager, args.companyId, args.payrollRunId);
      const employeeIds = [
        ...new Set(candidates.map((item) => item.employeeId)),
      ].sort((a, b) => a - b);
      for (const employeeId of employeeIds) {
        await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
          args.companyId * 100000 + (args.payrollPeriodId % 100000),
          employeeId,
        ]);
      }
      const existing = employeeIds.length
        ? await manager.getRepository(PayrollPaymentObligation).find({
            where: {
              companyId: args.companyId,
              payrollPeriodId: args.payrollPeriodId,
              employeeId: In(employeeIds),
              status: Not(PayrollObligationStatusEnum.RELEASED),
              payrollRunId: Not(args.payrollRunId),
            },
          })
        : [];
      const conflicts = findObligationConflicts(candidates, existing);
      if (conflicts.length > 0) {
        throw new ConflictException({
          message:
            'Payroll would pay amounts that are already paid or being paid by another run. Remove them from this run or cancel the other run first.',
          code: 'PAYROLL_DUPLICATE_PAYMENT',
          conflicts,
        });
      }
      if (candidates.length > 0) {
        await manager.getRepository(PayrollPaymentObligation).save(
          candidates.map((item) =>
            manager.getRepository(PayrollPaymentObligation).create({
              companyId: args.companyId,
              employeeId: item.employeeId,
              payrollPeriodId: args.payrollPeriodId,
              componentCode: item.componentCode,
              obligationKind: item.kind,
              sourceKey: item.sourceKey,
              amount: item.amount,
              entitlementAmount: item.entitlement,
              payrollRunId: args.payrollRunId,
              runType: args.runType,
              status: PayrollObligationStatusEnum.RESERVED,
            }),
          ),
        );
      }
      return { reserved: candidates.length };
    });
  }

  releaseForRun(companyId: number, payrollRunId: number) {
    return this.releaseWith(this.repository.manager, companyId, payrollRunId);
  }

  /** Marks an employee's claims settled once their net pay is confirmed. */
  async settleForEmployee(
    companyId: number,
    payrollRunId: number,
    employeeId: number,
  ) {
    await this.repository.update(
      {
        companyId,
        payrollRunId,
        employeeId,
        status: PayrollObligationStatusEnum.RESERVED,
      },
      { status: PayrollObligationStatusEnum.SETTLED },
    );
  }

  private async releaseWith(
    manager: EntityManager,
    companyId: number,
    payrollRunId: number,
  ) {
    // Settled claims are paid money and are never released here; reversing
    // paid salary goes through correction runs and recoveries.
    await manager.getRepository(PayrollPaymentObligation).update(
      {
        companyId,
        payrollRunId,
        status: PayrollObligationStatusEnum.RESERVED,
      },
      { status: PayrollObligationStatusEnum.RELEASED },
    );
  }
}
