import { EntityManager } from 'typeorm';
import { ProbationPolicy } from '../../modules/hr/probation/entities/probation-policy.entity';
import { ProbationPolicyCriterion } from '../../modules/hr/probation/entities/probation-policy-criterion.entity';
import { CRITERION_SEEDS, POLICY_CODE } from './040-probation-baseline.seed';

export async function seedProbationDraft(
  manager: EntityManager,
  companyId: number,
  effectiveFrom: string,
): Promise<void> {
  const parsed = new Date(`${effectiveFrom}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== effectiveFrom
  )
    throw new Error('Probation effective date must be a valid ISO date.');
  const policies = manager.getRepository(ProbationPolicy);
  if (await policies.existsBy({ companyId, code: POLICY_CODE })) return;
  const policy = await policies.save(
    policies.create({
      companyId,
      code: POLICY_CODE,
      name: 'Proposed probation policy',
      description:
        'Draft for HR review; activation and terms require approval.',
      employmentType: null,
      branchId: null,
      departmentId: null,
      positionId: null,
      gradeId: null,
      probationPeriodDays: 180,
      selfAssessmentRequired: true,
      objectivesRequired: true,
      minimumConfirmationScore: '60.00',
      maximumExtensions: 2,
      defaultExtensionDays: 90,
      maximumExtensionDays: 180,
      reminderDays: [30, 14, 7, 1],
      managerReviewRequired: true,
      hrApprovalRequired: true,
      confirmationLetterRequired: true,
      priority: 0,
      status: 'DRAFT',
      effectiveFrom,
      effectiveTo: null,
      isDefault: false,
      metadata: { source: '040-probation-baseline', review_required: true },
    }),
  );
  const criteria = manager.getRepository(ProbationPolicyCriterion);
  for (const seed of CRITERION_SEEDS)
    await criteria.save(criteria.create({ ...seed, policyId: policy.id }));
}
