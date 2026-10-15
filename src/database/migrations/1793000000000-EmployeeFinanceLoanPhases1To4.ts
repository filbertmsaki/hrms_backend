import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
} from '../migration-helpers/role-permission-grants';

const NEW_PERMISSIONS = [
  {
    name: 'employee_finance:applications:management-approve',
    displayName: 'Management approve employee finance applications',
    description:
      'Allow management to approve staff loan and salary advance applications above configured thresholds',
  },
  {
    name: 'employee_finance:delegations',
    displayName: 'Delegate employee finance approvals',
    description:
      'Allow approvers to delegate their staff loan approvals while absent',
  },
  {
    name: 'employee_finance:templates',
    displayName: 'Manage employee finance letter templates',
    description: 'Allow editing staff loan sanction letter templates',
  },
  {
    name: 'employee_finance:adjustments',
    displayName: 'Request employee finance adjustments',
    description:
      'Allow requesting staff loan penalties, waivers, and write-offs',
  },
  {
    name: 'employee_finance:adjustments:approve',
    displayName: 'Approve employee finance adjustments',
    description:
      'Allow approving staff loan penalties, waivers, and write-offs',
  },
  {
    name: 'employee_finance:settlements:approve',
    displayName: 'Approve employee finance servicing requests',
    description:
      'Allow approving staff loan deferments, reschedules, and early settlements',
  },
];

// FRS 12.1: employees apply through the portal, managers recommend, HR
// approves. Until now only COMPANY_ADMIN held these, so the self-service
// and review stages were unreachable for ordinary roles.
const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: NEW_PERMISSIONS.map((permission) => permission.name),
  EMPLOYEE: ['employee_finance:applications:self'],
  DEPARTMENT_MANAGER: [
    'employee_finance:applications:self',
    'employee_finance:applications:manager-review',
    'employee_finance:delegations',
  ],
  BRANCH_MANAGER: [
    'employee_finance:applications:self',
    'employee_finance:applications:manager-review',
    'employee_finance:delegations',
  ],
  HR_OFFICER: [
    'employee_finance:applications:self',
    'employee_finance:applications:read',
  ],
  HR_MANAGER: [
    'employee_finance:applications:self',
    'employee_finance:applications:read',
    'employee_finance:applications:hr-approve',
    'employee_finance:products:read',
    'employee_finance:delegations',
    'employee_finance:templates',
  ],
};

export class EmployeeFinanceLoanPhases1To41793000000000 implements MigrationInterface {
  name = 'EmployeeFinanceLoanPhases1To41793000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."employee_finance_application_status_enum" ADD VALUE IF NOT EXISTS 'PENDING_MANAGEMENT_APPROVAL' AFTER 'PENDING_FINANCE_APPROVAL'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."employee_finance_approval_stage_enum" ADD VALUE IF NOT EXISTS 'MANAGEMENT' AFTER 'FINANCE'`,
    );

    // Phase 1: product versioning.
    await queryRunner.query(`
      ALTER TABLE "employee_finance_products"
        ADD COLUMN "version_number" integer NOT NULL DEFAULT 1,
        ADD COLUMN "parent_product_id" integer
    `);
    await queryRunner.query(
      `ALTER TABLE "employee_finance_products" DROP CONSTRAINT "UQ_employee_finance_product_company_code"`,
    );
    await queryRunner.query(`
      ALTER TABLE "employee_finance_products"
        ADD CONSTRAINT "UQ_employee_finance_product_company_code_version"
        UNIQUE ("company_id", "code", "version_number")
    `);

    // Phase 1: sanction letter templates.
    await queryRunner.query(`
      CREATE TABLE "employee_finance_letter_templates" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "template_type" character varying(40) NOT NULL,
        "name" character varying(180) NOT NULL,
        "letterhead" text NOT NULL,
        "body" text NOT NULL,
        "signatory_name" character varying(180) NOT NULL,
        "signatory_title" character varying(180) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "updated_by_company_user_id" integer,
        "version" integer NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employee_finance_letter_template_type" UNIQUE ("company_id", "template_type"),
        CONSTRAINT "PK_employee_finance_letter_templates" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_sanction_letters"
        ADD COLUMN "template_id" integer,
        ADD COLUMN "accepted_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "accepted_by_company_user_id" integer
    `);

    // Phase 2: approval routing, cycles, escalation.
    await queryRunner.query(`
      ALTER TABLE "employee_finance_applications"
        ADD COLUMN "approval_route" jsonb,
        ADD COLUMN "approval_cycle" integer NOT NULL DEFAULT 1,
        ADD COLUMN "stage_entered_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "last_reminded_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "escalation_level" integer NOT NULL DEFAULT 0,
        ADD COLUMN "decision_comments" text
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_application_approvals"
        ADD COLUMN "approval_cycle" integer NOT NULL DEFAULT 1,
        ADD COLUMN "on_behalf_of_company_user_id" integer
    `);
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_approvals" DROP CONSTRAINT "UQ_employee_finance_application_approval_stage"`,
    );
    await queryRunner.query(`
      ALTER TABLE "employee_finance_application_approvals"
        ADD CONSTRAINT "UQ_employee_finance_application_approval_stage_cycle"
        UNIQUE ("application_id", "stage", "approval_cycle")
    `);
    await queryRunner.query(`
      CREATE TABLE "employee_finance_approval_delegations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "delegator_company_user_id" integer NOT NULL,
        "delegate_company_user_id" integer NOT NULL,
        "stages" jsonb NOT NULL,
        "starts_on" date NOT NULL,
        "ends_on" date NOT NULL,
        "reason" text,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_finance_approval_delegations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employee_finance_delegation_delegate"
        ON "employee_finance_approval_delegations" ("company_id", "delegate_company_user_id", "status")
    `);

    // Phase 3: servicing approvals and overdue tracking.
    await queryRunner.query(`
      ALTER TABLE "employee_finance_installments"
        ADD COLUMN "original_due_date" date,
        ADD COLUMN "overdue_since" date
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_deferment_requests"
        ADD COLUMN "requested_by_company_user_id" integer,
        ADD COLUMN "decided_by_company_user_id" integer,
        ADD COLUMN "decided_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "decision_comments" text,
        ADD COLUMN "original_due_date" date,
        ADD COLUMN "new_due_date" date
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_reschedules"
        ADD COLUMN "old_term_months" integer,
        ADD COLUMN "schedule_preview" jsonb,
        ADD COLUMN "requested_by_company_user_id" integer,
        ADD COLUMN "decided_by_company_user_id" integer,
        ADD COLUMN "decided_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "decision_comments" text,
        ADD COLUMN "created_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_settlement_quotes"
        ADD COLUMN "repayment_id" integer,
        ADD COLUMN "settled_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      CREATE TABLE "employee_finance_adjustments" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "account_id" integer NOT NULL,
        "installment_id" integer,
        "adjustment_type" character varying(30) NOT NULL,
        "principal_amount" numeric(18,2) NOT NULL DEFAULT '0',
        "interest_amount" numeric(18,2) NOT NULL DEFAULT '0',
        "fee_amount" numeric(18,2) NOT NULL DEFAULT '0',
        "reason" text NOT NULL,
        "source" character varying(30) NOT NULL DEFAULT 'MANUAL',
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "idempotency_key" character varying(180) NOT NULL,
        "created_by_company_user_id" integer,
        "decided_by_company_user_id" integer,
        "decided_at" TIMESTAMP WITH TIME ZONE,
        "decision_comments" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employee_finance_adjustment_idempotency" UNIQUE ("company_id", "idempotency_key"),
        CONSTRAINT "PK_employee_finance_adjustments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employee_finance_adjustment_account"
        ON "employee_finance_adjustments" ("company_id", "account_id", "status")
    `);

    // Phase 4: shortfall resolution and exit recovery confirmation.
    await queryRunner.query(`
      ALTER TABLE "employee_finance_payroll_instructions"
        ADD COLUMN "resolution" character varying(30),
        ADD COLUMN "resolved_by_company_user_id" integer,
        ADD COLUMN "resolved_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "resolution_reference" character varying(150)
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_exit_recoveries"
        ADD COLUMN "settlement_item_id" integer,
        ADD COLUMN "recovered_at" TIMESTAMP WITH TIME ZONE
    `);

    await ensurePermissions(queryRunner, NEW_PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, GRANTS);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await removePermissions(
      queryRunner,
      NEW_PERMISSIONS.map((permission) => permission.name),
    );
    await queryRunner.query(`
      ALTER TABLE "employee_finance_exit_recoveries"
        DROP COLUMN "recovered_at",
        DROP COLUMN "settlement_item_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_payroll_instructions"
        DROP COLUMN "resolution_reference",
        DROP COLUMN "resolved_at",
        DROP COLUMN "resolved_by_company_user_id",
        DROP COLUMN "resolution"
    `);
    await queryRunner.query(`DROP TABLE "employee_finance_adjustments"`);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_settlement_quotes"
        DROP COLUMN "settled_at",
        DROP COLUMN "repayment_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_reschedules"
        DROP COLUMN "created_at",
        DROP COLUMN "decision_comments",
        DROP COLUMN "decided_at",
        DROP COLUMN "decided_by_company_user_id",
        DROP COLUMN "requested_by_company_user_id",
        DROP COLUMN "schedule_preview",
        DROP COLUMN "old_term_months"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_deferment_requests"
        DROP COLUMN "new_due_date",
        DROP COLUMN "original_due_date",
        DROP COLUMN "decision_comments",
        DROP COLUMN "decided_at",
        DROP COLUMN "decided_by_company_user_id",
        DROP COLUMN "requested_by_company_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_installments"
        DROP COLUMN "overdue_since",
        DROP COLUMN "original_due_date"
    `);
    await queryRunner.query(
      `DROP TABLE "employee_finance_approval_delegations"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_approvals" DROP CONSTRAINT "UQ_employee_finance_application_approval_stage_cycle"`,
    );
    // Keep only the latest approval cycle per stage so the old unique
    // constraint can be restored.
    await queryRunner.query(`
      DELETE FROM "employee_finance_application_approvals" older
      USING "employee_finance_application_approvals" newer
      WHERE older."application_id" = newer."application_id"
        AND older."stage" = newer."stage"
        AND older."approval_cycle" < newer."approval_cycle"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_application_approvals"
        ADD CONSTRAINT "UQ_employee_finance_application_approval_stage"
        UNIQUE ("application_id", "stage")
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_application_approvals"
        DROP COLUMN "on_behalf_of_company_user_id",
        DROP COLUMN "approval_cycle"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_applications"
        DROP COLUMN "decision_comments",
        DROP COLUMN "escalation_level",
        DROP COLUMN "last_reminded_at",
        DROP COLUMN "stage_entered_at",
        DROP COLUMN "approval_cycle",
        DROP COLUMN "approval_route"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_sanction_letters"
        DROP COLUMN "accepted_by_company_user_id",
        DROP COLUMN "accepted_at",
        DROP COLUMN "template_id"
    `);
    await queryRunner.query(`DROP TABLE "employee_finance_letter_templates"`);
    await queryRunner.query(
      `ALTER TABLE "employee_finance_products" DROP CONSTRAINT "UQ_employee_finance_product_company_code_version"`,
    );
    // Later versions keep their rows (applications reference them); give
    // them distinct codes so the original unique constraint holds.
    await queryRunner.query(`
      UPDATE "employee_finance_products"
      SET "code" = LEFT("code", 72) || '-V' || "version_number"
      WHERE "version_number" > 1
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_products"
        ADD CONSTRAINT "UQ_employee_finance_product_company_code"
        UNIQUE ("company_id", "code")
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_finance_products"
        DROP COLUMN "parent_product_id",
        DROP COLUMN "version_number"
    `);
    // Postgres cannot drop enum values; PENDING_MANAGEMENT_APPROVAL and
    // MANAGEMENT remain defined but unused after rollback.
  }
}
