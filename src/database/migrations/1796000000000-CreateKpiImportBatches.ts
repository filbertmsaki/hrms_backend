import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKpiImportBatches1796000000000 implements MigrationInterface {
  name = 'CreateKpiImportBatches1796000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kpi_import_batches" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "created_by_company_user_id" integer,
        "approved_by_company_user_id" integer,
        "checksum" character varying(64) NOT NULL,
        "status" character varying(20) NOT NULL,
        "row_count" integer NOT NULL,
        "valid_row_count" integer NOT NULL,
        "rows" jsonb NOT NULL,
        "applied_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kpi_import_batches" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kpi_import_batch_company_checksum" UNIQUE ("company_id", "checksum")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_kpi_import_batch_company_created" ON "kpi_import_batches" ("company_id", "created_at")`,
    );
    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated", "created_at", "updated_at")
      VALUES
        ('performance_aggregates:publish', 'Publish performance aggregates', 'Allow authorized approvers to publish calculated aggregates to employee self-service', 'company', false, now(), now()),
        ('performance_kpi_imports:read', 'Read KPI import batches', 'Allow viewing tenant-scoped KPI CSV import batches and validation errors', 'company', false, now(), now()),
        ('performance_kpi_imports:manage', 'Manage KPI imports', 'Allow previewing and applying approved KPI CSV import batches', 'company', false, now(), now()),
        ('performance_kpi_imports:approve', 'Approve KPI imports', 'Allow a different authorized user to approve a validated KPI CSV batch', 'company', false, now(), now())
      ON CONFLICT ("name") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT r."id", permission."id"
      FROM "roles" r
      CROSS JOIN "permissions" permission
      WHERE r."name" IN ('HR_MANAGER', 'HR_OFFICER')
        AND permission."name" IN (
          'performance_aggregates:publish',
          'performance_kpi_imports:read',
          'performance_kpi_imports:manage',
          'performance_kpi_imports:approve'
        )
      ON CONFLICT ("rolesId", "permissionsId") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permission_role" grant_row
      USING "roles" r, "permissions" permission
      WHERE grant_row."rolesId" = r."id"
        AND grant_row."permissionsId" = permission."id"
        AND r."name" IN ('HR_MANAGER', 'HR_OFFICER')
        AND permission."name" IN (
          'performance_aggregates:publish',
          'performance_kpi_imports:read',
          'performance_kpi_imports:manage',
          'performance_kpi_imports:approve'
        )
    `);
    await queryRunner.query(
      `DROP INDEX "IDX_kpi_import_batch_company_created"`,
    );
    await queryRunner.query(`DROP TABLE "kpi_import_batches"`);
  }
}
