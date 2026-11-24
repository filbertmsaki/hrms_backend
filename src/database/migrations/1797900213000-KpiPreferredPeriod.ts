import { MigrationInterface, QueryRunner } from 'typeorm';

export class KpiPreferredPeriod1797900213000 implements MigrationInterface {
  name = 'KpiPreferredPeriod1797900213000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE phase1a_kpi_definition_versions ADD COLUMN preferred_period_id int NULL',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE phase1a_kpi_definition_versions DROP COLUMN preferred_period_id',
    );
  }
}
