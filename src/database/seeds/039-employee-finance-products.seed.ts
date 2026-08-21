import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { EmployeeFinanceProduct } from '../../modules/hr/employee-finance/entities/employee-finance-product.entities';
import {
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceProductTypeEnum,
} from '../../modules/hr/employee-finance/employee-finance.enums';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type EmployeeFinanceProductSeed = {
  productType: EmployeeFinanceProductTypeEnum;
  code: string;
  name: string;
  description: string;
  interestMethod: EmployeeFinanceInterestMethodEnum;
  annualInterestRate: string;
  minimumAmount: string;
  maximumAmount: string | null;
  maximumSalaryMultiple: string | null;
  minimumTermMonths: number;
  maximumTermMonths: number;
  minimumServiceMonths: number;
  maximumInstallmentPercentage: string;
  maximumActiveAccounts: number;
  requiresConfirmation: boolean;
  allowDuringProbation: boolean;
  allowRescheduling: boolean;
  allowDeferment: boolean;
  allowEarlySettlement: boolean;
  allowAdditionalRepayment: boolean;
  requiredDocumentTypes: string[] | null;
  eligibilityConfiguration: Record<string, unknown>;
  approvalConfiguration: Record<string, unknown>;
};

const BASELINE_EFFECTIVE_FROM = '2020-01-01';

const PRODUCT_SEEDS: EmployeeFinanceProductSeed[] = [
  {
    productType: EmployeeFinanceProductTypeEnum.SALARY_ADVANCE,
    code: 'SALARY_ADVANCE_STD',
    name: 'Standard Salary Advance',
    description:
      'Short-term salary advance intended for urgent employee needs with automatic payroll recovery over the next payroll cycles.',
    interestMethod: EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
    annualInterestRate: '0.000000',
    minimumAmount: '100000.00',
    maximumAmount: '1000000.00',
    maximumSalaryMultiple: '1.0000',
    minimumTermMonths: 1,
    maximumTermMonths: 3,
    minimumServiceMonths: 0,
    maximumInstallmentPercentage: '35.0000',
    maximumActiveAccounts: 1,
    requiresConfirmation: false,
    allowDuringProbation: false,
    allowRescheduling: false,
    allowDeferment: false,
    allowEarlySettlement: true,
    allowAdditionalRepayment: true,
    requiredDocumentTypes: ['REQUEST_LETTER'],
    eligibilityConfiguration: {
      allowed_grade_ids: [],
      notes:
        'Starter baseline product available to active confirmed employees unless company rules are later narrowed.',
    },
    approvalConfiguration: {
      manager_recommendation_required: true,
      hr_approval_required: true,
      finance_approval_required: true,
      employee_acceptance_required: true,
    },
  },
  {
    productType: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
    code: 'STAFF_LOAN_STD',
    name: 'Standard Staff Loan',
    description:
      'General-purpose employee loan with reducing-balance interest and payroll deduction recovery for longer-term support needs.',
    interestMethod: EmployeeFinanceInterestMethodEnum.REDUCING_BALANCE,
    annualInterestRate: '12.000000',
    minimumAmount: '500000.00',
    maximumAmount: '10000000.00',
    maximumSalaryMultiple: '3.0000',
    minimumTermMonths: 3,
    maximumTermMonths: 24,
    minimumServiceMonths: 6,
    maximumInstallmentPercentage: '35.0000',
    maximumActiveAccounts: 1,
    requiresConfirmation: true,
    allowDuringProbation: false,
    allowRescheduling: true,
    allowDeferment: true,
    allowEarlySettlement: true,
    allowAdditionalRepayment: true,
    requiredDocumentTypes: ['REQUEST_LETTER', 'GUARANTOR_FORM'],
    eligibilityConfiguration: {
      allowed_grade_ids: [],
      requires_active_compensation: true,
      requires_positive_payroll_capacity: true,
    },
    approvalConfiguration: {
      manager_recommendation_required: true,
      hr_approval_required: true,
      finance_approval_required: true,
      employee_acceptance_required: true,
    },
  },
];

export default class EmployeeFinanceProductsSeeder implements Seeder {
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
      const productRepo = qr.manager.getRepository(EmployeeFinanceProduct);

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

      let createdCount = 0;
      for (const seed of PRODUCT_SEEDS) {
        const product = await productRepo.findOne({
          where: { companyId: company.id, code: seed.code },
        });

        if (!product) {
          await productRepo.save(
            productRepo.create({
              companyId: company.id,
              code: seed.code,
              productType: seed.productType,
              name: seed.name,
              description: seed.description,
              interestMethod: seed.interestMethod,
              annualInterestRate: seed.annualInterestRate,
              processingFeeMethod: 'NONE',
              processingFeeValue: '0.0000',
              minimumAmount: seed.minimumAmount,
              maximumAmount: seed.maximumAmount,
              maximumSalaryMultiple: seed.maximumSalaryMultiple,
              minimumTermMonths: seed.minimumTermMonths,
              maximumTermMonths: seed.maximumTermMonths,
              minimumServiceMonths: seed.minimumServiceMonths,
              maximumInstallmentPercentage: seed.maximumInstallmentPercentage,
              maximumActiveAccounts: seed.maximumActiveAccounts,
              requiresConfirmation: seed.requiresConfirmation,
              allowDuringProbation: seed.allowDuringProbation,
              allowRescheduling: seed.allowRescheduling,
              allowDeferment: seed.allowDeferment,
              allowEarlySettlement: seed.allowEarlySettlement,
              allowAdditionalRepayment: seed.allowAdditionalRepayment,
              requiredDocumentTypes: seed.requiredDocumentTypes,
              eligibilityConfiguration: {
                ...seed.eligibilityConfiguration,
                seeded: true,
                source: '039-employee-finance-products',
              },
              approvalConfiguration: {
                ...seed.approvalConfiguration,
                seeded: true,
                source: '039-employee-finance-products',
              },
              effectiveFrom: BASELINE_EFFECTIVE_FROM,
              effectiveTo: null,
              isLocked: false,
              status: 'ACTIVE',
            }),
          );
          createdCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][EmployeeFinanceProducts] Created ${createdCount} new products (${PRODUCT_SEEDS.length - createdCount} already existed, left unchanged) for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][EmployeeFinanceProducts] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
