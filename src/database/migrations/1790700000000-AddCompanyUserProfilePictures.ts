import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyUserProfilePictures1790700000000 implements MigrationInterface {
  name = 'AddCompanyUserProfilePictures1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_users" ADD "profile_photo_url" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" ADD "profile_image_source" character varying(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" ADD "default_avatar_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" ADD CONSTRAINT "FK_company_users_default_avatar" FOREIGN KEY ("default_avatar_id") REFERENCES "default_avatars"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_users" DROP CONSTRAINT "FK_company_users_default_avatar"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" DROP COLUMN "default_avatar_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" DROP COLUMN "profile_image_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" DROP COLUMN "profile_photo_url"`,
    );
  }
}
