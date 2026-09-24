import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollOvertimeRequests1790800000000 implements MigrationInterface {
  name = 'AddPayrollOvertimeRequests1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payroll_overtime_requests" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "manager_employee_id" integer,
        "work_date" date NOT NULL,
        "requested_minutes" integer NOT NULL,
        "reason" text NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING_MANAGER',
        "manager_comments" text,
        "manager_decided_by_company_user_id" integer,
        "manager_decided_at" timestamptz,
        "hr_comments" text,
        "hr_decided_by_company_user_id" integer,
        "hr_decided_at" timestamptz,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_payroll_overtime_request_minutes" CHECK ("requested_minutes" BETWEEN 1 AND 1440)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payroll_overtime_request_active_date"
      ON "payroll_overtime_requests" ("company_id", "employee_id", "work_date")
      WHERE "status" <> 'REJECTED'
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payroll_overtime_request_company_status"
      ON "payroll_overtime_requests" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payroll_overtime_request_manager_status"
      ON "payroll_overtime_requests" ("company_id", "manager_employee_id", "status")
    `);
    await queryRunner.query(`
      INSERT INTO "payroll_overtime_requests" (
        "company_id", "employee_id", "manager_employee_id", "work_date",
        "requested_minutes", "reason", "status", "hr_comments"
      )
      SELECT summary."company_id", summary."employee_id", employee."reports_to",
        summary."attendance_date", LEAST(summary."overtime_minutes", 1440),
        'Imported from previous overtime approval', 'APPROVED',
        'Approved before the overtime request workflow was introduced'
      FROM "attendance_daily_summaries" summary
      JOIN "employees" employee ON employee."id" = summary."employee_id"
        AND employee."company_id" = summary."company_id"
      WHERE summary."overtime_minutes" > 0
        AND (
          summary."flags" ->> 'otApprovalStatus' = 'APPROVED'
          OR summary."flags" ->> 'overtimeApproved' = 'true'
          OR summary."flags" ->> 'otApproved' = 'true'
          OR summary."flags" ->> 'payrollApproved' = 'true'
        )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "payroll_overtime_requests"');
  }
}
