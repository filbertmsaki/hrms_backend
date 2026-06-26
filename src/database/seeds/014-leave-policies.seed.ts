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
  { leaveTypeCode: 'ANNUAL', annualQuotaDays: 28, maxPerRequestDays: 30, requiresApproval: true },
  { leaveTypeCode: 'SICK', annualQuotaDays: 12, maxPerRequestDays: 12, requiresApproval: true },
  { leaveTypeCode: 'MATERNITY', annualQuotaDays: 84, maxPerRequestDays: 84, requiresApproval: true },
  { leaveTypeCode: 'UNPAID', annualQuotaDays: 365, maxPerRequestDays: null, requiresApproval: true },
  { leaveTypeCode: 'COMPASSIONATE', annualQuotaDays: 7, maxPerRequestDays: 7, requiresApproval: true },
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

      // Upsert the policy
      let policy = await policyRepo.findOne({
        where: { company_id: company.id, name: POLICY_NAME },
      });
      if (!policy) {
        policy = policyRepo.create({
          company_id: company.id,
          name: POLICY_NAME,
          description: 'Default leave policy applicable to all employees.',
          accrual_method: LeaveAccrualMethodEnum.YEARLY,
          max_consecutive_days: 30,
          min_service_months: 0,
          allow_negative_balance: false,
          status: LeaveRecordStatusEnum.ACTIVE,
        });
      } else {
        policy.accrual_method = LeaveAccrualMethodEnum.YEARLY;
        policy.max_consecutive_days = 30;
        policy.status = LeaveRecordStatusEnum.ACTIVE;
      }
      await policyRepo.save(policy);

      // Upsert policy-type joins
      for (const seed of POLICY_TYPE_SEEDS) {
        const leaveType = await leaveTypeRepo.findOne({
          where: { company_id: company.id, code: seed.leaveTypeCode },
        });
        if (!leaveType) continue;

        let policyType = await policyTypeRepo.findOne({
          where: { policy_id: policy.id, leave_type_id: leaveType.id },
        });
        if (!policyType) {
          policyType = policyTypeRepo.create({
            policy_id: policy.id,
            leave_type_id: leaveType.id,
          });
        }
        policyType.annual_quota_days = String(seed.annualQuotaDays);
        policyType.max_per_request_days = seed.maxPerRequestDays !== null
          ? String(seed.maxPerRequestDays)
          : null;
        policyType.requires_approval = seed.requiresApproval;

        await policyTypeRepo.save(policyType);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][LeavePolicies] Upserted policy "${POLICY_NAME}" with ${POLICY_TYPE_SEEDS.length} leave-type entries`,
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
