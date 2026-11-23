import { MigrationInterface, QueryRunner } from 'typeorm';
import { applyPermissionMigration } from '../migration-helpers/canonical-permissions';

export class CanonicalPermissionKeys1797900200000 implements MigrationInterface {
  name = 'CanonicalPermissionKeys1797900200000';

  async up(db: QueryRunner): Promise<void> {
    await applyPermissionMigration(db);
    await db.query(
      `INSERT INTO permissions (name, display_name, description, scope, is_system_generated)
       VALUES ($1, $2, $3, 'company', true) ON CONFLICT (name) DO NOTHING`,
      [
        attendanceRetentionPermission.name,
        attendanceRetentionPermission.displayName,
        attendanceRetentionPermission.description,
      ],
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Restore the pre-cutover database snapshot and the matching application releases together. See docs/rbac-audit.md. A partial downgrade could restore revoked privileges.',
      ),
    );
  }
}
import { attendanceRetentionPermission } from '../migration-helpers/permission-keys-1797900200000';
