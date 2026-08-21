import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { LeavePolicy } from '../../modules/hr/leave/entities/leave-policy.entity';
import { LeavePolicyType } from '../../modules/hr/leave/entities/leave-policy-type.entity';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';
import { LeaveAccrualMethodEnum } from '../../modules/hr/leave/enums/leave-accrual-method.enum';
import { LeaveRecordStatusEnum } from '../../modules/hr/leave/enums/leave-record-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type PolicyTypeSeed = {
  leaveTypeCode: string;
  annualQuotaDays: number;
  maxPerRequestDays: number | null;
  requiresApproval: boolean;
};

const POLICY_NAME = 'General Leave Policy';

const POLICY_TYPE_SEEDS: PolicyTypeSeed[] = [
  {
    leaveTypeCode: 'ANNUAL',
    annualQuotaDays: 28,
    maxPerRequestDays: 28,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'PAID_OCCASIONAL',
    annualQuotaDays: 0,
    maxPerRequestDays: null,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'SICK',
    annualQuotaDays: 126,
    maxPerRequestDays: 126,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'MATERNITY',
    annualQuotaDays: 84,
    maxPerRequestDays: 84,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'MATERNITY_MULTIPLE',
    annualQuotaDays: 100,
    maxPerRequestDays: 100,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'MATERNITY_CHILD_LOSS',
    annualQuotaDays: 84,
    maxPerRequestDays: 84,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'MATERNITY_PREMATURE',
    annualQuotaDays: 0,
    maxPerRequestDays: null,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'PATERNITY',
    annualQuotaDays: 3,
    maxPerRequestDays: 3,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'PATERNITY_PREMATURE',
    annualQuotaDays: 7,
    maxPerRequestDays: 7,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'UNPAID',
    annualQuotaDays: 30,
    maxPerRequestDays: 30,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'COMPASSIONATE',
    annualQuotaDays: 4,
    maxPerRequestDays: 4,
    requiresApproval: true,
  },
  {
    leaveTypeCode: 'TRADE_UNION',
    annualQuotaDays: 0,
    maxPerRequestDays: null,
    requiresApproval: true,
  },
];

export default class LeavePoliciesSeeder implements Seeder {
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
      const policyRepo = qr.manager.getRepository(LeavePolicy);
      const policyTypeRepo = qr.manager.getRepository(LeavePolicyType);
      const leaveTypeRepo = qr.manager.getRepository(LeaveType);

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

      // Create the policy only if it does not already exist
      let policy = await policyRepo.findOne({
        where: { company_id: company.id, name: POLICY_NAME },
      });
      const policyAlreadyExisted = !!policy;
      if (!policy) {
        policy = policyRepo.create({
          company_id: company.id,
          name: POLICY_NAME,
          description: 'Default leave policy applicable to all employees.',
          accrual_method: LeaveAccrualMethodEnum.YEARLY,
          max_consecutive_days: null,
          min_service_months: 0,
          allow_negative_balance: false,
          attendance_balance_deduction_enabled: true,
          absent_day_deduction_days: '1.00',
          unpaid_leave_day_deduction_days: '1.00',
          half_day_deduction_days: '0.50',
          status: LeaveRecordStatusEnum.ACTIVE,
        });
        await policyRepo.save(policy);
      }

      // Create policy-type joins only if missing
      let createdTypeCount = 0;
      for (const seed of POLICY_TYPE_SEEDS) {
        const leaveType = await leaveTypeRepo.findOne({
          where: { company_id: company.id, code: seed.leaveTypeCode },
        });
        if (!leaveType) continue;

        const policyType = await policyTypeRepo.findOne({
          where: { policy_id: policy.id, leave_type_id: leaveType.id },
        });
        if (!policyType) {
          await policyTypeRepo.save(
            policyTypeRepo.create({
              policy_id: policy.id,
              leave_type_id: leaveType.id,
              annual_quota_days: String(seed.annualQuotaDays),
              max_per_request_days:
                seed.maxPerRequestDays !== null
                  ? String(seed.maxPerRequestDays)
                  : null,
              requires_approval: seed.requiresApproval,
            }),
          );
          createdTypeCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][LeavePolicies] ${policyAlreadyExisted ? 'Policy already existed, left unchanged' : `Created policy "${POLICY_NAME}"`}; created ${createdTypeCount} new leave-type entries (${POLICY_TYPE_SEEDS.length - createdTypeCount} already existed, left unchanged)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][LeavePolicies] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
