import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceCheckpointQrTokenUses1792400000000
  implements MigrationInterface
{
  name = 'AddAttendanceCheckpointQrTokenUses1792400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_punches" ADD "qr_validation_result" jsonb`,
    );
    await queryRunner.query(
      `CREATE TABLE "attendance_checkpoint_qr_token_uses" ("id" SERIAL NOT NULL, "company_id" integer NOT NULL, "checkpoint_id" integer NOT NULL, "employee_id" integer NOT NULL, "token_nonce_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_attendance_checkpoint_qr_token_uses_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_attendance_checkpoint_qr_token_use" ON "attendance_checkpoint_qr_token_uses" ("company_id", "checkpoint_id", "token_nonce_hash", "employee_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attendance_checkpoint_qr_token_uses_expires_at" ON "attendance_checkpoint_qr_token_uses" ("expires_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_checkpoint_qr_token_uses" ADD CONSTRAINT "FK_attendance_checkpoint_qr_token_use_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_checkpoint_qr_token_uses" ADD CONSTRAINT "FK_attendance_checkpoint_qr_token_use_checkpoint" FOREIGN KEY ("checkpoint_id") REFERENCES "attendance_checkpoints"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_checkpoint_qr_token_uses" ADD CONSTRAINT "FK_attendance_checkpoint_qr_token_use_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_checkpoint_qr_token_uses" DROP CONSTRAINT "FK_attendance_checkpoint_qr_token_use_employee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_checkpoint_qr_token_uses" DROP CONSTRAINT "FK_attendance_checkpoint_qr_token_use_checkpoint"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_checkpoint_qr_token_uses" DROP CONSTRAINT "FK_attendance_checkpoint_qr_token_use_company"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_attendance_checkpoint_qr_token_uses_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_attendance_checkpoint_qr_token_use"`,
    );
    await queryRunner.query(`DROP TABLE "attendance_checkpoint_qr_token_uses"`);
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_punches" DROP COLUMN "qr_validation_result"`,
    );
  }
}
