import { MigrationInterface, QueryRunner } from 'typeorm';

export class VerifyAcceptedEmployeeInvitationUsers1790600000000 implements MigrationInterface {
  name = 'VerifyAcceptedEmployeeInvitationUsers1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" AS "user"
      SET
        "is_email_verified" = true,
        "email_verification_token" = NULL,
        "email_verification_expires" = NULL,
        "updated_at" = now()
      FROM "company_users" AS "membership"
      INNER JOIN "employees" AS "employee"
        ON "employee"."company_user_id" = "membership"."id"
      INNER JOIN "employee_invitations" AS "invitation"
        ON "invitation"."accepted_employee_id" = "employee"."id"
      WHERE "membership"."user_id" = "user"."id"
        AND "invitation"."status" = 'accepted'
        AND LOWER("invitation"."email") = LOWER("user"."email")
        AND "user"."is_email_verified" = false
    `);
  }

  public async down(): Promise<void> {
    // Verification cannot be safely reversed because the prior state is unknown.
  }
}
