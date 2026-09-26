import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaveBalanceBulkImport1791200000000 implements MigrationInterface {
  name = 'AddLeaveBalanceBulkImport1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."leave_balance_adjustments_source_enum" ADD VALUE IF NOT EXISTS 'BULK_IMPORT'`,
    );

    await queryRunner.query(`CREATE TABLE "leave_balance_import_batches" (
      "id" SERIAL NOT NULL,
      "batch_ref" varchar(40) NOT NULL,
      "company_id" integer NOT NULL,
      "fiscal_year" varchar(20) NOT NULL,
      "template_id" varchar(64),
      "template_version" varchar(20) NOT NULL,
      "template_generated_at" TIMESTAMP WITH TIME ZONE,
      "status" varchar(30) NOT NULL,
      "import_mode" varchar(30),
      "original_file_name" varchar(255) NOT NULL,
      "file_size" integer NOT NULL DEFAULT 0,
      "file_checksum" varchar(128) NOT NULL,
      "default_reason" text,
      "total_rows" integer NOT NULL DEFAULT 0,
      "valid_rows" integer NOT NULL DEFAULT 0,
      "warning_rows" integer NOT NULL DEFAULT 0,
      "invalid_rows" integer NOT NULL DEFAULT 0,
      "no_change_rows" integer NOT NULL DEFAULT 0,
      "imported_rows" integer NOT NULL DEFAULT 0,
      "skipped_rows" integer NOT NULL DEFAULT 0,
      "failed_rows" integer NOT NULL DEFAULT 0,
      "total_employees" integer NOT NULL DEFAULT 0,
      "employees_affected" integer NOT NULL DEFAULT 0,
      "summary" jsonb,
      "failure_reason" text,
      "uploaded_by_company_user_id" integer,
      "confirmed_by_company_user_id" integer,
      "confirmed_at" TIMESTAMP WITH TIME ZONE,
      "started_at" TIMESTAMP WITH TIME ZONE,
      "completed_at" TIMESTAMP WITH TIME ZONE,
      "cancelled_by_company_user_id" integer,
      "cancelled_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_leave_balance_import_batches" PRIMARY KEY ("id"),
      CONSTRAINT "FK_e88acc233a80804095dd724c8dd" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_98d93b0bba92f206e7bb492c266" FOREIGN KEY ("uploaded_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_1c151025b9137fad49946a398c6" FOREIGN KEY ("confirmed_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_042c8011f3553d4ec6789045e87" FOREIGN KEY ("cancelled_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_leave_balance_import_batch_ref" ON "leave_balance_import_batches" ("batch_ref")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_import_batch_company_created" ON "leave_balance_import_batches" ("company_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_import_batch_status" ON "leave_balance_import_batches" ("status")`,
    );

    await queryRunner.query(`CREATE TABLE "leave_balance_import_rows" (
      "id" SERIAL NOT NULL,
      "batch_id" integer NOT NULL,
      "row_number" integer NOT NULL,
      "employee_no" varchar(100),
      "employee_name" varchar(255),
      "leave_type_code" varchar(50),
      "leave_type_name" varchar(120),
      "branch_name" varchar(150),
      "department_name" varchar(150),
      "employee_id" integer,
      "leave_type_id" integer,
      "leave_balance_id" integer,
      "branch_id" integer,
      "department_id" integer,
      "raw_data" jsonb NOT NULL,
      "uploaded_current_balance" numeric(8,2),
      "db_current_balance" numeric(8,2),
      "new_balance" numeric(8,2),
      "adjustment_days" numeric(8,2),
      "balance_version" integer,
      "reason" text,
      "validation_status" varchar(20) NOT NULL,
      "result_status" varchar(20),
      "error_code" varchar(60),
      "message" text,
      "issues" jsonb,
      "previous_balance_at_import" numeric(8,2),
      "new_balance_at_import" numeric(8,2),
      "leave_balance_adjustment_id" integer,
      "leave_balance_transaction_id" integer,
      "processed_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_leave_balance_import_rows" PRIMARY KEY ("id"),
      CONSTRAINT "FK_b2dd3be3d246213ae7a22f634d9" FOREIGN KEY ("batch_id") REFERENCES "leave_balance_import_batches"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_eac449c3e523774aac620142e36" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_6298fe2b0b3de0eed4df2c7e430" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_139fcf642904da7604c0a5c7748" FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balances"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_58739fe613db996154a549e54c6" FOREIGN KEY ("leave_balance_adjustment_id") REFERENCES "leave_balance_adjustments"("id") ON DELETE SET NULL
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_leave_balance_import_row_number" ON "leave_balance_import_rows" ("batch_id", "row_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_import_row_batch_status" ON "leave_balance_import_rows" ("batch_id", "validation_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_import_row_employee" ON "leave_balance_import_rows" ("employee_id")`,
    );

    await queryRunner.query(`ALTER TABLE "leave_balance_adjustments"
      ADD COLUMN "leave_balance_transaction_id" integer,
      ADD COLUMN "import_batch_id" integer,
      ADD COLUMN "import_row_id" integer,
      ADD COLUMN "reference" varchar(120)`);
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_d3e7f5bfc2b70857204eac9c3ca" FOREIGN KEY ("leave_balance_transaction_id") REFERENCES "leave_balance_transactions"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_dec8e5f5f473574d7abe07baecc" FOREIGN KEY ("import_batch_id") REFERENCES "leave_balance_import_batches"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_6c1a6b2f2133e9b86fc94e48e3d" FOREIGN KEY ("import_row_id") REFERENCES "leave_balance_import_rows"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_adjustment_import_batch" ON "leave_balance_adjustments" ("import_batch_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_leave_balance_adjustment_import_batch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_6c1a6b2f2133e9b86fc94e48e3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_dec8e5f5f473574d7abe07baecc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_d3e7f5bfc2b70857204eac9c3ca"`,
    );
    await queryRunner.query(`ALTER TABLE "leave_balance_adjustments"
      DROP COLUMN "reference",
      DROP COLUMN "import_row_id",
      DROP COLUMN "import_batch_id",
      DROP COLUMN "leave_balance_transaction_id"`);
    await queryRunner.query(`DROP TABLE "leave_balance_import_rows"`);
    await queryRunner.query(`DROP TABLE "leave_balance_import_batches"`);
    // Postgres cannot drop a single enum value. Any BULK_IMPORT adjustments
    // are relabelled so the column still validates against the old enum.
    await queryRunner.query(
      `UPDATE "leave_balance_adjustments" SET "source" = 'MANUAL' WHERE "source"::text = 'BULK_IMPORT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."leave_balance_adjustments_source_enum" RENAME TO "leave_balance_adjustments_source_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."leave_balance_adjustments_source_enum" AS ENUM('MANUAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ALTER COLUMN "source" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ALTER COLUMN "source" TYPE "public"."leave_balance_adjustments_source_enum" USING "source"::text::"public"."leave_balance_adjustments_source_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ALTER COLUMN "source" SET DEFAULT 'MANUAL'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."leave_balance_adjustments_source_enum_old"`,
    );
  }
}
