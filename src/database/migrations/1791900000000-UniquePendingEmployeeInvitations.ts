import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniquePendingEmployeeInvitations1791900000000 implements MigrationInterface {
  name = 'UniquePendingEmployeeInvitations1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pending invitations past their expiry are already unusable.
    await queryRunner.query(`
      UPDATE "employee_invitations"
         SET "status" = 'expired', "updated_at" = now()
       WHERE "status" = 'pending' AND "expires_at" <= now()
    `);

    // Normalise emails so the unique index matches the app's lower-case rule.
    await queryRunner.query(`
      UPDATE "employee_invitations"
         SET "email" = LOWER(TRIM("email"))
       WHERE "email" <> LOWER(TRIM("email"))
    `);

    // Keep only the newest pending invitation per recipient; cancel the rest.
    for (const column of ['email', 'phone']) {
      await queryRunner.query(`
        UPDATE "employee_invitations" AS "invitation"
           SET "status" = 'cancelled', "updated_at" = now()
          FROM (
            SELECT "id",
                   ROW_NUMBER() OVER (
                     PARTITION BY "company_id", "${column}"
                     ORDER BY "created_at" DESC, "id" DESC
                   ) AS "rank"
              FROM "employee_invitations"
             WHERE "status" = 'pending'
          ) AS "ranked"
         WHERE "invitation"."id" = "ranked"."id" AND "ranked"."rank" > 1
      `);
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_employee_invitation_pending_email" ON "employee_invitations" ("company_id", "email") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_employee_invitation_pending_phone" ON "employee_invitations" ("company_id", "phone") WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_employee_invitation_pending_phone"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_employee_invitation_pending_email"`,
    );
    // Expired/cancelled duplicates are not restored to pending.
  }
}
