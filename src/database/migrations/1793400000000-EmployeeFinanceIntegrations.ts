import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'employee_finance:integrations',
    displayName: 'Manage employee finance bank and ERP integrations',
    description:
      'Allow configuring bank and ERP connections, exporting journals and payment files, and retrying failed transmissions',
  },
];

export class EmployeeFinanceIntegrations1793400000000 implements MigrationInterface {
  name = 'EmployeeFinanceIntegrations1793400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employee_finance_integration_settings" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "erp_mode" character varying(20) NOT NULL DEFAULT 'FILE',
        "erp_provider" character varying(40) NOT NULL DEFAULT 'GENERIC_WEBHOOK',
        "erp_environment" character varying(20) NOT NULL DEFAULT 'SANDBOX',
        "erp_endpoint_url" text,
        "erp_auth_type" character varying(20) NOT NULL DEFAULT 'none',
        "erp_credentials" text,
        "bank_mode" character varying(20) NOT NULL DEFAULT 'FILE',
        "bank_provider" character varying(40) NOT NULL DEFAULT 'GENERIC_REST',
        "bank_environment" character varying(20) NOT NULL DEFAULT 'SANDBOX',
        "bank_endpoint_url" text,
        "bank_auth_type" character varying(20) NOT NULL DEFAULT 'none',
        "bank_credentials" text,
        "debit_account_number" character varying(60),
        "bank_file_template" jsonb,
        "bank_import_mapping" jsonb,
        "gl_mapping" jsonb,
        "updated_by_company_user_id" integer,
        "version" integer NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employee_finance_integration_company" UNIQUE ("company_id"),
        CONSTRAINT "PK_employee_finance_integration_settings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "employee_finance_integration_logs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "channel" character varying(10) NOT NULL,
        "operation" character varying(40) NOT NULL,
        "mode" character varying(10) NOT NULL,
        "environment" character varying(20) NOT NULL,
        "idempotency_key" character varying(180) NOT NULL,
        "status" character varying(20) NOT NULL,
        "attempt_count" integer NOT NULL DEFAULT 1,
        "next_retry_at" TIMESTAMP WITH TIME ZONE,
        "file_name" character varying(200),
        "record_count" integer NOT NULL DEFAULT 0,
        "total_amount" numeric(18,2) NOT NULL DEFAULT '0',
        "request_payload" jsonb,
        "response_summary" jsonb,
        "error" text,
        "created_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employee_finance_integration_log_key" UNIQUE ("company_id", "idempotency_key"),
        CONSTRAINT "PK_employee_finance_integration_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employee_finance_integration_log_status"
        ON "employee_finance_integration_logs" ("company_id", "channel", "status")
    `);
    await ensurePermissions(queryRunner, PERMISSIONS);
    await grantPermissionsToSystemRoles(queryRunner, {
      COMPANY_ADMIN: PERMISSIONS.map((permission) => permission.name),
    });
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await removePermissions(
      queryRunner,
      PERMISSIONS.map((permission) => permission.name),
    );
    await queryRunner.query(`DROP TABLE "employee_finance_integration_logs"`);
    await queryRunner.query(
      `DROP TABLE "employee_finance_integration_settings"`,
    );
  }
}
