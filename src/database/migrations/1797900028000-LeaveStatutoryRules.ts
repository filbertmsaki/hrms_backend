import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Leave policy engine, part 4: jurisdiction statutory rules.
 * - Rule sets per company and jurisdiction (TZ-MAINLAND, TZ-ZANZIBAR, …),
 *   versioned and effective-dated, with legal references and a recorded
 *   legal verification before activation.
 * - Rules per type: annual, sick (pay stages), maternity, paternity,
 *   public holiday work and termination settlement.
 * - Jurisdiction per branch (company default otherwise).
 * - Leave requests record the life-event date (birth) and the statutory pay
 *   breakdown applied (e.g. sick leave full/half pay days).
 * - A PUBLIC_HOLIDAY_WORK payroll component, held back until Finance
 *   confirms it, for statutory public-holiday work pay.
 * No statutory values are activated by this migration.
 */
export class LeaveStatutoryRules1797900028000 implements MigrationInterface {
  name = 'LeaveStatutoryRules1797900028000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "leave_statutory_rule_sets" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "jurisdiction_code" character varying(32) NOT NULL,
        "name" character varying(160) NOT NULL,
        "version_no" integer NOT NULL DEFAULT 1,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "effective_from" date,
        "effective_to" date,
        "legal_authority" text,
        "legal_references" jsonb NOT NULL DEFAULT '[]',
        "verification_status" character varying(20) NOT NULL DEFAULT 'unverified',
        "verified_by_company_user_id" integer,
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "verification_notes" text,
        "is_test_configuration" boolean NOT NULL DEFAULT false,
        "supersedes_rule_set_id" integer,
        "change_reason" text,
        "created_by_company_user_id" integer,
        "approved_by_company_user_id" integer,
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_statutory_rule_sets" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_leave_statutory_set_status" CHECK ("status" IN ('draft','pending_approval','active','superseded','archived')),
        CONSTRAINT "CHK_leave_statutory_set_verification" CHECK ("verification_status" IN ('unverified','verified','rejected')),
        CONSTRAINT "CHK_leave_statutory_set_range" CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "UQ_leave_statutory_set_version" UNIQUE ("company_id", "jurisdiction_code", "version_no"),
        CONSTRAINT "FK_leave_statutory_set_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "leave_statutory_rules" (
        "id" SERIAL NOT NULL,
        "rule_set_id" integer NOT NULL,
        "rule_type" character varying(32) NOT NULL,
        "leave_type_id" integer,
        "settings" jsonb NOT NULL DEFAULT '{}',
        "legal_reference" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_statutory_rules" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_leave_statutory_rule_type" CHECK ("rule_type" IN ('annual_leave','sick_leave','maternity_leave','paternity_leave','public_holiday','termination_settlement')),
        CONSTRAINT "UQ_leave_statutory_rule" UNIQUE ("rule_set_id", "rule_type"),
        CONSTRAINT "FK_leave_statutory_rule_set" FOREIGN KEY ("rule_set_id") REFERENCES "leave_statutory_rule_sets"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "leave_statutory_company_settings" (
        "company_id" integer NOT NULL,
        "default_jurisdiction_code" character varying(32),
        "updated_by_company_user_id" integer,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_statutory_company_settings" PRIMARY KEY ("company_id"),
        CONSTRAINT "FK_leave_statutory_settings_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "statutory_jurisdiction_code" character varying(32)`,
    );
    await q.query(`
      ALTER TABLE "leave_requests"
        ADD COLUMN IF NOT EXISTS "event_date" date,
        ADD COLUMN IF NOT EXISTS "pay_breakdown" jsonb
    `);
    await q.query(`
      INSERT INTO "payroll_components" (
        "company_id", "code", "name", "component_type", "frequency",
        "calculation_method", "tax_treatment", "taxable_percentage",
        "pensionable", "health_insurance_applicable", "included_in_gross",
        "included_in_net", "included_in_employer_cost", "subject_to_proration",
        "allow_manual_input", "allow_negative_amount", "calculation_order",
        "calculation_configuration", "is_system_component", "status", "version"
      )
      SELECT DISTINCT pc."company_id", 'PUBLIC_HOLIDAY_WORK', 'Public holiday work pay',
        'EARNING'::"payroll_component_type_enum",
        'ONE_TIME'::"payroll_component_frequency_enum",
        'EXTERNAL_INPUT'::"payroll_calculation_method_enum",
        'TAXABLE'::"payroll_tax_treatment_enum", 100,
        false, false, true, true, true, false, true, false, 45,
        '{"finance_verified": false}'::jsonb, false, 'INACTIVE', 1
      FROM "payroll_components" pc
      WHERE NOT EXISTS (
        SELECT 1 FROM "payroll_components" x
        WHERE x."company_id" = pc."company_id" AND x."code" = 'PUBLIC_HOLIDAY_WORK'
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM "payroll_components" c
      WHERE c."code" = 'PUBLIC_HOLIDAY_WORK'
        AND NOT EXISTS (
          SELECT 1 FROM "payroll_inputs" i
          WHERE i."company_id" = c."company_id" AND i."component_code" = 'PUBLIC_HOLIDAY_WORK'
        )
    `);
    await q.query(`
      ALTER TABLE "leave_requests"
        DROP COLUMN IF EXISTS "pay_breakdown",
        DROP COLUMN IF EXISTS "event_date"
    `);
    await q.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "statutory_jurisdiction_code"`,
    );
    await q.query(`DROP TABLE IF EXISTS "leave_statutory_company_settings"`);
    await q.query(`DROP TABLE IF EXISTS "leave_statutory_rules"`);
    await q.query(`DROP TABLE IF EXISTS "leave_statutory_rule_sets"`);
  }
}
