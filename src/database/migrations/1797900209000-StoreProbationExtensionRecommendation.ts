import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreProbationExtensionRecommendation1797900209000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`ALTER TABLE probation_review_cycles
      ADD COLUMN recommended_extension_days integer,
      ADD CONSTRAINT "CHK_probation_recommended_extension_days" CHECK (recommended_extension_days > 0)`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(
      'ALTER TABLE probation_review_cycles DROP COLUMN recommended_extension_days',
    );
  }
}
