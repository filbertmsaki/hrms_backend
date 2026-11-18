import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'leave_operations:read',
    displayName: 'View Leave Operations',
    description:
      'View leave configuration readiness, backfill previews, payroll reconciliation and operations history',
  },
  {
    name: 'leave_operations:execute',
    displayName: 'Run Leave Operations',
    description:
      'Apply or revert the leave allocation backfill and retry encashment payroll handoffs (confirmation required, audited)',
  },
];

const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: ['leave_operations:read', 'leave_operations:execute'],
  HR_MANAGER: ['leave_operations:read', 'leave_operations:execute'],
  HR_OFFICER: ['leave_operations:read'],
  LEAVE_ADMIN: ['leave_operations:read'],
};

export class GrantLeaveOperationsPermissions1797900035000 implements MigrationInterface {
  name = 'GrantLeaveOperationsPermissions1797900035000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, GRANTS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(queryRunner, GRANTS);
    await removePermissions(queryRunner, [
      'leave_operations:read',
      'leave_operations:execute',
    ]);
  }
}
