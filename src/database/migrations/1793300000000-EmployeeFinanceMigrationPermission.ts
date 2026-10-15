import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'employee_finance:migration',
    displayName: 'Migrate existing staff loans',
    description:
      'Allow importing staff loans from the previous system and signing off migrated balances',
  },
];

export class EmployeeFinanceMigrationPermission1793300000000 implements MigrationInterface {
  name = 'EmployeeFinanceMigrationPermission1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, {
      COMPANY_ADMIN: PERMISSIONS.map((permission) => permission.name),
    });
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await removePermissions(
      queryRunner,
      PERMISSIONS.map((permission) => permission.name),
    );
  }
}
