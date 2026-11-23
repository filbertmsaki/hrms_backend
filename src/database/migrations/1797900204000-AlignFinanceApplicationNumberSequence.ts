import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignFinanceApplicationNumberSequence1797900204000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'LOCK TABLE employee_finance_applications IN SHARE ROW EXCLUSIVE MODE',
    );
    // Previous application builds could allocate a number without advancing the sequence.
    await runner.query(`
      WITH issued AS (
        SELECT MAX(substring(application_no FROM '^EFAPP-[0-9]+-([0-9]+)$')::bigint) AS highest
        FROM employee_finance_applications
      )
      SELECT setval('employee_finance_application_number_seq', issued.highest, true)
      FROM issued CROSS JOIN employee_finance_application_number_seq AS sequence
      WHERE issued.highest > sequence.last_value
         OR (issued.highest = sequence.last_value AND NOT sequence.is_called)
    `);
  }

  down(): Promise<void> {
    // Allocated application numbers must remain reserved across a downgrade.
    return Promise.resolve();
  }
}
