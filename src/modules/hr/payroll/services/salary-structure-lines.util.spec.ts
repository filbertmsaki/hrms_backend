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
  SalaryStructureStatusEnum,
} from '../payroll.enums';
import { buildSalaryStructureLines } from './salary-structure-lines.util';

function component(
  id: number,
  code: string,
  overrides: Partial<PayrollComponent> = {},
): PayrollComponent {
  return {
    id,
    companyId: 1,
    code,
    name: code,
    componentType: PayrollComponentTypeEnum.EARNING,
    frequency: PayrollComponentFrequencyEnum.RECURRING,
    calculationMethod: PayrollCalculationMethodEnum.FIXED_AMOUNT,
    taxTreatment: PayrollTaxTreatmentEnum.TAXABLE,
    taxablePercentage: '100',
    subjectToProration: true,
    status: 'ACTIVE',
    ...overrides,
  } as PayrollComponent;
}

function line(
  id: number,
  componentId: number,
  defaultAmount: string,
  defaultRate: string | null = null,
): SalaryStructureComponent {
  return {
    id,
    companyId: 1,
    salaryStructureId: 10,
    componentId,
    defaultAmount,
    defaultRate,
    calculationOrder: id * 10,
    configuration: null,
  } as SalaryStructureComponent;
}

const structure = {
  id: 10,
  code: 'STD-MONTHLY',
  versionNumber: 2,
  status: SalaryStructureStatusEnum.ACTIVE,
} as SalaryStructure;

const components = [
  component(1, 'BASIC'),
  component(2, 'HOUSING'),
  component(3, 'TRANSPORT', {
    taxTreatment: PayrollTaxTreatmentEnum.NON_TAXABLE,
    subjectToProration: false,
  }),
  component(4, 'MEDICAL', {
    calculationMethod: PayrollCalculationMethodEnum.PERCENTAGE_OF_BASE,
  }),
  component(5, 'UNION_DUES', {
    componentType: PayrollComponentTypeEnum.DEDUCTION,
  }),
  component(6, 'WCF', {
    componentType: PayrollComponentTypeEnum.EMPLOYER_CONTRIBUTION,
  }),
];
const componentsById = new Map(components.map((item) => [item.id, item]));
const lines = [
  line(1, 1, '1000000.00'),
  line(2, 2, '250000.00'),
  line(3, 3, '120000.00'),
  line(4, 4, '0', '5'),
  line(5, 5, '10000.00'),
  line(6, 6, '0', '0.5'),
];

describe('buildSalaryStructureLines', () => {
  it('builds recurring lines, skipping BASIC and applying rates of base', () => {
    const { lines: built, skipped } = buildSalaryStructureLines({
      structure,
      structureComponents: lines,
      componentsById,
      baseSalary: '2000000.00',
    });
    const byCode = new Map(built.map((item) => [item.componentCode, item]));

    expect(skipped).toEqual([
      { component_code: 'BASIC', reason: 'BASE_SALARY_FROM_COMPENSATION' },
    ]);
    expect(byCode.get('HOUSING')).toMatchObject({
      amount: '250000.00',
      taxableAmount: '250000.00',
      sourceType: 'SALARY_STRUCTURE',
      sourceReference: 'STD-MONTHLY:v2',
    });
    expect(byCode.get('TRANSPORT')).toMatchObject({
      amount: '120000.00',
      taxableAmount: '0.00',
    });
    expect(byCode.get('MEDICAL')?.amount).toBe('100000.00');
    expect(byCode.get('UNION_DUES')).toMatchObject({
      amount: '10000.00',
      taxableAmount: '0.00',
    });
    expect(byCode.get('WCF')).toMatchObject({
      amount: '0.00',
      employerAmount: '10000.00',
    });
  });

  it('applies employee overrides and exclusions', () => {
    const { lines: built, skipped } = buildSalaryStructureLines({
      structure,
      structureComponents: lines,
      componentsById,
      baseSalary: '2000000.00',
      overrides: {
        HOUSING: { amount: '400000.00' },
        MEDICAL: { rate: '10' },
        UNION_DUES: { excluded: true },
      },
    });
    const byCode = new Map(built.map((item) => [item.componentCode, item]));

    expect(byCode.get('HOUSING')?.amount).toBe('400000.00');
    expect(byCode.get('MEDICAL')?.amount).toBe('200000.00');
    expect(byCode.has('UNION_DUES')).toBe(false);
    expect(skipped).toContainEqual({
      component_code: 'UNION_DUES',
      reason: 'EXCLUDED_BY_EMPLOYEE_OVERRIDE',
    });
  });

  it('prorates only proratable components and lets inputs replace lines', () => {
    const { lines: built, skipped } = buildSalaryStructureLines({
      structure,
      structureComponents: lines,
      componentsById,
      baseSalary: '2000000.00',
      proration: { numerator: 15, denominator: 30 },
      replacedComponentCodes: new Set(['MEDICAL']),
    });
    const byCode = new Map(built.map((item) => [item.componentCode, item]));

    expect(byCode.get('HOUSING')?.amount).toBe('125000.00');
    expect(byCode.get('TRANSPORT')?.amount).toBe('120000.00');
    expect(byCode.has('MEDICAL')).toBe(false);
    expect(skipped).toContainEqual({
      component_code: 'MEDICAL',
      reason: 'REPLACED_BY_PAYROLL_INPUT',
    });
  });

  it('skips inactive and non-recurring components', () => {
    const inactive = new Map(componentsById);
    inactive.set(2, component(2, 'HOUSING', { status: 'INACTIVE' }));
    inactive.set(
      3,
      component(3, 'TRANSPORT', {
        frequency: PayrollComponentFrequencyEnum.ONE_TIME,
      }),
    );
    const { skipped } = buildSalaryStructureLines({
      structure,
      structureComponents: lines,
      componentsById: inactive,
      baseSalary: '2000000.00',
    });

    expect(skipped).toEqual(
      expect.arrayContaining([
        { component_code: 'HOUSING', reason: 'COMPONENT_INACTIVE' },
        { component_code: 'TRANSPORT', reason: 'NON_RECURRING_COMPONENT' },
      ]),
    );
  });
});
