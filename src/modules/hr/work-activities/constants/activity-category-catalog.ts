import { EntityManager, Repository } from 'typeorm';
import { ActivityCategory } from '../entities/activity-config.entities';

/** FRS 8.2 canonical categories. Existing rows are never updated by provisioning. */
export const STANDARD_ACTIVITY_CATEGORIES = [
  ['SALES_VISIT', 'Sales visit'],
  ['CLIENT_MEETING', 'Client meeting'],
  ['RENEWAL_FOLLOW_UP', 'Renewal follow-up'],
  ['NEW_BUSINESS_LEAD', 'New business lead'],
  ['BROKER_INTERMEDIARY_VISIT', 'Broker/intermediary visit'],
  ['CLAIM_FOLLOW_UP', 'Claim follow-up'],
  ['UNDERWRITING_REVIEW', 'Underwriting review'],
  ['POLICY_ISSUANCE', 'Policy issuance'],
  ['CUSTOMER_SERVICE', 'Customer service'],
  ['COLLECTION_FOLLOW_UP', 'Collection follow-up'],
  ['TRAINING', 'Training'],
  ['INTERNAL_MEETING', 'Internal meeting'],
  ['BRANCH_OPERATIONS', 'Branch operations'],
  ['REPORT_PREPARATION', 'Report preparation'],
  ['COMPLIANCE_ACTIVITY', 'Compliance activity'],
  ['ADMINISTRATIVE_TASK', 'Administrative task'],
  ['SPECIAL_ASSIGNMENT', 'Special assignment'],
] as const;

export function isStandardActivityCategoryCode(code: string): boolean {
  return STANDARD_ACTIVITY_CATEGORIES.some(
    ([standardCode]) => standardCode === code.toUpperCase(),
  );
}

export async function provisionStandardActivityCategories(
  manager: EntityManager,
  companyId: number,
): Promise<number> {
  const repository: Repository<ActivityCategory> =
    manager.getRepository(ActivityCategory);
  const existingCodes = new Set(
    (
      await repository
        .createQueryBuilder('category')
        .select('upper(category.code)', 'code')
        .where('category.companyId = :companyId', { companyId })
        .getRawMany<{ code: string }>()
    ).map((row) => row.code),
  );
  const values = STANDARD_ACTIVITY_CATEGORIES.map(([code, name], index) => ({
    companyId,
    code,
    name,
    description: null,
    departmentId: null,
    positionId: null,
    gradeId: null,
    requiresTime: false,
    requiresOutcome: true,
    requiresEvidence: false,
    requiresLocation: false,
    isFieldActivity: false,
    defaultKpiCode: null,
    displayOrder: index + 1,
    status: 'ACTIVE',
    version: 1,
  }));

  const missingValues = values.filter((row) => !existingCodes.has(row.code));
  if (missingValues.length === 0) return 0;

  const result = await repository
    .createQueryBuilder()
    .insert()
    .into(ActivityCategory)
    .values(missingValues)
    .orIgnore()
    .execute();

  return result.identifiers.length;
}
