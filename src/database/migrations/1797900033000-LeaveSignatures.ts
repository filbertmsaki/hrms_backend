import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Authenticated electronic signing of leave applications (employee) and
 * approval decisions (approvers). An HRMS-recorded e-signature: the signer's
 * authenticated session, explicit confirmation, timestamp and a hash of the
 * signed application content. Not a certificate-based PDF signature.
 */
export class LeaveSignatures1797900033000 implements MigrationInterface {
  name = 'LeaveSignatures1797900033000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "leave_signatures" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "leave_request_id" integer NOT NULL,
        "leave_request_approval_id" integer,
        "signer_role" character varying(20) NOT NULL,
        "signer_company_user_id" integer NOT NULL,
        "signer_employee_id" integer,
        "signer_name" character varying(200) NOT NULL,
        "decision" character varying(30),
        "method" character varying(60) NOT NULL,
        "document_hash" character varying(64) NOT NULL,
        "approval_cycle" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'valid',
        "audit_reference" character varying(20) NOT NULL,
        "signed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "superseded_at" TIMESTAMP WITH TIME ZONE,
        "ip_address" character varying(64),
        "user_agent" character varying(300),
        CONSTRAINT "PK_leave_signatures" PRIMARY KEY ("id")
      )`);
    await q.query(
      `CREATE INDEX "IDX_leave_signature_request" ON "leave_signatures" ("leave_request_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_signature_reference" ON "leave_signatures" ("audit_reference")`,
    );
    // One valid employee signature per request; one signature per approval row.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_signature_employee_valid" ON "leave_signatures" ("leave_request_id") WHERE "signer_role" = 'EMPLOYEE' AND "status" = 'valid'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_signature_approval" ON "leave_signatures" ("leave_request_approval_id") WHERE "leave_request_approval_id" IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "leave_signatures"`);
  }
}
