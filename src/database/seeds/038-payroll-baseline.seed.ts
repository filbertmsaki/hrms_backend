import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  PayrollAccountingMapping,
  PayrollCalendar,
  PayrollComponent,
  SalaryStructure,
  SalaryStructureComponent,
  StatutoryRuleVersion,
  StatutoryScheme,
  StatutoryTaxBand,
} from '../../modules/hr/payroll/entities/payroll-configuration.entities';
import {
  PayrollCalculationMethodEnum,
  PayrollComponentFrequencyEnum,
  PayrollComponentTypeEnum,
  PayrollTaxTreatmentEnum,
  StatutorySchemeTypeEnum,
} from '../../modules/hr/payroll/payroll.enums';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type PayrollComponentSeed = {
  code: string;
  name: string;
  componentType: PayrollComponentTypeEnum;
  frequency: PayrollComponentFrequencyEnum;
  calculationMethod: PayrollCalculationMethodEnum;
  taxTreatment: PayrollTaxTreatmentEnum;
  taxablePercentage: string;
  pensionable: boolean;
  healthInsuranceApplicable: boolean;
  includedInGross: boolean;
  includedInNet: boolean;
  includedInEmployerCost: boolean;
  subjectToProration: boolean;
  allowManualInput: boolean;
  allowNegativeAmount: boolean;
  calculationOrder: number;
  calculationConfiguration?: Record<string, unknown> | null;
  generalLedgerAccountCode?: string | null;
  liabilityAccountCode?: string | null;
  expenseAccountCode?: string | null;
  isSystemComponent: boolean;
};

type SalaryStructureComponentSeed = {
  componentCode: string;
  defaultAmount: string;
  defaultRate: string | null;
  calculationOrder: number;
  configuration?: Record<string, unknown> | null;
};

type StatutorySchemeSeed = {
  code: string;
  name: string;
  schemeType: StatutorySchemeTypeEnum;
  jurisdiction: string;
  rule: {
    calculationMethod: PayrollCalculationMethodEnum;
    employeeRate: string | null;
    employerRate: string | null;
    maximumBasis: string | null;
    minimumBasis: string | null;
    deductEmployeeBeforeTax: boolean;
    configuration?: Record<string, unknown> | null;
  };
  bands?: Array<{
    lowerLimit: string;
    upperLimit: string | null;
    baseTax: string;
    ratePercent: string;
    sortOrder: number;
  }>;
};

const PAYROLL_CALENDAR_CODE = 'MAIN';
const PAYROLL_CALENDAR_NAME = 'Main Monthly Payroll';
const SALARY_STRUCTURE_CODE = 'STD-MONTHLY';
const SALARY_STRUCTURE_NAME = 'Standard Monthly Salary Structure';
const BASELINE_EFFECTIVE_FROM = '2020-01-01';

const COMPONENT_SEEDS: PayrollComponentSeed[] = [
  {
    code: 'BASIC',
    name: 'Basic salary',
    componentType: PayrollComponentTypeEnum.EARNING,
    frequency: PayrollComponentFrequencyEnum.RECURRING,
    calculationMethod: PayrollCalculationMethodEnum.FIXED_AMOUNT,
    taxTreatment: PayrollTaxTreatmentEnum.TAXABLE,
    taxablePercentage: '100',
    pensionable: true,
    healthInsuranceApplicable: true,
    includedInGross: true,
    includedInNet: true,
    includedInEmployerCost: true,
    subjectToProration: true,
    allowManualInput: false,
    allowNegativeAmount: false,
    calculationOrder: 10,
    generalLedgerAccountCode: '5000-BASIC-SALARY',
    liabilityAccountCode: '2100-PAYROLL-CLEARING',
    expenseAccountCode: '5000-BASIC-SALARY',
    isSystemComponent: true,
  },
  {
    code: 'HOUSING',
    name: 'Housing allowance',
    componentType: PayrollComponentTypeEnum.EARNING,
    frequency: PayrollComponentFrequencyEnum.RECURRING,
    calculationMethod: PayrollCalculationMethodEnum.FIXED_AMOUNT,
    taxTreatment: PayrollTaxTreatmentEnum.TAXABLE,
    taxablePercentage: '100',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: true,
    includedInNet: true,
    includedInEmployerCost: true,
    subjectToProration: true,
    allowManualInput: false,
    allowNegativeAmount: false,
    calculationOrder: 20,
    generalLedgerAccountCode: '5010-HOUSING-ALLOWANCE',
    liabilityAccountCode: '2100-PAYROLL-CLEARING',
    expenseAccountCode: '5010-HOUSING-ALLOWANCE',
    isSystemComponent: false,
  },
  {
    code: 'TRANSPORT',
    name: 'Transport allowance',
    componentType: PayrollComponentTypeEnum.EARNING,
    frequency: PayrollComponentFrequencyEnum.RECURRING,
    calculationMethod: PayrollCalculationMethodEnum.FIXED_AMOUNT,
    taxTreatment: PayrollTaxTreatmentEnum.TAXABLE,
    taxablePercentage: '100',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: true,
    includedInNet: true,
    includedInEmployerCost: true,
    subjectToProration: true,
    allowManualInput: false,
    allowNegativeAmount: false,
    calculationOrder: 30,
    generalLedgerAccountCode: '5020-TRANSPORT-ALLOWANCE',
    liabilityAccountCode: '2100-PAYROLL-CLEARING',
    expenseAccountCode: '5020-TRANSPORT-ALLOWANCE',
    isSystemComponent: false,
  },
  {
    code: 'OVERTIME',
    name: 'Overtime payment',
    componentType: PayrollComponentTypeEnum.EARNING,
    frequency: PayrollComponentFrequencyEnum.ONE_TIME,
    calculationMethod: PayrollCalculationMethodEnum.QUANTITY_TIMES_RATE,
    taxTreatment: PayrollTaxTreatmentEnum.TAXABLE,
    taxablePercentage: '100',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: true,
    includedInNet: true,
    includedInEmployerCost: true,
    subjectToProration: false,
    allowManualInput: true,
    allowNegativeAmount: false,
    calculationOrder: 40,
    calculationConfiguration: { unit: 'HOUR' },
    generalLedgerAccountCode: '5030-OVERTIME',
    liabilityAccountCode: '2100-PAYROLL-CLEARING',
    expenseAccountCode: '5030-OVERTIME',
    isSystemComponent: false,
  },
  {
    code: 'BONUS',
    name: 'Bonus / commission',
    componentType: PayrollComponentTypeEnum.EARNING,
    frequency: PayrollComponentFrequencyEnum.ONE_TIME,
    calculationMethod: PayrollCalculationMethodEnum.EXTERNAL_INPUT,
    taxTreatment: PayrollTaxTreatmentEnum.TAXABLE,
    taxablePercentage: '100',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: true,
    includedInNet: true,
    includedInEmployerCost: true,
    subjectToProration: false,
    allowManualInput: true,
    allowNegativeAmount: false,
    calculationOrder: 50,
    generalLedgerAccountCode: '5040-BONUS',
    liabilityAccountCode: '2100-PAYROLL-CLEARING',
    expenseAccountCode: '5040-BONUS',
    isSystemComponent: false,
  },
  {
    code: 'REIMBURSEMENT',
    name: 'Expense reimbursement',
    componentType: PayrollComponentTypeEnum.REIMBURSEMENT,
    frequency: PayrollComponentFrequencyEnum.ONE_TIME,
    calculationMethod: PayrollCalculationMethodEnum.EXTERNAL_INPUT,
    taxTreatment: PayrollTaxTreatmentEnum.NON_TAXABLE,
    taxablePercentage: '0',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: false,
    includedInNet: true,
    includedInEmployerCost: false,
    subjectToProration: false,
    allowManualInput: true,
    allowNegativeAmount: false,
    calculationOrder: 60,
    generalLedgerAccountCode: '1300-EMPLOYEE-REIMBURSEMENTS',
    liabilityAccountCode: '1300-EMPLOYEE-REIMBURSEMENTS',
    expenseAccountCode: '5050-REIMBURSEMENTS',
    isSystemComponent: false,
  },
  {
    code: 'OTHER_DEDUCTION',
    name: 'Other authorized deduction',
    componentType: PayrollComponentTypeEnum.DEDUCTION,
    frequency: PayrollComponentFrequencyEnum.ONE_TIME,
    calculationMethod: PayrollCalculationMethodEnum.EXTERNAL_INPUT,
    taxTreatment: PayrollTaxTreatmentEnum.NON_TAXABLE,
    taxablePercentage: '0',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: false,
    includedInNet: true,
    includedInEmployerCost: false,
    subjectToProration: false,
    allowManualInput: true,
    allowNegativeAmount: false,
    calculationOrder: 70,
    liabilityAccountCode: '2110-OTHER-DEDUCTIONS',
    isSystemComponent: false,
  },
  {
    code: 'LWP',
    name: 'Leave without pay',
    componentType: PayrollComponentTypeEnum.DEDUCTION,
    frequency: PayrollComponentFrequencyEnum.ONE_TIME,
    calculationMethod: PayrollCalculationMethodEnum.FORMULA_TEMPLATE,
    taxTreatment: PayrollTaxTreatmentEnum.NON_TAXABLE,
    taxablePercentage: '0',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: false,
    includedInNet: true,
    includedInEmployerCost: false,
    subjectToProration: false,
    allowManualInput: false,
    allowNegativeAmount: false,
    calculationOrder: 80,
    calculationConfiguration: { source: 'SYSTEM_GENERATED' },
    liabilityAccountCode: '2120-LWP-DEDUCTION',
    isSystemComponent: true,
  },
  {
    code: 'SALARY_ADVANCE',
    name: 'Salary advance recovery',
    componentType: PayrollComponentTypeEnum.DEDUCTION,
    frequency: PayrollComponentFrequencyEnum.ONE_TIME,
    calculationMethod: PayrollCalculationMethodEnum.EXTERNAL_INPUT,
    taxTreatment: PayrollTaxTreatmentEnum.NON_TAXABLE,
    taxablePercentage: '0',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: false,
    includedInNet: true,
    includedInEmployerCost: false,
    subjectToProration: false,
    allowManualInput: false,
    allowNegativeAmount: false,
    calculationOrder: 90,
    liabilityAccountCode: '2130-SALARY-ADVANCES',
    isSystemComponent: true,
  },
  {
    code: 'STAFF_LOAN',
    name: 'Staff loan recovery',
    componentType: PayrollComponentTypeEnum.DEDUCTION,
    frequency: PayrollComponentFrequencyEnum.ONE_TIME,
    calculationMethod: PayrollCalculationMethodEnum.EXTERNAL_INPUT,
    taxTreatment: PayrollTaxTreatmentEnum.NON_TAXABLE,
    taxablePercentage: '0',
    pensionable: false,
    healthInsuranceApplicable: false,
    includedInGross: false,
    includedInNet: true,
    includedInEmployerCost: false,
    subjectToProration: false,
    allowManualInput: false,
    allowNegativeAmount: false,
    calculationOrder: 100,
    liabilityAccountCode: '2140-STAFF-LOANS',
    isSystemComponent: true,
  },
];

const SALARY_STRUCTURE_COMPONENT_SEEDS: SalaryStructureComponentSeed[] = [
  {
    componentCode: 'BASIC',
    defaultAmount: '1000000.00',
    defaultRate: null,
    calculationOrder: 10,
  },
  {
    componentCode: 'HOUSING',
    defaultAmount: '250000.00',
    defaultRate: null,
    calculationOrder: 20,
  },
  {
    componentCode: 'TRANSPORT',
    defaultAmount: '120000.00',
    defaultRate: null,
    calculationOrder: 30,
  },
];

const STATUTORY_SCHEME_SEEDS: StatutorySchemeSeed[] = [
  {
    code: 'PAYE',
    name: 'Pay As You Earn',
    schemeType: StatutorySchemeTypeEnum.PAYE,
    jurisdiction: 'TZ',
    rule: {
      calculationMethod: PayrollCalculationMethodEnum.PROGRESSIVE_BANDS,
      employeeRate: null,
      employerRate: null,
      maximumBasis: null,
      minimumBasis: null,
      deductEmployeeBeforeTax: false,
      configuration: { seeded: true, source: '038-payroll-baseline' },
    },
    bands: [
      {
        lowerLimit: '0.00',
        upperLimit: '270000.00',
        baseTax: '0.00',
        ratePercent: '0.000000',
        sortOrder: 1,
      },
      {
        lowerLimit: '270000.00',
        upperLimit: '520000.00',
        baseTax: '0.00',
        ratePercent: '8.000000',
        sortOrder: 2,
      },
      {
        lowerLimit: '520000.00',
        upperLimit: '760000.00',
        baseTax: '20000.00',
        ratePercent: '20.000000',
        sortOrder: 3,
      },
      {
        lowerLimit: '760000.00',
        upperLimit: '1000000.00',
        baseTax: '68000.00',
        ratePercent: '25.000000',
        sortOrder: 4,
      },
      {
        lowerLimit: '1000000.00',
        upperLimit: null,
        baseTax: '128000.00',
        ratePercent: '30.000000',
        sortOrder: 5,
      },
    ],
  },
  {
    code: 'NSSF',
    name: 'Social Security Contribution',
    schemeType: StatutorySchemeTypeEnum.PENSION,
    jurisdiction: 'TZ',
    rule: {
      calculationMethod: PayrollCalculationMethodEnum.PERCENTAGE_OF_BASE,
      employeeRate: '10.000000',
      employerRate: '10.000000',
      maximumBasis: null,
      minimumBasis: null,
      deductEmployeeBeforeTax: true,
      configuration: { seeded: true, source: '038-payroll-baseline' },
    },
  },
  {
    code: 'NHIF',
    name: 'Health Insurance Contribution',
    schemeType: StatutorySchemeTypeEnum.HEALTH_INSURANCE,
    jurisdiction: 'TZ',
    rule: {
      calculationMethod: PayrollCalculationMethodEnum.PERCENTAGE_OF_BASE,
      employeeRate: '3.000000',
      employerRate: '3.000000',
      maximumBasis: null,
      minimumBasis: null,
      deductEmployeeBeforeTax: false,
      configuration: { seeded: true, source: '038-payroll-baseline' },
    },
  },
  {
    code: 'SDL',
    name: 'Skills Development Levy',
    schemeType: StatutorySchemeTypeEnum.EMPLOYER_LEVY,
    jurisdiction: 'TZ',
    rule: {
      calculationMethod: PayrollCalculationMethodEnum.PERCENTAGE_OF_BASE,
      employeeRate: null,
      employerRate: '3.500000',
      maximumBasis: null,
      minimumBasis: null,
      deductEmployeeBeforeTax: false,
      configuration: { seeded: true, source: '038-payroll-baseline' },
    },
  },
];

export default class PayrollBaselineSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepo = qr.manager.getRepository(Company);
      const calendarRepo = qr.manager.getRepository(PayrollCalendar);
      const componentRepo = qr.manager.getRepository(PayrollComponent);
      const structureRepo = qr.manager.getRepository(SalaryStructure);
      const structureComponentRepo = qr.manager.getRepository(
        SalaryStructureComponent,
      );
      const schemeRepo = qr.manager.getRepository(StatutoryScheme);
      const ruleRepo = qr.manager.getRepository(StatutoryRuleVersion);
      const bandRepo = qr.manager.getRepository(StatutoryTaxBand);
      const accountingRepo = qr.manager.getRepository(PayrollAccountingMapping);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await companyRepo.findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company "${companyName}" not found. Run 004-company.seed.ts first.`,
        );
      }

      let calendar = await calendarRepo.findOne({
        where: { companyId: company.id, code: PAYROLL_CALENDAR_CODE },
      });
      if (!calendar) {
        calendar = calendarRepo.create({
          companyId: company.id,
          code: PAYROLL_CALENDAR_CODE,
          name: PAYROLL_CALENDAR_NAME,
          frequency: 'MONTHLY',
          cutoffDay: 20,
          paymentDay: 28,
          timezone: 'Africa/Dar_es_Salaam',
          currency: 'TZS',
          isDefault: true,
          status: 'ACTIVE',
        });
        await calendarRepo.save(calendar);
      }

      const componentByCode = new Map<string, PayrollComponent>();
      let createdComponentCount = 0;
      for (const seed of COMPONENT_SEEDS) {
        let component = await componentRepo.findOne({
          where: { companyId: company.id, code: seed.code },
        });

        if (!component) {
          component = componentRepo.create({
            companyId: company.id,
            code: seed.code,
            name: seed.name,
            componentType: seed.componentType,
            frequency: seed.frequency,
            calculationMethod: seed.calculationMethod,
            taxTreatment: seed.taxTreatment,
            taxablePercentage: seed.taxablePercentage,
            pensionable: seed.pensionable,
            healthInsuranceApplicable: seed.healthInsuranceApplicable,
            includedInGross: seed.includedInGross,
            includedInNet: seed.includedInNet,
            includedInEmployerCost: seed.includedInEmployerCost,
            subjectToProration: seed.subjectToProration,
            allowManualInput: seed.allowManualInput,
            allowNegativeAmount: seed.allowNegativeAmount,
            calculationOrder: seed.calculationOrder,
            calculationConfiguration: seed.calculationConfiguration ?? null,
            generalLedgerAccountCode: seed.generalLedgerAccountCode ?? null,
            liabilityAccountCode: seed.liabilityAccountCode ?? null,
            expenseAccountCode: seed.expenseAccountCode ?? null,
            isSystemComponent: seed.isSystemComponent,
            status: 'ACTIVE',
          });
          component = await componentRepo.save(component);
          createdComponentCount += 1;
        }
        componentByCode.set(component.code, component);

        if (
          component.generalLedgerAccountCode &&
          component.liabilityAccountCode
        ) {
          const mapping = await accountingRepo.findOne({
            where: {
              companyId: company.id,
              componentCode: component.code,
            },
          });
          if (!mapping) {
            await accountingRepo.save(
              accountingRepo.create({
                companyId: company.id,
                componentCode: component.code,
                debitAccountCode:
                  component.expenseAccountCode ??
                  component.generalLedgerAccountCode,
                creditAccountCode: component.liabilityAccountCode,
                dimensions: {
                  seeded: true,
                  source: '038-payroll-baseline',
                },
              }),
            );
          }
        }
      }

      let structure = await structureRepo.findOne({
        where: {
          companyId: company.id,
          code: SALARY_STRUCTURE_CODE,
          versionNumber: 1,
        },
      });
      const structureAlreadyExisted = !!structure;
      if (!structure) {
        structure = structureRepo.create({
          companyId: company.id,
          code: SALARY_STRUCTURE_CODE,
          versionNumber: 1,
          name: SALARY_STRUCTURE_NAME,
          currency: 'TZS',
          effectiveFrom: BASELINE_EFFECTIVE_FROM,
          effectiveTo: null,
          isLocked: false,
          status: 'ACTIVE',
          metadata: { seeded: true, source: '038-payroll-baseline' },
          createdByCompanyUserId: null,
        });
        await structureRepo.save(structure);

        // Only seed structure components for a newly created structure —
        // existing structures (and any user-modified components on them)
        // are left completely unchanged.
        for (const seed of SALARY_STRUCTURE_COMPONENT_SEEDS) {
          const component = componentByCode.get(seed.componentCode);
          if (!component) {
            throw new Error(
              `Payroll component "${seed.componentCode}" must exist before salary structure seeding.`,
            );
          }

          await structureComponentRepo.save(
            structureComponentRepo.create({
              companyId: company.id,
              salaryStructureId: structure.id,
              componentId: component.id,
              defaultAmount: seed.defaultAmount,
              defaultRate: seed.defaultRate,
              calculationOrder: seed.calculationOrder,
              configuration: seed.configuration ?? null,
            }),
          );
        }
      }

      let createdSchemeCount = 0;
      for (const seed of STATUTORY_SCHEME_SEEDS) {
        let scheme = await schemeRepo.findOne({
          where: { companyId: company.id, code: seed.code },
        });
        if (!scheme) {
          scheme = schemeRepo.create({
            companyId: company.id,
            code: seed.code,
            name: seed.name,
            schemeType: seed.schemeType,
            jurisdiction: seed.jurisdiction,
            status: 'ACTIVE',
          });
          scheme = await schemeRepo.save(scheme);
          createdSchemeCount += 1;
        }

        let rule = await ruleRepo.findOne({
          where: {
            companyId: company.id,
            schemeId: scheme.id,
            versionNumber: 1,
          },
        });
        if (!rule) {
          rule = ruleRepo.create({
            companyId: company.id,
            schemeId: scheme.id,
            versionNumber: 1,
            calculationMethod: seed.rule.calculationMethod,
            employeeRate: seed.rule.employeeRate,
            employerRate: seed.rule.employerRate,
            maximumBasis: seed.rule.maximumBasis,
            minimumBasis: seed.rule.minimumBasis,
            deductEmployeeBeforeTax: seed.rule.deductEmployeeBeforeTax,
            effectiveFrom: BASELINE_EFFECTIVE_FROM,
            effectiveTo: null,
            status: 'APPROVED',
            approvedByCompanyUserId: null,
            approvedAt: new Date(`${BASELINE_EFFECTIVE_FROM}T00:00:00.000Z`),
            configuration: seed.rule.configuration ?? null,
          });
          rule = await ruleRepo.save(rule);

          // Only seed bands for a newly created rule version; existing
          // rule versions (and any manually adjusted bands) are left unchanged.
          if (seed.bands) {
            for (const bandSeed of seed.bands) {
              await bandRepo.save(
                bandRepo.create({
                  ruleVersionId: rule.id,
                  lowerLimit: bandSeed.lowerLimit,
                  upperLimit: bandSeed.upperLimit,
                  baseTax: bandSeed.baseTax,
                  ratePercent: bandSeed.ratePercent,
                  sortOrder: bandSeed.sortOrder,
                }),
              );
            }
          }
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][PayrollBaseline] Created ${createdComponentCount} new payroll components, ` +
          `${structureAlreadyExisted ? 'salary structure already existed (left unchanged)' : 'created salary structure'}, ` +
          `and ${createdSchemeCount} new statutory schemes for company "${company.name}" (existing records left unchanged)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][PayrollBaseline] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
