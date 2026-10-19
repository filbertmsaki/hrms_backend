import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldOpportunityReplayProtection1794400000000 implements MigrationInterface {
  name = 'AddFieldOpportunityReplayProtection1794400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "field_opportunities" ADD COLUMN "client_request_id" uuid`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_field_opportunity_client_request" ON "field_opportunities" ("company_id", "employee_id", "client_request_id") WHERE "client_request_id" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_field_opportunity_client_request"`);
    await queryRunner.query(
      `ALTER TABLE "field_opportunities" DROP COLUMN "client_request_id"`,
    );
  }
}
