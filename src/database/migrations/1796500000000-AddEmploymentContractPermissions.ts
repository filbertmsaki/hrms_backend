import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  revokePermissionsFromSystemRoles,
  removePermissions,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'employment_contracts:read',
    displayName: 'View employment contracts',
    description:
      'Allow viewing employment contracts within the granted employee scope',
  },
  {
    name: 'employment_contracts:manage',
    displayName: 'Manage employment contracts',
    description:
      'Allow issuing and attaching employment contracts within the granted employee scope',
  },
];

const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: ['employment_contracts:read', 'employment_contracts:manage'],
  HR_MANAGER: ['employment_contracts:read', 'employment_contracts:manage'],
  HR_OFFICER: ['employment_contracts:read', 'employment_contracts:manage'],
};

export class AddEmploymentContractPermissions1796500000000 implements MigrationInterface {
  name = 'AddEmploymentContractPermissions1796500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, GRANTS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(queryRunner, GRANTS);
    await removePermissions(
      queryRunner,
      PERMISSIONS.map((permission) => permission.name),
    );
  }
}
