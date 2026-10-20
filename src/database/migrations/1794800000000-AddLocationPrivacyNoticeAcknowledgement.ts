import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationPrivacyNoticeAcknowledgement1794800000000 implements MigrationInterface {
  name = 'AddLocationPrivacyNoticeAcknowledgement1794800000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
      VALUES ('location_privacy:manage', 'Manage location privacy notices', 'Publish approved company location privacy notices and review employee acknowledgement records', 'company', true)
      ON CONFLICT ("name") DO NOTHING`);
    await queryRunner.query(`CREATE TABLE "location_privacy_notices" (
      "id" SERIAL PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "version" integer NOT NULL, "title" varchar(160) NOT NULL, "body" text NOT NULL,
      "status" varchar(20) NOT NULL DEFAULT 'ACTIVE', "require_acknowledgement" boolean NOT NULL DEFAULT true,
      "approval_status" varchar(30) NOT NULL, "is_demo" boolean NOT NULL DEFAULT false,
      "approval_reference" varchar(160) NULL, "approved_by_company_user_id" integer NULL,
      "approved_at" timestamptz NULL, "published_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_location_privacy_notice_company_version" UNIQUE ("company_id", "version"),
      CONSTRAINT "CHK_location_privacy_notice_approval" CHECK ("approval_status" IN ('DEMO_APPROVED','COMPANY_APPROVED')),
      CONSTRAINT "CHK_location_privacy_notice_demo_approval" CHECK (("is_demo" AND "approval_status" = 'DEMO_APPROVED') OR (NOT "is_demo" AND "approval_status" = 'COMPANY_APPROVED'))
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_location_privacy_one_active_notice" ON "location_privacy_notices" ("company_id") WHERE "status" = 'ACTIVE'`,
    );
    await queryRunner.query(`CREATE TABLE "location_privacy_acknowledgements" (
      "id" SERIAL PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "notice_id" integer NOT NULL REFERENCES "location_privacy_notices"("id") ON DELETE CASCADE,
      "employee_id" integer NOT NULL, "company_user_id" integer NOT NULL, "notice_version" integer NOT NULL,
      "demo_acknowledgement" boolean NOT NULL DEFAULT false, "acknowledged_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_location_privacy_ack_notice_employee" UNIQUE ("notice_id", "employee_id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_location_privacy_ack_company_employee" ON "location_privacy_acknowledgements" ("company_id", "employee_id")`,
    );
    await queryRunner.query(`INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
      WHERE r."name" IN ('COMPANY_ADMIN', 'HR_MANAGER') AND r."company_id" IS NOT NULL
        AND p."name" = 'location_privacy:manage'
      ON CONFLICT DO NOTHING`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "location_privacy_acknowledgements"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "location_privacy_notices"`);
    // Keep the permission and grants on rollback to avoid revoking access that may have been assigned later.
  }
}
