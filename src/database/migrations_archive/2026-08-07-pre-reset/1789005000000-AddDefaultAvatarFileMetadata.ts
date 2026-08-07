import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultAvatarFileMetadata1789005000000 implements MigrationInterface {
  name = 'AddDefaultAvatarFileMetadata1789005000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "original_file_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "stored_file_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "file_extension" character varying(20)
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "mime_type" character varying(150)
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "file_size" bigint
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "file_path" text
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "file_url" text
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "width" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars"
      ADD COLUMN "height" integer
    `);

    await queryRunner.query(`
      UPDATE "default_avatars"
      SET
        "stored_file_name" = regexp_replace("image_path", '^.*/', ''),
        "original_file_name" = regexp_replace("image_path", '^.*/', ''),
        "file_extension" = lower(regexp_replace(regexp_replace("image_path", '^.*/', ''), '^.*\\.', '')),
        "mime_type" = CASE lower(regexp_replace(regexp_replace("image_path", '^.*/', ''), '^.*\\.', ''))
          WHEN 'svg' THEN 'image/svg+xml'
          WHEN 'jpg' THEN 'image/jpeg'
          WHEN 'jpeg' THEN 'image/jpeg'
          WHEN 'png' THEN 'image/png'
          WHEN 'webp' THEN 'image/webp'
          ELSE NULL
        END,
        "file_path" = "image_path",
        "file_url" = "image_path"
      WHERE "image_path" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "height"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "width"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "file_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "file_path"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "file_size"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "mime_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "file_extension"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "stored_file_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "default_avatars" DROP COLUMN IF EXISTS "original_file_name"
    `);
  }
}
