import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'leave-balances.export',
    displayName: 'Export leave balances',
    description:
      'Allow downloading the leave balance template with current balances for accessible employees',
  },
  {
    name: 'leave-balances.bulk-import',
    displayName: 'Bulk import leave balances',
    description:
      'Allow uploading, validating and confirming leave balance bulk imports in strict mode',
  },
  {
    name: 'leave-balances.bulk-import.partial',
    displayName: 'Import valid leave balance rows only',
    description:
      'Allow confirming a leave balance bulk import that skips invalid rows',
  },
  {
    name: 'leave-balances.import-history',
    displayName: 'View leave balance import history',
    description:
      'Allow viewing leave balance import batches, their rows and error reports',
  },
];

const FULL_ACCESS = PERMISSIONS.map((permission) => permission.name);

// Mirrors the roles that could already adjust balances (and therefore used
// the previous one-step balance import). HR officers get strict mode only.
const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: FULL_ACCESS,
  HR_MANAGER: FULL_ACCESS,
  LEAVE_ADMIN: FULL_ACCESS,
  HR_OFFICER: [
    'leave-balances.export',
    'leave-balances.bulk-import',
    'leave-balances.import-history',
  ],
  AUDITOR: ['leave-balances.import-history'],
};

export class GrantLeaveBalanceBulkImportPermissions1791200000001 implements MigrationInterface {
  name = 'GrantLeaveBalanceBulkImportPermissions1791200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, GRANTS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(queryRunner, GRANTS);
    await removePermissions(queryRunner, FULL_ACCESS);
  }
}
