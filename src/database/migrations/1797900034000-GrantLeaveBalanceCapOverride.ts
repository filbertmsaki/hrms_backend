import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'leave_balances:override_cap',
    displayName: 'Credit leave above the maximum accumulation',
    description:
      'Allow a manual adjustment or comp-off credit to exceed the policy maximum accumulation (reason required, audited)',
  },
];

const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: ['leave_balances:override_cap'],
  HR_MANAGER: ['leave_balances:override_cap'],
};

export class GrantLeaveBalanceCapOverride1797900034000 implements MigrationInterface {
  name = 'GrantLeaveBalanceCapOverride1797900034000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, GRANTS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(queryRunner, GRANTS);
    await removePermissions(queryRunner, ['leave_balances:override_cap']);
  }
}
