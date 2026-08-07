import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeEmployeeListingIndexes1785802600000 implements MigrationInterface {
  name = 'OptimizeEmployeeListingIndexes1785802600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_employee_no" ON "employees" ("employee_no")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_employment_status" ON "employees" ("employment_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_primary_branch" ON "employees" ("primary_branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_primary_department" ON "employees" ("primary_department_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_primary_position" ON "employees" ("primary_position_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_reports_to" ON "employees" ("reports_to")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_department_department" ON "employee_departments" ("department_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_department_department"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_employee_reports_to"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_primary_position"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_primary_department"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_primary_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_employee_employment_status"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_employee_employee_no"`);
  }
}
