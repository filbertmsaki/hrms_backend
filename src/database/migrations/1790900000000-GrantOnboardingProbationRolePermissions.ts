import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  revokePermissionsFromSystemRoles,
  removePermissions,
} from '../migration-helpers/role-permission-grants';

const PROBATION_OBJECTIVE_PERMISSION = {
  name: 'probation_objectives:create',
  displayName: 'Create probation objectives',
  description: 'Allow adding review objectives to an open probation case',
};

const GRANTS: Record<string, string[]> = {
  EMPLOYEE: [
    'onboarding_requests:read',
    'onboarding_requests:update',
    'onboarding_tasks:read',
    'onboarding_tasks:complete',
    'onboarding_documents:read',
    'onboarding_documents:create',
  ],
  DEPARTMENT_MANAGER: [
    'probation_cases:read-team',
    'probation_reviews:manager-review',
  ],
  BRANCH_MANAGER: [
    'probation_cases:read-team',
    'probation_reviews:manager-review',
  ],
  HR_OFFICER: [
    'probation_cases:create',
    'probation_cases:read',
    'probation_cases:update',
    'probation_cases:read-team',
    'probation_objectives:create',
    'probation_letters:generate',
    'probation_policies:read',
    'probation_reviews:hr-decision',
    'probation_reviews:manager-review-any',
  ],
  HR_MANAGER: [
    'probation_cases:create',
    'probation_cases:read',
    'probation_cases:update',
    'probation_cases:read-team',
    'probation_objectives:create',
    'probation_letters:generate',
    'probation_policies:read',
    'probation_reviews:hr-decision',
    'probation_reviews:manager-review-any',
  ],
  COMPANY_ADMIN: ['probation_objectives:create'],
};

export class GrantOnboardingProbationRolePermissions1790900000000 implements MigrationInterface {
  name = 'GrantOnboardingProbationRolePermissions1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensurePermissions(queryRunner, [PROBATION_OBJECTIVE_PERMISSION]);
    await grantPermissionsToSystemRoles(queryRunner, GRANTS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(queryRunner, GRANTS);
    await removePermissions(queryRunner, [PROBATION_OBJECTIVE_PERMISSION.name]);
  }
}
