import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveEncashmentPayrollInput1797900009000
  implements MigrationInterface
{
  name = 'LeaveEncashmentPayrollInput1797900009000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leave_encashment_requests
      ADD COLUMN IF NOT EXISTS payroll_input_id int NULL`);
    await q.query(`ALTER TABLE leave_encashment_requests
      ADD CONSTRAINT "UQ_leave_encashment_payroll_input" UNIQUE (payroll_input_id)`);
    await q.query(`ALTER TABLE leave_encashment_requests
      ADD CONSTRAINT "FK_leave_encashment_payroll_input"
      FOREIGN KEY (payroll_input_id) REFERENCES payroll_inputs(id) ON DELETE SET NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leave_encashment_requests
      DROP CONSTRAINT IF EXISTS "FK_leave_encashment_payroll_input",
      DROP CONSTRAINT IF EXISTS "UQ_leave_encashment_payroll_input",
      DROP COLUMN IF EXISTS payroll_input_id`);
  }
}
