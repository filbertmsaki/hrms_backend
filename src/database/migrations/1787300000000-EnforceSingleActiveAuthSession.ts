import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceSingleActiveAuthSession1787300000000 implements MigrationInterface {
  name = 'EnforceSingleActiveAuthSession1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Before the unique index can be created, collapse any pre-existing
    // accounts that already have more than one non-revoked session (nothing
    // enforced this before) down to just their most recently active one.
    // Nothing is deleted - the losing rows are soft-revoked exactly like a
    // normal session replacement, preserving them for history/auditing.
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_auth_sessions_one_active_per_user"
    `);
  }
}
