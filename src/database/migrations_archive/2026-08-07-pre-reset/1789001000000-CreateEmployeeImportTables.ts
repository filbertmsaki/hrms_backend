import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeImportTables1789001000000 implements MigrationInterface {
  name = 'CreateEmployeeImportTables1789001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."employee_import_batches_import_mode_enum" AS ENUM(
        'CREATE_ONLY',
        'UPDATE_EXISTING',
        'CREATE_OR_UPDATE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."employee_import_batches_status_enum" AS ENUM(
        'PREVIEW_READY',
        'IMPORTING',
        'COMPLETED',
        'COMPLETED_WITH_ERRORS',
        'FAILED',
        'EXPIRED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."employee_import_rows_status_enum" AS ENUM(
        'READY',
        'INVALID',
        'IMPORTED',
        'UPDATED',
        'FAILED',
        'SKIPPED'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "employee_import_batches" (
        "id" SERIAL NOT NULL,
        "batch_id" character varying(40) NOT NULL,
        "company_id" integer NOT NULL,
        "preview_token" character varying(120) NOT NULL,
        "import_mode" "public"."employee_import_batches_import_mode_enum" NOT NULL DEFAULT 'CREATE_ONLY',
        "status" "public"."employee_import_batches_status_enum" NOT NULL DEFAULT 'PREVIEW_READY',
        "original_file_name" character varying(255) NOT NULL,
        "file_size" bigint NOT NULL DEFAULT '0',
        "file_checksum" character varying(128) NOT NULL,
        "uploaded_by_company_user_id" integer,
        "preview_expires_at" TIMESTAMP,
        "total_rows" integer NOT NULL DEFAULT '0',
        "valid_rows" integer NOT NULL DEFAULT '0',
        "invalid_rows" integer NOT NULL DEFAULT '0',
        "duplicate_rows" integer NOT NULL DEFAULT '0',
        "successful_rows" integer NOT NULL DEFAULT '0',
        "failed_rows" integer NOT NULL DEFAULT '0',
        "warning_rows" integer NOT NULL DEFAULT '0',
        "created_employees" integer NOT NULL DEFAULT '0',
        "updated_employees" integer NOT NULL DEFAULT '0',
        "created_users" integer NOT NULL DEFAULT '0',
        "device_assignments_created" integer NOT NULL DEFAULT '0',
        "device_sync_pending" integer NOT NULL DEFAULT '0',
        "validation_summary" json,
        "failure_reason" text,
        "metadata" json,
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_import_batches" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "employee_import_rows" (
        "id" SERIAL NOT NULL,
        "batch_id" integer NOT NULL,
        "row_number" integer NOT NULL,
        "status" "public"."employee_import_rows_status_enum" NOT NULL DEFAULT 'READY',
        "employee_name" character varying(255),
        "employee_number" character varying(100),
        "device_employee_number" character varying(100),
        "import_action" character varying(40),
        "raw_data" json NOT NULL,
        "normalized_data" json,
        "warnings" json,
        "errors" json,
        "matched_employee_id" integer,
        "created_employee_id" integer,
        "created_user_id" integer,
        "result_data" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_import_rows" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_employee_import_batches_batch_id" ON "employee_import_batches" ("batch_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_employee_import_batches_preview_token" ON "employee_import_batches" ("preview_token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_import_batches_company" ON "employee_import_batches" ("company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_import_batches_status" ON "employee_import_batches" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_import_rows_batch" ON "employee_import_rows" ("batch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_import_rows_status" ON "employee_import_rows" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_import_rows_employee_number" ON "employee_import_rows" ("employee_number")`,
    );
    await queryRunner.query(`
      ALTER TABLE "employee_import_batches"
      ADD CONSTRAINT "FK_employee_import_batches_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_import_batches"
      ADD CONSTRAINT "FK_employee_import_batches_company_user"
      FOREIGN KEY ("uploaded_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_import_rows"
      ADD CONSTRAINT "FK_employee_import_rows_batch"
      FOREIGN KEY ("batch_id") REFERENCES "employee_import_batches"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_import_rows"
      ADD CONSTRAINT "FK_employee_import_rows_matched_employee"
      FOREIGN KEY ("matched_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_import_rows"
      ADD CONSTRAINT "FK_employee_import_rows_created_employee"
      FOREIGN KEY ("created_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_import_rows"
      ADD CONSTRAINT "FK_employee_import_rows_created_user"
      FOREIGN KEY ("created_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee_import_rows" DROP CONSTRAINT "FK_employee_import_rows_created_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_import_rows" DROP CONSTRAINT "FK_employee_import_rows_created_employee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_import_rows" DROP CONSTRAINT "FK_employee_import_rows_matched_employee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_import_rows" DROP CONSTRAINT "FK_employee_import_rows_batch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_import_batches" DROP CONSTRAINT "FK_employee_import_batches_company_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_import_batches" DROP CONSTRAINT "FK_employee_import_batches_company"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_import_rows_employee_number"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_import_rows_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_import_rows_batch"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_import_batches_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_import_batches_company"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_import_batches_preview_token"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_import_batches_batch_id"`,
    );
    await queryRunner.query(`DROP TABLE "employee_import_rows"`);
    await queryRunner.query(`DROP TABLE "employee_import_batches"`);
    await queryRunner.query(
      `DROP TYPE "public"."employee_import_rows_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employee_import_batches_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employee_import_batches_import_mode_enum"`,
    );
  }
}
