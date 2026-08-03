import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeMasterDataAndCompanyStructure1791300000000
  implements MigrationInterface
{
  name = 'AddEmployeeMasterDataAndCompanyStructure1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "company_id" integer
    `);

    await queryRunner.query(`
      UPDATE "employees" employee
      SET "company_id" = company_user.company_id
      FROM "company_users" company_user
      WHERE company_user.id = employee.company_user_id
        AND employee.company_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ALTER COLUMN "company_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employee_company"
      FOREIGN KEY ("company_id")
      REFERENCES "companies"("id")
      ON DELETE CASCADE
    `).catch(() => undefined);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "UQ_employee_company_employee_no"
      UNIQUE ("company_id", "employee_no")
    `).catch(() => undefined);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_number_sequences" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "prefix" varchar(20) NOT NULL,
        "padding" smallint NOT NULL DEFAULT 3,
        "next_number" integer NOT NULL DEFAULT 1,
        "updated_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_number_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_number_sequence_company" UNIQUE ("company_id"),
        CONSTRAINT "CHK_employee_number_sequence_padding" CHECK ("padding" BETWEEN 3 AND 12),
        CONSTRAINT "CHK_employee_number_sequence_next" CHECK ("next_number" > 0),
        CONSTRAINT "FK_employee_number_sequence_company"
          FOREIGN KEY ("company_id")
          REFERENCES "companies"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_employee_number_sequence_updated_by"
          FOREIGN KEY ("updated_by_company_user_id")
          REFERENCES "company_users"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_grades" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(50) NOT NULL,
        "name" varchar(120) NOT NULL,
        "level" integer,
        "description" text,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_grades" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_grade_company_code" UNIQUE ("company_id", "code"),
        CONSTRAINT "FK_employee_grade_company"
          FOREIGN KEY ("company_id")
          REFERENCES "companies"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cost_centers" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "branch_id" integer,
        "department_id" integer,
        "code" varchar(50) NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cost_centers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cost_center_company_code" UNIQUE ("company_id", "code"),
        CONSTRAINT "FK_cost_center_company"
          FOREIGN KEY ("company_id")
          REFERENCES "companies"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_cost_center_branch"
          FOREIGN KEY ("branch_id")
          REFERENCES "branches"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_cost_center_department"
          FOREIGN KEY ("department_id")
          REFERENCES "departments"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "grade_id" integer,
      ADD COLUMN IF NOT EXISTS "cost_center_id" integer,
      ADD COLUMN IF NOT EXISTS "probation_start_date" date,
      ADD COLUMN IF NOT EXISTS "confirmation_due_date" date,
      ADD COLUMN IF NOT EXISTS "confirmation_status" varchar(40) NOT NULL DEFAULT 'NOT_APPLICABLE',
      ADD COLUMN IF NOT EXISTS "confirmed_by_company_user_id" integer,
      ADD COLUMN IF NOT EXISTS "confirmation_notes" text,
      ADD COLUMN IF NOT EXISTS "status_changed_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "status_changed_by_company_user_id" integer
    `);

    await queryRunner.query(`
      UPDATE "employees"
      SET "confirmation_due_date" = "probation_end_date"
      WHERE "confirmation_due_date" IS NULL
        AND "probation_end_date" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "employees"
      SET "confirmation_status" =
        CASE
          WHEN "confirmation_date" IS NOT NULL THEN 'CONFIRMED'
          WHEN "probation_end_date" IS NOT NULL THEN 'PROBATION'
          ELSE 'NOT_APPLICABLE'
        END
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employee_grade"
      FOREIGN KEY ("grade_id")
      REFERENCES "employee_grades"("id")
      ON DELETE SET NULL
    `).catch(() => undefined);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employee_cost_center"
      FOREIGN KEY ("cost_center_id")
      REFERENCES "cost_centers"("id")
      ON DELETE SET NULL
    `).catch(() => undefined);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employee_confirmed_by"
      FOREIGN KEY ("confirmed_by_company_user_id")
      REFERENCES "company_users"("id")
      ON DELETE SET NULL
    `).catch(() => undefined);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employee_status_changed_by"
      FOREIGN KEY ("status_changed_by_company_user_id")
      REFERENCES "company_users"("id")
      ON DELETE SET NULL
    `).catch(() => undefined);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_branch_assignments" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "assignment_reason" text,
        "assigned_by_company_user_id" integer,
        "ended_by_company_user_id" integer,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_branch_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_branch_history_employee"
          FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_employee_branch_history_branch"
          FOREIGN KEY ("branch_id")
          REFERENCES "branches"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employee_active_branch_assignment"
      ON "employee_branch_assignments" ("company_id", "employee_id")
      WHERE "status" = 'ACTIVE' AND "effective_to" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_department_assignment_history" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "department_id" integer NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "assignment_reason" text,
        "assigned_by_company_user_id" integer,
        "ended_by_company_user_id" integer,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_department_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_department_history_employee"
          FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_employee_department_history_department"
          FOREIGN KEY ("department_id")
          REFERENCES "departments"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_employee_active_primary_department_history"
      ON "employee_department_assignment_history" ("company_id", "employee_id")
      WHERE "is_primary" = true AND "status" = 'ACTIVE' AND "effective_to" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_reporting_lines" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "manager_employee_id" integer NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "assignment_reason" text,
        "assigned_by_company_user_id" integer,
        "ended_by_company_user_id" integer,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_reporting_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reporting_line_employee"
          FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_reporting_line_manager"
          FOREIGN KEY ("manager_employee_id")
          REFERENCES "employees"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employee_active_reporting_line"
      ON "employee_reporting_lines" ("company_id", "employee_id")
      WHERE "status" = 'ACTIVE' AND "effective_to" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_positions"
      ADD COLUMN IF NOT EXISTS "assignment_reason" text,
      ADD COLUMN IF NOT EXISTS "assigned_by_company_user_id" integer,
      ADD COLUMN IF NOT EXISTS "ended_by_company_user_id" integer
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employee_active_primary_position"
      ON "employee_positions" ("company_id", "employee_id")
      WHERE "is_primary" = true AND "status" = 'ACTIVE' AND "end_date" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_identifications"
      ADD COLUMN IF NOT EXISTS "issue_date" date,
      ADD COLUMN IF NOT EXISTS "issuing_authority" varchar(150),
      ADD COLUMN IF NOT EXISTS "document_url" text,
      ADD COLUMN IF NOT EXISTS "is_verified" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "verified_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "verified_by_company_user_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_identifications"
      ADD CONSTRAINT "FK_employee_identification_verified_by"
      FOREIGN KEY ("verified_by_company_user_id")
      REFERENCES "company_users"("id")
      ON DELETE SET NULL
    `).catch(() => undefined);

    await queryRunner.query(`
      INSERT INTO "employee_branch_assignments" (
        "company_id",
        "employee_id",
        "branch_id",
        "effective_from",
        "effective_to",
        "status",
        "assignment_reason",
        "assigned_by_company_user_id",
        "ended_by_company_user_id"
      )
      SELECT
        employee.company_id,
        employee.id,
        employee.primary_branch_id,
        COALESCE(employee.hire_date, CURRENT_DATE),
        NULL,
        'ACTIVE',
        'Backfilled from current employee snapshot',
        NULL,
        NULL
      FROM "employees" employee
      WHERE employee.primary_branch_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "employee_branch_assignments" existing
          WHERE existing.company_id = employee.company_id
            AND existing.employee_id = employee.id
        )
    `);

    await queryRunner.query(`
      INSERT INTO "employee_department_assignment_history" (
        "company_id",
        "employee_id",
        "department_id",
        "is_primary",
        "effective_from",
        "effective_to",
        "status",
        "assignment_reason",
        "assigned_by_company_user_id",
        "ended_by_company_user_id"
      )
      SELECT
        employee.company_id,
        department_assignment.employee_id,
        department_assignment.department_id,
        department_assignment.is_primary,
        COALESCE(employee.hire_date, CURRENT_DATE),
        NULL,
        'ACTIVE',
        'Backfilled from current employee snapshot',
        NULL,
        NULL
      FROM "employee_departments" department_assignment
      INNER JOIN "employees" employee
        ON employee.id = department_assignment.employee_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM "employee_department_assignment_history" existing
        WHERE existing.company_id = employee.company_id
          AND existing.employee_id = department_assignment.employee_id
          AND existing.department_id = department_assignment.department_id
      )
    `);

    await queryRunner.query(`
      INSERT INTO "employee_reporting_lines" (
        "company_id",
        "employee_id",
        "manager_employee_id",
        "effective_from",
        "effective_to",
        "status",
        "assignment_reason",
        "assigned_by_company_user_id",
        "ended_by_company_user_id"
      )
      SELECT
        employee.company_id,
        employee.id,
        employee.reports_to,
        COALESCE(employee.hire_date, CURRENT_DATE),
        NULL,
        'ACTIVE',
        'Backfilled from current employee snapshot',
        NULL,
        NULL
      FROM "employees" employee
      WHERE employee.reports_to IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "employee_reporting_lines" existing
          WHERE existing.company_id = employee.company_id
            AND existing.employee_id = employee.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_identifications"
      DROP CONSTRAINT IF EXISTS "FK_employee_identification_verified_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_identifications"
      DROP COLUMN IF EXISTS "verified_by_company_user_id",
      DROP COLUMN IF EXISTS "verified_at",
      DROP COLUMN IF EXISTS "is_verified",
      DROP COLUMN IF EXISTS "document_url",
      DROP COLUMN IF EXISTS "issuing_authority",
      DROP COLUMN IF EXISTS "issue_date"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_employee_active_primary_position"
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_positions"
      DROP COLUMN IF EXISTS "ended_by_company_user_id",
      DROP COLUMN IF EXISTS "assigned_by_company_user_id",
      DROP COLUMN IF EXISTS "assignment_reason"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_employee_active_reporting_line"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "employee_reporting_lines"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_employee_active_primary_department_history"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "employee_department_assignment_history"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_employee_active_branch_assignment"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "employee_branch_assignments"
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "FK_employee_status_changed_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "FK_employee_confirmed_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "FK_employee_cost_center"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "FK_employee_grade"
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP COLUMN IF EXISTS "status_changed_by_company_user_id",
      DROP COLUMN IF EXISTS "status_changed_at",
      DROP COLUMN IF EXISTS "confirmation_notes",
      DROP COLUMN IF EXISTS "confirmed_by_company_user_id",
      DROP COLUMN IF EXISTS "confirmation_status",
      DROP COLUMN IF EXISTS "confirmation_due_date",
      DROP COLUMN IF EXISTS "probation_start_date",
      DROP COLUMN IF EXISTS "cost_center_id",
      DROP COLUMN IF EXISTS "grade_id"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "cost_centers"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "employee_grades"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "employee_number_sequences"
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "UQ_employee_company_employee_no"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "FK_employee_company"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP COLUMN IF EXISTS "company_id"
    `);
  }
}
