import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { ProbationPolicy } from '../../modules/hr/probation/entities/probation-policy.entity';
import { ProbationPolicyCriterion } from '../../modules/hr/probation/entities/probation-policy-criterion.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type ProbationCriterionSeed = {
  code: string;
  name: string;
  description: string;
  weight: string;
  maximumRating: string;
  selfRatingEnabled: boolean;
  isRequired: boolean;
  sortOrder: number;
};

const BASELINE_EFFECTIVE_FROM = '2020-01-01';
const POLICY_CODE = 'DEFAULT-PROBATION';

const CRITERION_SEEDS: ProbationCriterionSeed[] = [
  {
    code: 'ROLE_DELIVERY',
    name: 'Role delivery',
    description:
      'Measures how consistently the employee meets core job expectations, output targets, and quality standards.',
    weight: '40.00',
    maximumRating: '5.00',
    selfRatingEnabled: true,
    isRequired: true,
    sortOrder: 1,
  },
  {
    code: 'BEHAVIOUR_VALUES',
    name: 'Behaviour and values',
    description:
      'Assesses professionalism, collaboration, integrity, and alignment with company values during probation.',
    weight: '25.00',
    maximumRating: '5.00',
    selfRatingEnabled: true,
    isRequired: true,
    sortOrder: 2,
  },
  {
    code: 'LEARNING_AGILITY',
    name: 'Learning agility',
    description:
      'Assesses how quickly the employee learns processes, adapts to feedback, and applies new knowledge.',
    weight: '20.00',
    maximumRating: '5.00',
    selfRatingEnabled: true,
    isRequired: true,
    sortOrder: 3,
  },
  {
    code: 'ATTENDANCE_DISCIPLINE',
    name: 'Attendance and discipline',
    description:
      'Reviews punctuality, attendance consistency, and compliance with workplace policies during probation.',
    weight: '15.00',
    maximumRating: '5.00',
    selfRatingEnabled: false,
    isRequired: true,
    sortOrder: 4,
  },
];

export default class ProbationBaselineSeeder implements Seeder {
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
      const policyRepo = qr.manager.getRepository(ProbationPolicy);
      const criterionRepo = qr.manager.getRepository(ProbationPolicyCriterion);

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

      let policy = await policyRepo.findOne({
        where: { companyId: company.id, code: POLICY_CODE },
      });

      if (!policy) {
        policy = policyRepo.create({
          companyId: company.id,
          code: POLICY_CODE,
        });
      }

      policy.name = 'Default probation policy';
      policy.description =
        'Baseline company-wide probation policy used when no branch, department, position, or grade-specific rule is configured.';
      policy.employmentType = null;
      policy.branchId = null;
      policy.departmentId = null;
      policy.positionId = null;
      policy.gradeId = null;
      policy.probationPeriodDays = 180;
      policy.selfAssessmentRequired = true;
      policy.objectivesRequired = true;
      policy.minimumConfirmationScore = '60.00';
      policy.maximumExtensions = 2;
      policy.defaultExtensionDays = 90;
      policy.maximumExtensionDays = 180;
      policy.reminderDays = [30, 14, 7, 1];
      policy.managerReviewRequired = true;
      policy.hrApprovalRequired = true;
      policy.confirmationLetterRequired = true;
      policy.priority = 0;
      policy.status = 'ACTIVE';
      policy.effectiveFrom = BASELINE_EFFECTIVE_FROM;
      policy.effectiveTo = null;
      policy.isDefault = true;
      policy.metadata = {
        seeded: true,
        source: '040-probation-baseline',
      };

      policy = await policyRepo.save(policy);

      await criterionRepo.delete({ policyId: policy.id });

      for (const seed of CRITERION_SEEDS) {
        await criterionRepo.save(
          criterionRepo.create({
            policyId: policy.id,
            code: seed.code,
            name: seed.name,
            description: seed.description,
            weight: seed.weight,
            maximumRating: seed.maximumRating,
            selfRatingEnabled: seed.selfRatingEnabled,
            isRequired: seed.isRequired,
            sortOrder: seed.sortOrder,
          }),
        );
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][ProbationBaseline] Seeded default probation policy for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][ProbationBaseline] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
