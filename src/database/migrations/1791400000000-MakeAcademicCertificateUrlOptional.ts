import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeAcademicCertificateUrlOptional1791400000000 implements MigrationInterface {
  name = 'MakeAcademicCertificateUrlOptional1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "employee_academic_qualifications"
      ALTER COLUMN "academic_certificate_document_url" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "employee_academic_qualifications"
      SET "academic_certificate_document_url" = ''
      WHERE "academic_certificate_document_url" IS NULL`);
    await queryRunner.query(`ALTER TABLE "employee_academic_qualifications"
      ALTER COLUMN "academic_certificate_document_url" SET NOT NULL`);
  }
}
