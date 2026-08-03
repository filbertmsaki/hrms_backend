import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeDocumentMetadata1791100000000 implements MigrationInterface {
  name = 'AddEmployeeDocumentMetadata1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "original_file_name"
      varchar(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "mime_type"
      varchar(150)
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "file_size"
      bigint
    `);

    await queryRunner.query(`
      UPDATE "employee_documents"
      SET "original_file_name" = regexp_replace("file_url", '^.*/', '')
      WHERE "original_file_name" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "file_size"
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "mime_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "original_file_name"
    `);
  }
}
