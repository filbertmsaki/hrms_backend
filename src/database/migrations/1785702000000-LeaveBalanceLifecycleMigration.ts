import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveBalanceLifecycleMigration1785702000000
  implements MigrationInterface
{
  name = 'LeaveBalanceLifecycleMigration1785702000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD "opening_balance_days" numeric(8,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD "entitlement_days" numeric(8,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD "adjusted_days" numeric(8,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD "attendance_deduction_days" numeric(8,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD "generated_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `UPDATE "leave_balances"
       SET "opening_balance_days" = COALESCE("carried_forward_days", 0),
           "entitlement_days" = COALESCE("allocated_days", 0),
           "adjusted_days" = 0,
           "attendance_deduction_days" = 0,
           "generated_at" = COALESCE("updated_at", NOW())`,
    );

    await queryRunner.query(
      `ALTER TABLE "leave_policies" ADD "attendance_balance_deduction_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" ADD "absent_day_deduction_days" numeric(8,2) NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" ADD "unpaid_leave_day_deduction_days" numeric(8,2) NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" ADD "half_day_deduction_days" numeric(8,2) NOT NULL DEFAULT '0.5'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."leave_balance_adjustments_source_enum" AS ENUM('MANUAL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_balance_adjustments" ("id" SERIAL NOT NULL, "company_id" integer NOT NULL, "leave_balance_id" integer NOT NULL, "employee_id" integer NOT NULL, "leave_type_id" integer NOT NULL, "fiscal_year" character varying(20) NOT NULL, "old_balance_days" numeric(8,2) NOT NULL, "new_balance_days" numeric(8,2) NOT NULL, "adjustment_amount_days" numeric(8,2) NOT NULL, "reason" text NOT NULL, "source" "public"."leave_balance_adjustments_source_enum" NOT NULL DEFAULT 'MANUAL', "adjusted_by_company_user_id" integer, "adjusted_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_leave_balance_adjustments_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_adjustment_company" ON "leave_balance_adjustments" ("company_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_adjustment_employee" ON "leave_balance_adjustments" ("employee_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_adjustment_leave_type" ON "leave_balance_adjustments" ("leave_type_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_adjustment_fiscal_year" ON "leave_balance_adjustments" ("fiscal_year") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_balance_adjustment_leave_balance" ON "leave_balance_adjustments" ("leave_balance_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_leave_balance_adjustments_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_leave_balance_adjustments_balance" FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balances"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_leave_balance_adjustments_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_leave_balance_adjustments_leave_type" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "FK_leave_balance_adjustments_company_user" FOREIGN KEY ("adjusted_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `UPDATE "leave_types"
       SET "max_carry_forward_days" = '0.00'
       WHERE "code" = 'ANNUAL' AND "is_carry_forward_allowed" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_leave_balance_adjustment_leave_balance"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_leave_balance_adjustment_fiscal_year"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_leave_balance_adjustment_leave_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_leave_balance_adjustment_employee"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_leave_balance_adjustment_company"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_leave_balance_adjustments_company_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_leave_balance_adjustments_leave_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_leave_balance_adjustments_employee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_leave_balance_adjustments_balance"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_adjustments" DROP CONSTRAINT "FK_leave_balance_adjustments_company"`,
    );
    await queryRunner.query(`DROP TABLE "leave_balance_adjustments"`);
    await queryRunner.query(
      `DROP TYPE "public"."leave_balance_adjustments_source_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "leave_policies" DROP COLUMN "half_day_deduction_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" DROP COLUMN "unpaid_leave_day_deduction_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" DROP COLUMN "absent_day_deduction_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" DROP COLUMN "attendance_balance_deduction_enabled"`,
    );

    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP COLUMN "generated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP COLUMN "attendance_deduction_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP COLUMN "adjusted_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP COLUMN "entitlement_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP COLUMN "opening_balance_days"`,
    );
  }
}
