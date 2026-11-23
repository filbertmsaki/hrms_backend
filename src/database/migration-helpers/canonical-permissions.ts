import { QueryRunner } from 'typeorm';
import {
  permissionKeyChanges,
  redundantCompanyKeys,
} from './permission-keys-1797900200000';

const mapping = JSON.stringify(permissionKeyChanges);
const canonical = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;
const joins = [
  ['permission_role', '"rolesId"', '"permissionsId"'],
  ['permission_user', '"usersId"', '"permissionsId"'],
  ['company_user_permissions', 'company_user_id', 'permission_id'],
] as const;

type Definition = {
  id: number;
  name: string;
  scope: string;
  is_system_generated: boolean;
};
type Change = { source: Definition; target?: Definition; name: string };

function expectedScope(name: string) {
  if (redundantCompanyKeys.has(name) || name === 'create_company_admin')
    return 'platform';
  if (name.startsWith('notifications:') || name.startsWith('sms:'))
    return 'shared';
  return 'company';
}

export async function inspectPermissionMigration(db: QueryRunner) {
  const rows = (await db.query(
    'SELECT id,name,scope,is_system_generated FROM permissions ORDER BY id',
  )) as Definition[];
  const byName = new Map(rows.map((row) => [row.name, row]));
  const conflicts: string[] = [];
  const changes: Change[] = [];
  for (const source of rows) {
    if (canonical.test(source.name)) continue;
    const name = permissionKeyChanges[source.name];
    if (!name) {
      conflicts.push(
        `No reviewed mapping for ${source.name} (ID ${source.id})`,
      );
      continue;
    }
    const target = byName.get(name);
    if (source.scope !== expectedScope(source.name))
      conflicts.push(`Unexpected scope for ${source.name}: ${source.scope}`);
    if (
      target &&
      (!redundantCompanyKeys.has(source.name) ||
        !target.is_system_generated ||
        target.scope !== (name === 'companies:read' ? 'shared' : source.scope))
    ) {
      conflicts.push(
        `Existing definition conflicts with ${source.name} → ${name}`,
      );
    }
    if (redundantCompanyKeys.has(source.name)) {
      for (const [table, owner, permission] of joins) {
        const [result] = (await db.query(
          `SELECT count(*)::int AS count FROM ${table} old WHERE old.${permission}=$1
           AND NOT EXISTS (SELECT 1 FROM ${table} current
             WHERE current.${owner}=old.${owner} AND current.${permission}=$2)`,
          [source.id, target?.id ?? null],
        )) as Array<{ count: number }>;
        if (result.count)
          conflicts.push(
            `${source.name}: ${result.count} grant(s) in ${table} lack ${name}; review before merging`,
          );
      }
    }
    changes.push({ source, name, target });
  }
  return { definitions: rows.length, changes, conflicts };
}

export async function applyPermissionMigration(db: QueryRunner) {
  if (!db.isTransactionActive)
    throw new Error('A transaction is required for the permission migration');
  await db.query(
    'LOCK TABLE permissions, permission_role, permission_user, company_user_permissions, role_audit_logs, leave_balance_import_batches IN SHARE ROW EXCLUSIVE MODE',
  );
  const plan = await inspectPermissionMigration(db);
  if (plan.conflicts.length) throw new Error(plan.conflicts.join('\n'));
  await db.query(`CREATE TABLE IF NOT EXISTS rbac_migration_receipts (
    version bigint PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), result jsonb NOT NULL)`);
  const [applied] = (await db.query(
    'SELECT 1 FROM rbac_migration_receipts WHERE version=1797900200000',
  )) as unknown[];
  if (applied && plan.changes.length)
    throw new Error('Legacy keys reappeared after the recorded migration');
  if (applied) return;
  const merges = plan.changes.filter((change) => change.target);
  const mergedIds = merges.map((change) => change.source.id);
  const removed: Record<string, unknown> = {};
  for (const [table, , permission] of joins) {
    // Every merged grant already exists on the same principal and target.
    removed[table] = (await db.query(
      `SELECT * FROM ${table} WHERE ${permission}=ANY($1::int[])`,
      [mergedIds],
    )) as unknown;
    await db.query(`DELETE FROM ${table} WHERE ${permission}=ANY($1::int[])`, [
      mergedIds,
    ]);
  }
  removed.permissions = (await db.query(
    'SELECT * FROM permissions WHERE id=ANY($1::int[])',
    [mergedIds],
  )) as unknown;
  removed.role_audit_logs = (await db.query(
    'SELECT id, permission_id FROM role_audit_logs WHERE permission_id=ANY($1::int[])',
    [mergedIds],
  )) as unknown;
  for (const { source, target } of merges) {
    await db.query(
      'UPDATE role_audit_logs SET permission_id=$1 WHERE permission_id=$2',
      [target!.id, source.id],
    );
  }
  await db.query('DELETE FROM permissions WHERE id=ANY($1::int[])', [
    mergedIds,
  ]);
  const renames = plan.changes.filter((change) => !change.target);
  // Renaming in place preserves all assignments, numeric identifiers and tenant boundaries.
  await db.query(
    `UPDATE permissions p SET name=m.value,
      scope=CASE WHEN m.key='view_companies' THEN 'shared' ELSE p.scope END
    FROM jsonb_each_text($1::jsonb) m WHERE p.name=m.key`,
    [mapping],
  );
  // Historical jobs retain their original actor. A waiting job must use the new
  // spellings when the worker resumes. Its snapshot may never invent a grant.
  const jobs = (await db.query(
    `SELECT id FROM leave_balance_import_batches
    WHERE status='PROCESSING' AND jsonb_typeof(processing_context->'permissions')='array'
    AND (processing_context->'permissions') ?| $1::text[]`,
    [Object.keys(permissionKeyChanges)],
  )) as Array<{ id: number }>;
  if (jobs.length) {
    await db.query(
      `UPDATE leave_balance_import_batches b SET processing_context=jsonb_set(processing_context,'{permissions}',
      COALESCE((SELECT jsonb_agg(DISTINCT COALESCE($1::jsonb->>k,k)) FROM jsonb_array_elements_text(b.processing_context->'permissions') AS p(k)
        WHERE NOT (k=ANY($3::text[])) OR (b.processing_context->'permissions') ? ($1::jsonb->>k)), '[]'::jsonb))
       WHERE id=ANY($2::int[])`,
      [mapping, jobs.map((job) => job.id), Array.from(redundantCompanyKeys)],
    );
  }
  await db.query(
    "ALTER TABLE permissions ADD CONSTRAINT permissions_canonical_key CHECK (name ~ '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$')",
  );
  await db.query(
    'INSERT INTO rbac_migration_receipts(version,result) VALUES(1797900200000,$1::jsonb)',
    [
      JSON.stringify({
        renames,
        merges,
        removed,
        updatedPendingJobs: jobs.length,
      }),
    ],
  );
}
