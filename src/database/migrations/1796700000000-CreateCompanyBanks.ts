import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompanyBanks1796700000000 implements MigrationInterface {
  name = 'CreateCompanyBanks1796700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "company_banks" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "name" character varying(160) NOT NULL,
        "logo_url" character varying(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_banks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_banks_company_name" UNIQUE ("company_id", "name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_company_banks_company_active" ON "company_banks" ("company_id", "is_active")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_company_banks_company_active"`);
    await queryRunner.query(`DROP TABLE "company_banks"`);
  }
}
