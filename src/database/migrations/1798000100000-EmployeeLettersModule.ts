import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employee Letters module: templates (versioned), letters with an approval /
 * issue state machine, per-company yearly reference numbers and an event
 * trail. Probation letter templates are copied in as the company defaults for
 * the three probation letter types; the probation table is kept for rollback.
 */
export class EmployeeLettersModule1798000100000 implements MigrationInterface {
  name = 'EmployeeLettersModule1798000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "letter_templates" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "letter_type" varchar(40) NOT NULL,
        "name" varchar(160) NOT NULL,
        "subject" varchar(240) NOT NULL,
        "salutation" varchar(120) NOT NULL DEFAULT 'Dear {{employee_first_name}},',
        "body" text NOT NULL,
        "closing" varchar(160) NOT NULL DEFAULT 'Yours sincerely,',
        "signatory_id" integer NULL REFERENCES "contract_signatories"("id") ON DELETE SET NULL,
        "signatory_name" varchar(160) NULL,
        "signatory_title" varchar(160) NULL,
        "requires_approval" boolean NOT NULL DEFAULT false,
        "include_acknowledgement" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_default" boolean NOT NULL DEFAULT false,
        "current_version" integer NOT NULL DEFAULT 1,
        "created_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "updated_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_letter_templates_company_type" ON "letter_templates" ("company_id", "letter_type")',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_letter_templates_default" ON "letter_templates" ("company_id", "letter_type")
       WHERE "is_default" AND "deleted_at" IS NULL AND "is_active"`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "letter_template_versions" (
        "id" SERIAL PRIMARY KEY,
        "template_id" integer NOT NULL REFERENCES "letter_templates"("id") ON DELETE CASCADE,
        "version" integer NOT NULL,
        "snapshot" jsonb NOT NULL,
        "created_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_letter_template_versions" UNIQUE ("template_id", "version")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "letter_reference_sequences" (
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "year" integer NOT NULL,
        "next_value" integer NOT NULL DEFAULT 1,
        PRIMARY KEY ("company_id", "year")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_letters" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "reference_no" varchar(40) NOT NULL,
        "letter_type" varchar(40) NOT NULL,
        "template_id" integer NULL REFERENCES "letter_templates"("id") ON DELETE SET NULL,
        "template_version" integer NULL,
        "employee_id" integer NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "candidate_id" integer NULL REFERENCES "recruitment_candidates"("id") ON DELETE CASCADE,
        "recipient_name" varchar(200) NOT NULL,
        "recipient_address" text NULL,
        "subject" varchar(240) NOT NULL,
        "salutation" varchar(120) NOT NULL DEFAULT '',
        "body" text NOT NULL,
        "closing" varchar(160) NOT NULL DEFAULT '',
        "extra_values" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "values" jsonb NULL,
        "signatory_name" varchar(160) NULL,
        "signatory_title" varchar(160) NULL,
        "requires_approval" boolean NOT NULL DEFAULT false,
        "include_acknowledgement" boolean NOT NULL DEFAULT false,
        "status" varchar(24) NOT NULL DEFAULT 'DRAFT',
        "submitted_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "submitted_at" timestamptz NULL,
        "approved_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "approved_at" timestamptz NULL,
        "rejected_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "rejected_at" timestamptz NULL,
        "rejection_reason" text NULL,
        "issued_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "issued_at" timestamptz NULL,
        "cancelled_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "cancelled_at" timestamptz NULL,
        "cancellation_reason" text NULL,
        "revision_of_letter_id" integer NULL REFERENCES "employee_letters"("id") ON DELETE SET NULL,
        "superseded_by_letter_id" integer NULL REFERENCES "employee_letters"("id") ON DELETE SET NULL,
        "document_id" integer NULL REFERENCES "documents"("id") ON DELETE SET NULL,
        "verification_token" varchar(64) NULL UNIQUE,
        "verification_revoked_at" timestamptz NULL,
        "emailed_at" timestamptz NULL,
        "created_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employee_letters_reference" UNIQUE ("company_id", "reference_no"),
        CONSTRAINT "CHK_employee_letters_status"
          CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ISSUED', 'CANCELLED', 'SUPERSEDED')),
        CONSTRAINT "CHK_employee_letters_recipient"
          CHECK (("employee_id" IS NOT NULL) <> ("candidate_id" IS NOT NULL))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_employee_letters_status" ON "employee_letters" ("company_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_employee_letters_employee" ON "employee_letters" ("company_id", "employee_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_employee_letters_type" ON "employee_letters" ("company_id", "letter_type")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_letter_events" (
        "id" SERIAL PRIMARY KEY,
        "letter_id" integer NOT NULL REFERENCES "employee_letters"("id") ON DELETE CASCADE,
        "action" varchar(30) NOT NULL,
        "actor_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "note" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_employee_letter_events_letter" ON "employee_letter_events" ("letter_id", "created_at")',
    );

    await queryRunner.query(`INSERT INTO permissions (name, display_name, description, scope, is_system_generated) VALUES
      ('employee_letters:read','View employee letters','View employee letters, templates and their history','company',true),
      ('employee_letters:create','Prepare employee letters','Draft, edit, submit and revise employee letters','company',true),
      ('employee_letters:approve','Approve employee letters','Approve or reject employee letters awaiting approval','company',true),
      ('employee_letters:issue','Issue employee letters','Issue approved employee letters (final PDF, QR code, email)','company',true),
      ('employee_letters:cancel','Cancel employee letters','Cancel employee letters and revoke their verification','company',true),
      ('letter_templates:manage','Manage letter templates','Create, edit and version company letter templates','company',true)
      ON CONFLICT (name) DO NOTHING`);
    await queryRunner.query(`INSERT INTO permission_role ("rolesId","permissionsId")
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
       WHERE r.company_id IS NOT NULL AND r.is_system_generated AND (
         (r.name IN ('COMPANY_ADMIN','HR_MANAGER') AND p.name IN (
           'employee_letters:read','employee_letters:create','employee_letters:approve',
           'employee_letters:issue','employee_letters:cancel','letter_templates:manage'))
         OR (r.name = 'HR_OFFICER' AND p.name IN ('employee_letters:read','employee_letters:create')))
      ON CONFLICT DO NOTHING`);

    // Probation templates become the company defaults for the probation types.
    // Their {{snake_case}} keys already match the new catalogue.
    const probationTable = (await queryRunner.query(
      `SELECT to_regclass('public.probation_letter_templates') AS t`,
    )) as Array<{ t: string | null }>;
    if (probationTable[0]?.t) {
      await queryRunner.query(`
        INSERT INTO "letter_templates" (
          "company_id", "letter_type", "name", "subject", "salutation", "body", "closing",
          "signatory_name", "signatory_title", "requires_approval", "include_acknowledgement",
          "is_active", "is_default", "current_version", "updated_by_company_user_id", "created_at", "updated_at")
        SELECT p.company_id, m.new_type, m.name, m.subject, '', p.body, 'Yours sincerely,',
               p.signatory_name, p.signatory_title, m.needs_approval, false,
               true, true, 1,
               (SELECT cu.id FROM company_users cu WHERE cu.id = p.updated_by_company_user_id),
               now(), now()
          FROM "probation_letter_templates" p
          JOIN (VALUES
            ('CONFIRMATION', 'CONFIRMATION', 'Employment confirmation letter (from probation)', 'Confirmation of employment', false),
            ('EXTENSION', 'PROBATION_EXTENSION', 'Probation extension letter (from probation)', 'Extension of probation period', false),
            ('NOT_CONFIRMED', 'PROBATION_NOT_CONFIRMED', 'Probation outcome letter (from probation)', 'Outcome of probation period', true)
          ) AS m(old_type, new_type, name, subject, needs_approval) ON m.old_type = p.letter_type
         WHERE NOT EXISTS (
           SELECT 1 FROM "letter_templates" t
            WHERE t.company_id = p.company_id AND t.letter_type = m.new_type
              AND t.is_default AND t.is_active AND t.deleted_at IS NULL)
      `);
      await queryRunner.query(`
        INSERT INTO "letter_template_versions" ("template_id", "version", "snapshot", "created_by_company_user_id")
        SELECT t.id, 1, jsonb_build_object(
                 'name', t.name, 'subject', t.subject, 'salutation', t.salutation, 'body', t.body,
                 'closing', t.closing, 'signatory_id', t.signatory_id, 'signatory_name', t.signatory_name,
                 'signatory_title', t.signatory_title, 'requires_approval', t.requires_approval,
                 'include_acknowledgement', t.include_acknowledgement),
               t.updated_by_company_user_id
          FROM "letter_templates" t
         WHERE NOT EXISTS (SELECT 1 FROM "letter_template_versions" v WHERE v.template_id = t.id)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ids = `SELECT id FROM permissions WHERE name IN ('employee_letters:read','employee_letters:create','employee_letters:approve','employee_letters:issue','employee_letters:cancel','letter_templates:manage')`;
    await queryRunner.query(
      `DELETE FROM permission_role WHERE "permissionsId" IN (${ids})`,
    );
    await queryRunner.query(
      `DELETE FROM permission_user WHERE "permissionsId" IN (${ids})`,
    );
    await queryRunner.query(
      `DELETE FROM company_user_permissions WHERE permission_id IN (${ids})`,
    );
    await queryRunner.query(`DELETE FROM permissions WHERE id IN (${ids})`);
    await queryRunner.query('DROP TABLE IF EXISTS "employee_letter_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "employee_letters"');
    await queryRunner.query(
      'DROP TABLE IF EXISTS "letter_reference_sequences"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "letter_template_versions"');
    await queryRunner.query('DROP TABLE IF EXISTS "letter_templates"');
  }
}
