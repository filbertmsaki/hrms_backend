import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
} from '../migration-helpers/role-permission-grants';

export class AddIdentityChangeAudits1791800000000 implements MigrationInterface {
  name = 'AddIdentityChangeAudits1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Employee names allow 100 chars; widen users so synced names always fit.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "first_name" TYPE character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "last_name" TYPE character varying(100)`,
    );

    await queryRunner.query(`
      CREATE TABLE "identity_change_audits" (
        "id" SERIAL NOT NULL,
        "change_set_id" uuid NOT NULL,
        "company_id" integer NOT NULL,
        "affected_company_ids" integer array NOT NULL DEFAULT '{}',
        "user_id" integer,
        "employee_id" integer,
        "affected_employee_ids" integer array NOT NULL DEFAULT '{}',
        "subject_name" character varying(200),
        "field" character varying(30) NOT NULL,
        "old_value" character varying(150),
        "new_value" character varying(150),
        "source" character varying(30) NOT NULL,
        "rollback_of_change_set_id" uuid,
        "actor_user_id" integer,
        "actor_name" character varying(200),
        "actor_email" character varying(100),
        "reason" text,
        "ip_address" character varying(45),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_identity_change_audits_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_identity_change_audits_change_set" ON "identity_change_audits" ("change_set_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_identity_change_audits_user" ON "identity_change_audits" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_identity_change_audits_employee" ON "identity_change_audits" ("employee_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_identity_change_audits_companies" ON "identity_change_audits" USING GIN ("affected_company_ids")`,
    );
    await queryRunner.query(
      `CREATE FUNCTION identity_change_audit_append_only() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Identity change audits are append-only'; END; $$ LANGUAGE plpgsql`,
    );
    await queryRunner.query(
      `CREATE TRIGGER identity_change_audit_append_only_guard BEFORE UPDATE OR DELETE ON "identity_change_audits" FOR EACH ROW EXECUTE FUNCTION identity_change_audit_append_only()`,
    );

    await ensurePermissions(queryRunner, [
      {
        name: 'identity_audit:read',
        displayName: 'Read identity change audit',
        description:
          'View and export the audit history of name, email and phone changes for users and employees',
      },
      {
        name: 'identity_audit:rollback',
        displayName: 'Roll back identity changes',
        description:
          'Roll back the latest name, email or phone change for a user/employee',
      },
    ]);
    await grantPermissionsToSystemRoles(queryRunner, {
      COMPANY_ADMIN: ['identity_audit:read', 'identity_audit:rollback'],
      HR_MANAGER: ['identity_audit:read'],
      AUDITOR: ['identity_audit:read'],
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permission_role" WHERE "permissionsId" IN (SELECT "id" FROM "permissions" WHERE "name" IN ('identity_audit:read', 'identity_audit:rollback'))`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" IN ('identity_audit:read', 'identity_audit:rollback')`,
    );
    await queryRunner.query(
      `DROP TRIGGER identity_change_audit_append_only_guard ON "identity_change_audits"`,
    );
    await queryRunner.query(
      `DROP FUNCTION identity_change_audit_append_only()`,
    );
    await queryRunner.query(`DROP TABLE "identity_change_audits"`);
    // Names longer than 50 chars would fail to narrow; truncate explicitly.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "last_name" TYPE character varying(50) USING LEFT("last_name", 50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "first_name" TYPE character varying(50) USING LEFT("first_name", 50)`,
    );
  }
}
