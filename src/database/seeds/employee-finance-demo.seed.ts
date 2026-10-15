import { DataSource } from 'typeorm';
import { Company } from '../../modules/companies/entities/company.entity';
import { EmployeeFinanceProduct } from '../../modules/hr/employee-finance/entities/employee-finance-product.entities';
import {
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceProductTypeEnum,
} from '../../modules/hr/employee-finance/employee-finance.enums';
import { ALLIANCE_COMPANY_SLUG } from './company-structure.constants';

/** Demonstration policy only. Replace these values before real lending. */
const DEMO_PRODUCTS = [
  {
    productType: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
    code: 'DEMO-STAFF-LOAN',
    name: 'DEMO — Staff Loan (replace policy before live use)',
    description:
      'DEMO DATA ONLY. Sample reducing-balance loan: 10% annual interest, TZS 100,000–3,000,000, up to 2x monthly salary, 3–24 months. No fee, penalty, documents, or guarantors. Replace and approve these terms before live use.',
    interestMethod: EmployeeFinanceInterestMethodEnum.REDUCING_BALANCE,
    annualInterestRate: '10.000000',
    minimumAmount: '100000.00',
    maximumAmount: '3000000.00',
    maximumSalaryMultiple: '2.0000',
    minimumTermMonths: 3,
    maximumTermMonths: 24,
    minimumServiceMonths: 0,
    maximumInstallmentPercentage: '25.0000',
    maximumActiveAccounts: 1,
    requiresConfirmation: false,
    allowDuringProbation: true,
    allowRescheduling: true,
    allowDeferment: true,
    allowEarlySettlement: true,
    allowAdditionalRepayment: true,
    requiredDocumentTypes: null,
    eligibilityConfiguration: {
      demo_data: true,
      policy_configuration: { penalty: { method: 'NONE' } },
    },
    approvalConfiguration: {
      demo_data: true,
      required_guarantors: 0,
      approval_tiers: [
        {
          minimum_amount: '0.00',
          maximum_amount: '1000000.00',
          stages: ['MANAGER', 'HR', 'FINANCE'],
        },
        {
          minimum_amount: '1000000.01',
          maximum_amount: '2000000.00',
          stages: ['MANAGER', 'HR', 'FINANCE'],
        },
        {
          minimum_amount: '2000000.01',
          maximum_amount: null,
          stages: ['MANAGER', 'HR', 'FINANCE', 'MANAGEMENT'],
        },
      ],
    },
  },
  {
    productType: EmployeeFinanceProductTypeEnum.SALARY_ADVANCE,
    code: 'DEMO-SALARY-ADVANCE',
    name: 'DEMO — Salary Advance (replace policy before live use)',
    description:
      'DEMO DATA ONLY. Sample zero-interest advance: TZS 50,000–300,000, up to half a monthly salary, repaid over 1–3 months. No fee, penalty, documents, or guarantors. Replace and approve these terms before live use.',
    interestMethod: EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
    annualInterestRate: '0.000000',
    minimumAmount: '50000.00',
    maximumAmount: '300000.00',
    maximumSalaryMultiple: '0.5000',
    minimumTermMonths: 1,
    maximumTermMonths: 3,
    minimumServiceMonths: 0,
    maximumInstallmentPercentage: '25.0000',
    maximumActiveAccounts: 1,
    requiresConfirmation: false,
    allowDuringProbation: true,
    allowRescheduling: false,
    allowDeferment: false,
    allowEarlySettlement: true,
    allowAdditionalRepayment: true,
    requiredDocumentTypes: null,
    eligibilityConfiguration: {
      demo_data: true,
      policy_configuration: { penalty: { method: 'NONE' } },
    },
    approvalConfiguration: {
      demo_data: true,
      required_guarantors: 0,
      approval_tiers: [
        {
          minimum_amount: '0.00',
          maximum_amount: null,
          stages: ['MANAGER', 'HR', 'FINANCE'],
        },
      ],
    },
  },
];

export async function seedEmployeeFinanceDemo(dataSource: DataSource) {
  const companySlug =
    process.env.EMPLOYEE_FINANCE_DEMO_COMPANY_SLUG ?? ALLIANCE_COMPANY_SLUG;
  const company = await dataSource.getRepository(Company).findOne({
    where: { slug: companySlug },
  });
  if (!company) {
    throw new Error(
      `Company with slug "${companySlug}" was not found. Set EMPLOYEE_FINANCE_DEMO_COMPANY_SLUG to an existing company slug.`,
    );
  }

  const repository = dataSource.getRepository(EmployeeFinanceProduct);
  const created: string[] = [];
  const unchanged: string[] = [];
  const effectiveFrom = new Date().toISOString().slice(0, 10);

  for (const sample of DEMO_PRODUCTS) {
    const existing = await repository.findOne({
      where: { companyId: company.id, code: sample.code, versionNumber: 1 },
    });
    if (existing) {
      unchanged.push(sample.code);
      continue;
    }
    await repository.save(
      repository.create({
        ...sample,
        companyId: company.id,
        processingFeeMethod: 'NONE',
        processingFeeValue: '0.0000',
        isLocked: false,
        status: 'ACTIVE',
        effectiveFrom,
        effectiveTo: null,
        versionNumber: 1,
        parentProductId: null,
      }),
    );
    created.push(sample.code);
  }
  return { company: company.slug, created, unchanged };
}
