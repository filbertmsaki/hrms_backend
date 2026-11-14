import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'leave_requests:override',
    displayName: 'Act in place of the manager on leave requests',
    description:
      'Allow HR to approve, reject or return a leave request at the manager stage when the manager is unavailable (reason required, audited)',
  },
];

const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: ['leave_requests:override'],
  HR_MANAGER: ['leave_requests:override'],
  HR_OFFICER: ['leave_requests:override'],
  LEAVE_ADMIN: ['leave_requests:override'],
};

export class GrantLeaveRequestOverridePermission1797900019000 implements MigrationInterface {
  name = 'GrantLeaveRequestOverridePermission1797900019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, GRANTS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(queryRunner, GRANTS);
    await removePermissions(queryRunner, ['leave_requests:override']);
  }
}
