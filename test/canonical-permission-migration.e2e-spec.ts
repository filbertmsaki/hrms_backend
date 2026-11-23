import { DataSource } from 'typeorm';
import {
  applyPermissionMigration,
  inspectPermissionMigration,
} from '../src/database/migration-helpers/canonical-permissions';

describe('canonical permission conversion in PostgreSQL', () => {
  it('refuses one-sided grants, preserves scoped assignments, and can be retried', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      installExtensions: false,
    });
    await dataSource.initialize();
    const db = dataSource.createQueryRunner();
    try {
      await db.startTransaction();
      // The isolated search path keeps the real catalogue and migration ledger outside the fixture.
      await db.query(
        'CREATE TEMP TABLE permissions(id integer PRIMARY KEY,name text UNIQUE,scope text,is_system_generated boolean)',
      );
      await db.query('SET LOCAL search_path TO pg_temp');
      await db.query(
        'CREATE TEMP TABLE permission_role("rolesId" int,"permissionsId" int,PRIMARY KEY("rolesId","permissionsId"))',
      );
      await db.query(
        'CREATE TEMP TABLE permission_user("usersId" int,"permissionsId" int,PRIMARY KEY("usersId","permissionsId"))',
      );
      await db.query(
        'CREATE TEMP TABLE company_user_permissions(id int,company_user_id int,permission_id int,UNIQUE(company_user_id,permission_id))',
      );
      await db.query(
        'CREATE TEMP TABLE role_audit_logs(id int,permission_id int)',
      );
      await db.query(
        'CREATE TEMP TABLE leave_balance_import_batches(id int,status text,processing_context jsonb)',
      );
      await db.query(
        "INSERT INTO permissions VALUES (1,'view_companies','platform',true),(2,'companies:read','shared',true),(3,'leave-balances.adjust','company',true)",
      );
      await db.query('INSERT INTO permission_role VALUES(7,1),(7,2),(7,3)');
      await db.query('INSERT INTO permission_user VALUES(8,1),(8,2)');
      await db.query(
        'INSERT INTO company_user_permissions VALUES(1,9,1),(2,9,3)',
      );
      await db.query('INSERT INTO role_audit_logs VALUES(10,1)');
      await db.query(
        "INSERT INTO leave_balance_import_batches VALUES (22,'PROCESSING',$1::jsonb)",
        [
          JSON.stringify({
            permissions: ['view_companies', 'leave-balances.adjust'],
          }),
        ],
      );
      expect((await inspectPermissionMigration(db)).conflicts).toEqual([
        expect.stringContaining('company_user_permissions'),
      ]);
      await expect(applyPermissionMigration(db)).rejects.toThrow(
        'review before merging',
      );
      await db.query('INSERT INTO company_user_permissions VALUES(3,9,2)');
      await applyPermissionMigration(db);
      await applyPermissionMigration(db);
      expect(
        await db.query('SELECT id,name FROM permissions ORDER BY id'),
      ).toEqual([
        { id: 2, name: 'companies:read' },
        { id: 3, name: 'leave_balances:adjust-manually' },
      ]);
      expect(
        await db.query(
          'SELECT permission_id FROM company_user_permissions ORDER BY permission_id',
        ),
      ).toEqual([{ permission_id: 2 }, { permission_id: 3 }]);
      expect(
        await db.query('SELECT permission_id FROM role_audit_logs'),
      ).toEqual([{ permission_id: 2 }]);
      expect(
        await db.query(
          'SELECT processing_context FROM leave_balance_import_batches',
        ),
      ).toEqual([
        {
          processing_context: {
            permissions: ['leave_balances:adjust-manually'],
          },
        },
      ]);
      expect((await inspectPermissionMigration(db)).changes).toHaveLength(0);
      expect(
        await db.query(
          'SELECT count(*)::int AS n FROM rbac_migration_receipts',
        ),
      ).toEqual([{ n: 1 }]);
    } finally {
      if (db.isTransactionActive) await db.rollbackTransaction();
      await db.release();
      await dataSource.destroy();
    }
  });
});
