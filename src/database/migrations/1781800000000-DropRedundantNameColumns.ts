import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRedundantNameColumns1781800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`access_organizations\` DROP COLUMN \`name\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`access_schedule_templates\` DROP COLUMN \`name\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`access_organizations\` ADD COLUMN \`name\` VARCHAR(150) NULL AFTER \`hikvision_group_no\``,
    );

    await queryRunner.query(
      `UPDATE \`access_organizations\` SET \`name\` = \`org_name\` WHERE \`name\` IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`access_schedule_templates\` ADD COLUMN \`name\` VARCHAR(150) NULL AFTER \`hikvision_template_no\``,
    );

    await queryRunner.query(
      `UPDATE \`access_schedule_templates\` SET \`name\` = \`template_name\` WHERE \`name\` IS NULL`,
    );
  }
}
