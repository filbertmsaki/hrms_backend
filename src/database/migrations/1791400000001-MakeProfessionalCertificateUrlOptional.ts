import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeProfessionalCertificateUrlOptional1791400000001 implements MigrationInterface {
  name = 'MakeProfessionalCertificateUrlOptional1791400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "employee_professional_qualifications"
      ALTER COLUMN "professional_certificate_document_url" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "employee_professional_qualifications"
      SET "professional_certificate_document_url" = ''
      WHERE "professional_certificate_document_url" IS NULL`);
    await queryRunner.query(`ALTER TABLE "employee_professional_qualifications"
      ALTER COLUMN "professional_certificate_document_url" SET NOT NULL`);
  }
}
