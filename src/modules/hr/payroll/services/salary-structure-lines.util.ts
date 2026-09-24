import { BadRequestException } from '@nestjs/common';
import type { SalaryComponentOverride } from '../../employee-movements/entities/employee-compensation-version.entity';
import type {
  PayrollComponent,
  SalaryStructure,
  SalaryStructureComponent,
} from '../entities/payroll-configuration.entities';
import {
  PayrollCalculationMethodEnum,
  PayrollComponentFrequencyEnum,
  PayrollComponentTypeEnum,
  PayrollTaxTreatmentEnum,
} from '../payroll.enums';
import { PayrollMoney } from './payroll-money.util';

/** Base salary always comes from the employee's compensation record. */
export const BASE_SALARY_COMPONENT_CODE = 'BASIC';

export type SalaryStructureLine = {
  componentCode: string;
  componentName: string;
  componentType: PayrollComponentTypeEnum;
  amount: string;
  taxableAmount: string;
  employerAmount: string;
  calculationOrder: number;
  sourceType: 'SALARY_STRUCTURE';
  sourceReference: string;
  calculationSnapshot: Record<string, unknown>;
};

export type SkippedSalaryStructureLine = {
  component_code: string;
  reason:
    | 'BASE_SALARY_FROM_COMPENSATION'
    | 'EXCLUDED_BY_EMPLOYEE_OVERRIDE'
    | 'REPLACED_BY_PAYROLL_INPUT'
    | 'COMPONENT_INACTIVE'
    | 'NON_RECURRING_COMPONENT'
    | 'INFORMATIONAL_COMPONENT'
    | 'ZERO_AMOUNT';
};

export function taxableAmountFor(
  amount: string,
  component?: PayrollComponent | null,
) {
  if (!component) return amount;
  switch (component.taxTreatment) {
    case PayrollTaxTreatmentEnum.NON_TAXABLE:
    case PayrollTaxTreatmentEnum.TAX_EXEMPT:
      return '0.00';
    case PayrollTaxTreatmentEnum.PARTIALLY_TAXABLE:
      return PayrollMoney.multiplyPercent(amount, component.taxablePercentage);
    default:
      return amount;
  }
}

function hasValue(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export type SalaryOverrideInput = {
  component_code: string;
  amount?: string | null;
  rate?: string | null;
  excluded?: boolean;
};

/**
 * Validates employee overrides against the component codes of a salary
 * structure and returns them keyed by code, or null when there are none.
 */
export function normalizeSalaryOverrideInputs(
  overrides: SalaryOverrideInput[],
  structureComponentCodes: Set<string>,
  structureCode: string,
): Record<string, SalaryComponentOverride> | null {
  const result: Record<string, SalaryComponentOverride> = {};
  for (const item of overrides) {
    const code = item.component_code.trim().toUpperCase();
    if (code === BASE_SALARY_COMPONENT_CODE) {
      throw new BadRequestException(
        'BASIC cannot be overridden; change the base salary instead.',
      );
    }
    if (!structureComponentCodes.has(code)) {
      throw new BadRequestException(
        `${code} is not part of salary structure ${structureCode}.`,
      );
    }
    if (result[code]) {
      throw new BadRequestException(`Duplicate override for ${code}.`);
    }
    if (!item.excluded && !hasValue(item.amount) && !hasValue(item.rate)) {
      throw new BadRequestException(
        `Override for ${code} needs an amount, a rate, or excluded=true.`,
      );
    }
    result[code] = {
      amount: hasValue(item.amount) ? item.amount : null,
      rate: hasValue(item.rate) ? item.rate : null,
      excluded: item.excluded ?? false,
    };
  }
  return Object.keys(result).length ? result : null;
}

/**
 * Keeps only the overrides whose component exists in the given structure, so
 * custom amounts survive a move to a structure that shares those components.
 */
export function fitSalaryOverridesToStructure(
  overrides: Record<string, SalaryComponentOverride> | null | undefined,
  structureComponentCodes: Set<string>,
): Record<string, SalaryComponentOverride> | null {
  if (!overrides) return null;
  const kept = Object.entries(overrides).filter(
    ([code]) =>
      code !== BASE_SALARY_COMPONENT_CODE && structureComponentCodes.has(code),
  );
  return kept.length ? Object.fromEntries(kept) : null;
}

/**
 * Turns the lines of a salary structure version into payroll line items for
 * one employee.
 *
 * - BASIC is skipped: base pay is taken from the compensation record.
 * - An override amount wins; otherwise a rate (override or default) is applied
 *   as a percentage of base salary when the component is PERCENTAGE_OF_BASE or
 *   the line has no fixed amount; otherwise the default amount is used.
 * - Components subject to proration use the same ratio as base pay.
 * - Components listed in `replacedComponentCodes` (approved employee inputs for
 *   the period) are skipped so the input replaces the recurring amount.
 */
export function buildSalaryStructureLines(args: {
  structure: SalaryStructure;
  structureComponents: SalaryStructureComponent[];
  componentsById: Map<number, PayrollComponent>;
  baseSalary: string;
  overrides?: Record<string, SalaryComponentOverride> | null;
  proration?: { numerator: number; denominator: number } | null;
  replacedComponentCodes?: Set<string>;
}) {
  const lines: SalaryStructureLine[] = [];
  const skipped: SkippedSalaryStructureLine[] = [];
  const overrides = args.overrides ?? {};
  const ordered = [...args.structureComponents].sort(
    (left, right) =>
      left.calculationOrder - right.calculationOrder || left.id - right.id,
  );

  for (const line of ordered) {
    const component = args.componentsById.get(line.componentId);
    const code = component?.code ?? String(line.componentId);
    if (!component || component.status !== 'ACTIVE') {
      skipped.push({ component_code: code, reason: 'COMPONENT_INACTIVE' });
      continue;
    }
    if (code === BASE_SALARY_COMPONENT_CODE) {
      skipped.push({
        component_code: code,
        reason: 'BASE_SALARY_FROM_COMPENSATION',
      });
      continue;
    }
    if (component.frequency !== PayrollComponentFrequencyEnum.RECURRING) {
      skipped.push({ component_code: code, reason: 'NON_RECURRING_COMPONENT' });
      continue;
    }
    if (component.componentType === PayrollComponentTypeEnum.INFORMATIONAL) {
      skipped.push({ component_code: code, reason: 'INFORMATIONAL_COMPONENT' });
      continue;
    }
    const override = overrides[code];
    if (override?.excluded) {
      skipped.push({
        component_code: code,
        reason: 'EXCLUDED_BY_EMPLOYEE_OVERRIDE',
      });
      continue;
    }
    if (args.replacedComponentCodes?.has(code)) {
      skipped.push({
        component_code: code,
        reason: 'REPLACED_BY_PAYROLL_INPUT',
      });
      continue;
    }

    const overrideAmount = override?.amount;
    const overrideRate = override?.rate;
    const rate = hasValue(overrideRate) ? overrideRate : line.defaultRate;
    let basis: 'OVERRIDE_AMOUNT' | 'RATE_OF_BASE' | 'DEFAULT_AMOUNT';
    let fullAmount: string;
    if (hasValue(overrideAmount)) {
      basis = 'OVERRIDE_AMOUNT';
      fullAmount = PayrollMoney.add(overrideAmount);
    } else if (
      hasValue(rate) &&
      (component.calculationMethod ===
        PayrollCalculationMethodEnum.PERCENTAGE_OF_BASE ||
        PayrollMoney.toCents(line.defaultAmount) === 0n)
    ) {
      basis = 'RATE_OF_BASE';
      fullAmount = PayrollMoney.multiplyPercent(args.baseSalary, rate);
    } else {
      basis = 'DEFAULT_AMOUNT';
      fullAmount = PayrollMoney.add(line.defaultAmount);
    }

    const amount =
      component.subjectToProration && args.proration
        ? PayrollMoney.multiplyRatio(
            fullAmount,
            args.proration.numerator,
            args.proration.denominator,
          )
        : fullAmount;
    if (PayrollMoney.toCents(amount) === 0n) {
      skipped.push({ component_code: code, reason: 'ZERO_AMOUNT' });
      continue;
    }

    const isEmployerCost =
      component.componentType ===
        PayrollComponentTypeEnum.EMPLOYER_CONTRIBUTION ||
      component.componentType === PayrollComponentTypeEnum.EMPLOYER_LEVY;
    const isEarning = [
      PayrollComponentTypeEnum.EARNING,
      PayrollComponentTypeEnum.REIMBURSEMENT,
      PayrollComponentTypeEnum.TAXABLE_BENEFIT,
    ].includes(component.componentType);

    lines.push({
      componentCode: code,
      componentName: component.name,
      componentType: component.componentType,
      amount: isEmployerCost ? '0.00' : amount,
      taxableAmount: isEarning ? taxableAmountFor(amount, component) : '0.00',
      employerAmount: isEmployerCost ? amount : '0.00',
      calculationOrder: line.calculationOrder,
      sourceType: 'SALARY_STRUCTURE',
      sourceReference: `${args.structure.code}:v${args.structure.versionNumber}`,
      calculationSnapshot: {
        salary_structure_id: args.structure.id,
        salary_structure_code: args.structure.code,
        salary_structure_version: args.structure.versionNumber,
        basis,
        full_amount: fullAmount,
        rate: basis === 'RATE_OF_BASE' ? rate : null,
        base_salary: args.baseSalary,
        prorated: Boolean(component.subjectToProration && args.proration),
        overridden: Boolean(override),
      },
    });
  }

  return { lines, skipped };
}
