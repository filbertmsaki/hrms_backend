import { MigrationInterface, QueryRunner } from 'typeorm';

/** Verification codes HR revoked on leave PDFs (see LeaveVerificationRevocation). */
export class LeaveVerificationRevocations1797900022000 implements MigrationInterface {
  name = 'LeaveVerificationRevocations1797900022000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "leave_verification_revocations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "leave_request_id" integer NOT NULL,
        "token" character varying(64) NOT NULL,
        "reason" text NOT NULL,
        "revoked_by_user_id" integer,
        "revoked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_5b85debe10f1f2e61714e40212b" PRIMARY KEY ("id"),
        CONSTRAINT "FK_7b842b51d5d5d8be582e53da703" FOREIGN KEY ("leave_request_id")
          REFERENCES "leave_requests"("id") ON DELETE CASCADE
      )`);
    await q.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_verification_revocation_token" ON "leave_verification_revocations" ("token")',
    );
    await q.query(
      'CREATE INDEX IF NOT EXISTS "IDX_leave_verification_revocation_request" ON "leave_verification_revocations" ("leave_request_id")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS "leave_verification_revocations"');
  }
}
