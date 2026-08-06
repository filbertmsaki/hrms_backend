import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeMovements1792300000000
  implements MigrationInterface
{
  name = 'CreateEmployeeMovements1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_grade_histories" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "grade_id" integer NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "source_type" varchar(40),
        "source_id" integer,
        "assignment_reason" text,
        "assigned_by_company_user_id" integer,
        "ended_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_employee_grade_histories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_grade_history_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_grade_history_grade" FOREIGN KEY ("grade_id")
          REFERENCES "employee_grades"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_grade_history_employee"
      ON "employee_grade_histories" ("employee_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_grade_history_company"
      ON "employee_grade_histories" ("company_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_cost_center_histories" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "cost_center_id" integer NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "source_type" varchar(40),
        "source_id" integer,
        "assignment_reason" text,
        "assigned_by_company_user_id" integer,
        "ended_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_employee_cost_center_histories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_cost_center_history_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_cost_center_history_cost_center" FOREIGN KEY ("cost_center_id")
          REFERENCES "cost_centers"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_cost_center_history_employee"
      ON "employee_cost_center_histories" ("employee_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_cost_center_history_company"
      ON "employee_cost_center_histories" ("company_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_movements" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "movement_no" varchar(60) NOT NULL,
        "movement_type" varchar(40) NOT NULL,
        "status" varchar(40) NOT NULL DEFAULT 'DRAFT',
        "title" varchar(200) NOT NULL,
        "reason" text NOT NULL,
        "effective_date" date NOT NULL,
        "requested_by_company_user_id" integer,
        "submitted_at" timestamptz,
        "approved_at" timestamptz,
        "approved_by_company_user_id" integer,
        "applied_at" timestamptz,
        "cancelled_at" timestamptz,
        "rejected_at" timestamptz,
        "current_snapshot" jsonb NOT NULL,
        "proposed_snapshot" jsonb NOT NULL,
        "employee_version_at_creation" integer,
        "snapshot_hash" varchar(128) NOT NULL,
        "application_attempt_count" integer NOT NULL DEFAULT 0,
        "application_failed_at" timestamptz,
        "application_error" text,
        "application_snapshot" jsonb,
        "metadata" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_employee_movements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_movement_company_no" UNIQUE ("company_id", "movement_no"),
        CONSTRAINT "FK_employee_movement_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_movement_company_status"
      ON "employee_movements" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_movement_employee"
      ON "employee_movements" ("company_id", "employee_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_movement_effective_date"
      ON "employee_movements" ("effective_date", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_movement_changes" (
        "id" SERIAL NOT NULL,
        "movement_id" integer NOT NULL,
        "field" varchar(40) NOT NULL,
        "old_reference_id" integer,
        "new_reference_id" integer,
        "old_value" jsonb,
        "new_value" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_employee_movement_changes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_movement_field" UNIQUE ("movement_id", "field"),
        CONSTRAINT "FK_employee_movement_change_movement" FOREIGN KEY ("movement_id")
          REFERENCES "employee_movements"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_movement_number_sequences" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "sequence_year" integer NOT NULL,
        "next_number" integer NOT NULL DEFAULT 1,
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_employee_movement_number_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_movement_sequence_company_year" UNIQUE ("company_id", "sequence_year")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_compensation_versions" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "movement_id" integer,
        "base_salary" decimal(18,2) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "salary_structure_code" varchar(100),
        "pay_frequency" varchar(30) NOT NULL DEFAULT 'MONTHLY',
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "revision_reference" varchar(100),
        "justification" text,
        "approved_by_company_user_id" integer,
        "created_by_company_user_id" integer,
        "payroll_sync_status" varchar(40) NOT NULL DEFAULT 'PENDING_PAYROLL_INTEGRATION',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_employee_compensation_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_compensation_version_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_compensation_version_movement" FOREIGN KEY ("movement_id")
          REFERENCES "employee_movements"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_employee_compensation_employee_effective"
      ON "employee_compensation_versions" ("company_id", "employee_id", "effective_from")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Movement, compensation, and assignment-history data must never be
    // silently destroyed on rollback in a production database.
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_compensation_versions"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_movement_number_sequences"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_movement_changes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_movements"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_cost_center_histories"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_grade_histories"`);
  }
}
