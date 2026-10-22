import { MigrationInterface, QueryRunner } from 'typeorm';

export class VersionEmploymentLetterTemplates1795200000000 implements MigrationInterface {
  name = 'VersionEmploymentLetterTemplates1795200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" ADD "version" integer NOT NULL DEFAULT 1`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" DROP COLUMN "version"`,
    );
  }
}
