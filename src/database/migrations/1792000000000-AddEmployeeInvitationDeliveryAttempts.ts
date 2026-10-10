import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeInvitationDeliveryAttempts1792000000000 implements MigrationInterface {
  name = 'AddEmployeeInvitationDeliveryAttempts1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD "delivery_attempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD "last_delivery_attempt_at" TIMESTAMP WITH TIME ZONE`,
    );
    // Every existing invitation has already been delivered once.
    await queryRunner.query(
      `UPDATE "employee_invitations" SET "delivery_attempts" = 1, "last_delivery_attempt_at" = "updated_at"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" DROP COLUMN "last_delivery_attempt_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" DROP COLUMN "delivery_attempts"`,
    );
  }
}
