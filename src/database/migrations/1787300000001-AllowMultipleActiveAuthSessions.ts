import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowMultipleActiveAuthSessions1787300000001 implements MigrationInterface {
  name = 'AllowMultipleActiveAuthSessions1787300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_auth_sessions_one_active_per_user"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked_sessions AS (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "user_id"
            ORDER BY "last_activity_at" DESC, "created_at" DESC, "id" DESC
          ) AS rn
        FROM "auth_sessions"
        WHERE "revoked_at" IS NULL
      )
      UPDATE "auth_sessions"
      SET "revoked_at" = CURRENT_TIMESTAMP,
          "revocation_reason" = 'SESSION_REPLACED'
      WHERE "id" IN (SELECT "id" FROM ranked_sessions WHERE rn > 1)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_auth_sessions_one_active_per_user"
      ON "auth_sessions" ("user_id")
      WHERE "revoked_at" IS NULL
    `);
  }
}
