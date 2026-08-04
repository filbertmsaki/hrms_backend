import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOffboardingReminderDedup1791900000000
  implements MigrationInterface
{
  name = 'AddOffboardingReminderDedup1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'offboarding_clearances',
      'offboarding_approvals',
      'offboarding_asset_returns',
      'offboarding_settlement_items',
    ];

    for (const table of tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN "last_reminder_at" timestamptz,
        ADD COLUMN "reminder_count" integer NOT NULL DEFAULT 0,
        ADD COLUMN "last_escalated_at" timestamptz,
        ADD COLUMN "escalation_count" integer NOT NULL DEFAULT 0
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'offboarding_settlement_items',
      'offboarding_asset_returns',
      'offboarding_approvals',
      'offboarding_clearances',
    ];

    for (const table of tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        DROP COLUMN "escalation_count",
        DROP COLUMN "last_escalated_at",
        DROP COLUMN "reminder_count",
        DROP COLUMN "last_reminder_at"
      `);
    }
  }
}
