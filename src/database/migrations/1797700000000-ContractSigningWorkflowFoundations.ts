import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

/**
 * Employment contracts phase 1: signing lifecycle foundations.
 *
 * - Contract preparation/snapshot columns, reference numbers, document
 *   pointers per signing stage, cancellation fields.
 * - Status column widened; legacy ISSUED rows move to the new lifecycle
 *   (with a document -> PENDING_EMPLOYEE_SIGNATURE, otherwise DRAFT).
 * - Authorized company signatories, per-act signature records and email OTP
 *   signing challenges.
 * - Permissions: contract_signatories:manage (HR admins) and
 *   employment_contracts:self (every role that has employee self-service).
 *
 * File hashes for legacy documents are not computed here (SQL cannot read
 * storage); they are filled lazily the first time a file is served.
 */
const PERMISSIONS = [
  {
    name: 'contract_signatories:manage',
    displayName: 'Manage company contract signatories',
    description:
      'Allow designating and revoking employees authorized to sign employment contracts on behalf of the company',
  },
  {
    name: 'employment_contracts:self',
    displayName: 'View and sign own employment contracts',
    description:
      'Allow employees to view, download and sign their own employment contracts',
  },
];

const SIGNATORY_GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: ['contract_signatories:manage'],
  HR_MANAGER: ['contract_signatories:manage'],
};

export class ContractSigningWorkflowFoundations1797700000000 implements MigrationInterface {
  name = 'ContractSigningWorkflowFoundations1797700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "contract_signatories" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "display_name" varchar(200) NOT NULL,
        "job_title" varchar(200) NOT NULL,
        "scope_note" varchar(300),
        "is_active" boolean NOT NULL DEFAULT true,
        "designated_by_company_user_id" integer NOT NULL,
        "designated_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_by_company_user_id" integer,
        "revoked_at" timestamptz,
        "revoke_reason" varchar(500),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_contract_signatory_employee" UNIQUE ("company_id", "employee_id")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ALTER COLUMN "status" TYPE varchar(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`
      ALTER TABLE "employment_contracts"
        ADD COLUMN "reference_no" varchar(40),
        ADD COLUMN "title" varchar(180) NOT NULL DEFAULT 'Contract of Employment',
        ADD COLUMN "job_title" varchar(200),
        ADD COLUMN "department_name" varchar(200),
        ADD COLUMN "work_location" varchar(300),
        ADD COLUMN "reporting_manager_name" varchar(200),
        ADD COLUMN "probation_months" smallint,
        ADD COLUMN "hours_of_work" varchar(300),
        ADD COLUMN "salary_amount" numeric(14,2),
        ADD COLUMN "salary_currency" varchar(3),
        ADD COLUMN "pay_frequency" varchar(20),
        ADD COLUMN "benefits" text,
        ADD COLUMN "template_id" integer,
        ADD COLUMN "template_version" integer,
        ADD COLUMN "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "assigned_signatory_id" integer REFERENCES "contract_signatories"("id") ON DELETE SET NULL,
        ADD COLUMN "base_document_id" integer REFERENCES "documents"("id"),
        ADD COLUMN "base_document_sha256" varchar(64),
        ADD COLUMN "company_signed_document_id" integer REFERENCES "documents"("id"),
        ADD COLUMN "company_signed_sha256" varchar(64),
        ADD COLUMN "final_document_id" integer REFERENCES "documents"("id"),
        ADD COLUMN "final_sha256" varchar(64),
        ADD COLUMN "pending_upload_document_id" integer REFERENCES "documents"("id"),
        ADD COLUMN "sent_at" timestamptz,
        ADD COLUMN "completed_at" timestamptz,
        ADD COLUMN "cancelled_at" timestamptz,
        ADD COLUMN "cancelled_by_company_user_id" integer,
        ADD COLUMN "cancel_reason" varchar(500),
        ADD COLUMN "last_rejection_reason" varchar(500),
        ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now()
    `);

    // Backfill references and lifecycle for existing contracts.
    await queryRunner.query(`
      UPDATE "employment_contracts"
      SET "reference_no" = 'EC-' || to_char("created_at", 'YYYY') || '-' || lpad("id"::text, 5, '0')
      WHERE "reference_no" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ALTER COLUMN "reference_no" SET NOT NULL, ALTER COLUMN "reference_no" SET DEFAULT ('TMP-' || gen_random_uuid()::text)`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_employment_contract_reference"
        ON "employment_contracts" ("company_id", "reference_no")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employment_contract_company_status"
        ON "employment_contracts" ("company_id", "status")
    `);
    await queryRunner.query(`
      UPDATE "employment_contracts"
      SET "status" = 'PENDING_EMPLOYEE_SIGNATURE',
          "company_signed_document_id" = "document_id",
          "sent_at" = "created_at"
      WHERE "status" = 'ISSUED' AND "document_id" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "employment_contracts" SET "status" = 'DRAFT'
      WHERE "status" = 'ISSUED' AND "document_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "employment_contracts"
      SET "final_document_id" = "document_id",
          "company_signed_document_id" = "document_id",
          "completed_at" = "signed_at",
          "sent_at" = "created_at"
      WHERE "status" = 'SIGNED'
    `);
    await queryRunner.query(`
      CREATE TABLE "contract_signatures" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "contract_id" integer NOT NULL REFERENCES "employment_contracts"("id") ON DELETE CASCADE,
        "contract_version" integer NOT NULL,
        "party" varchar(20) NOT NULL CHECK ("party" IN ('COMPANY','EMPLOYEE')),
        "method" varchar(20) NOT NULL CHECK ("method" IN ('DIGITAL_TYPED','DIGITAL_DRAWN','MANUAL_UPLOAD','LEGACY')),
        "verification_method" varchar(20) NOT NULL CHECK ("verification_method" IN ('TOTP','EMAIL_OTP','HR_VERIFIED','PENDING','NONE_LEGACY')),
        "signer_user_id" integer,
        "signer_company_user_id" integer,
        "signer_employee_id" integer,
        "signatory_id" integer REFERENCES "contract_signatories"("id") ON DELETE SET NULL,
        "signer_name" varchar(200) NOT NULL,
        "signer_title" varchar(200),
        "attested_by_company_user_id" integer,
        "signature_image_document_id" integer REFERENCES "documents"("id") ON DELETE SET NULL,
        "signed_document_sha256" varchar(64),
        "result_document_id" integer REFERENCES "documents"("id") ON DELETE SET NULL,
        "result_sha256" varchar(64),
        "ip" varchar(64),
        "user_agent" varchar(300),
        "signed_at" timestamptz NOT NULL DEFAULT now(),
        "verification_outcome" varchar(20) CHECK ("verification_outcome" IN ('ACCEPTED','REJECTED')),
        "verified_by_company_user_id" integer,
        "verified_at" timestamptz,
        "rejection_reason" varchar(500)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_contract_signature_contract" ON "contract_signatures" ("contract_id")`,
    );
    // Record the legacy employee signatures so every SIGNED contract has a signature row.
    await queryRunner.query(`
      INSERT INTO "contract_signatures"
        ("company_id","contract_id","contract_version","party","method","verification_method",
         "signer_user_id","signer_employee_id","signer_name","ip","signed_at","result_document_id")
      SELECT "company_id","id","version",'EMPLOYEE','LEGACY','NONE_LEGACY',
             "signed_by_user_id","employee_id","signed_name","signed_ip","signed_at","document_id"
      FROM "employment_contracts"
      WHERE "signed_at" IS NOT NULL AND "signed_name" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "contract_signing_challenges" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "contract_id" integer NOT NULL REFERENCES "employment_contracts"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "party" varchar(20) NOT NULL CHECK ("party" IN ('COMPANY','EMPLOYEE')),
        "code_hash" varchar(128) NOT NULL,
        "document_sha256" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "attempts" smallint NOT NULL DEFAULT 0,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_contract_signing_challenge_lookup"
        ON "contract_signing_challenges" ("contract_id", "user_id")
    `);

    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, SIGNATORY_GRANTS);
    // Every role that already has employee self-service onboarding access
    // gets self contract access (replaces the onboarding_requests:read proxy).
    await queryRunner.query(`
      INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT DISTINCT existing."rolesId", self_permission."id"
      FROM "permission_role" existing
      JOIN "permissions" onboarding ON onboarding."id" = existing."permissionsId"
        AND onboarding."name" = 'onboarding_requests:read'
      CROSS JOIN "permissions" self_permission
      WHERE self_permission."name" = 'employment_contracts:self'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(queryRunner, SIGNATORY_GRANTS);
    await removePermissions(
      queryRunner,
      PERMISSIONS.map((permission) => permission.name),
    );
    await queryRunner.query(`DROP TABLE "contract_signing_challenges"`);
    await queryRunner.query(`DROP TABLE "contract_signatures"`);
    // Map the new lifecycle back onto the legacy statuses.
    await queryRunner.query(`
      UPDATE "employment_contracts" SET "status" = CASE
        WHEN "status" IN ('SIGNED','SUPERSEDED') THEN "status"
        WHEN "status" = 'CANCELLED' THEN 'SUPERSEDED'
        ELSE 'ISSUED' END
    `);
    await queryRunner.query(`DROP INDEX "IDX_employment_contract_company_status"`);
    await queryRunner.query(`DROP INDEX "UQ_employment_contract_reference"`);
    await queryRunner.query(`
      ALTER TABLE "employment_contracts"
        DROP COLUMN "reference_no", DROP COLUMN "title", DROP COLUMN "job_title",
        DROP COLUMN "department_name", DROP COLUMN "work_location",
        DROP COLUMN "reporting_manager_name", DROP COLUMN "probation_months",
        DROP COLUMN "hours_of_work", DROP COLUMN "salary_amount",
        DROP COLUMN "salary_currency", DROP COLUMN "pay_frequency",
        DROP COLUMN "benefits", DROP COLUMN "template_id",
        DROP COLUMN "template_version", DROP COLUMN "sections",
        DROP COLUMN "assigned_signatory_id", DROP COLUMN "base_document_id",
        DROP COLUMN "base_document_sha256", DROP COLUMN "company_signed_document_id",
        DROP COLUMN "company_signed_sha256", DROP COLUMN "final_document_id",
        DROP COLUMN "final_sha256", DROP COLUMN "pending_upload_document_id",
        DROP COLUMN "sent_at", DROP COLUMN "completed_at", DROP COLUMN "cancelled_at",
        DROP COLUMN "cancelled_by_company_user_id", DROP COLUMN "cancel_reason",
        DROP COLUMN "last_rejection_reason", DROP COLUMN "updated_at"
    `);
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ALTER COLUMN "status" SET DEFAULT 'ISSUED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ALTER COLUMN "status" TYPE varchar(20)`,
    );
    await queryRunner.query(`DROP TABLE "contract_signatories"`);
  }
}
