import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeInvitations1788900000000 implements MigrationInterface {
  name = 'CreateEmployeeInvitations1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employee_invitations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "first_name" character varying(100) NOT NULL,
        "last_name" character varying(100) NOT NULL,
        "gender" character varying(20) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(20) NOT NULL,
        "primary_branch_id" integer NOT NULL,
        "primary_department_id" integer NOT NULL,
        "primary_position_id" integer NOT NULL,
        "employment_type" character varying(30) NOT NULL,
        "reports_to" integer,
        "hire_date" date,
        "onboarding_workflow_id" integer,
        "status" character varying(20) NOT NULL,
        "email_delivery_status" character varying(20) NOT NULL,
        "sms_delivery_status" character varying(20) NOT NULL,
        "email_message_id" character varying(255),
        "sms_message_id" character varying(255),
        "email_last_error" text,
        "sms_last_error" text,
        "created_by_company_user_id" integer,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        "accepted_employee_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employee_invitation_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "PK_employee_invitations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_invitation_company_status" ON "employee_invitations" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_invitation_company_email" ON "employee_invitations" ("company_id", "email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_invitation_company_phone" ON "employee_invitations" ("company_id", "phone")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_invitation_expires_at" ON "employee_invitations" ("expires_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_branch" FOREIGN KEY ("primary_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_department" FOREIGN KEY ("primary_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_position" FOREIGN KEY ("primary_position_id") REFERENCES "positions"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_manager" FOREIGN KEY ("reports_to") REFERENCES "employees"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_workflow" FOREIGN KEY ("onboarding_workflow_id") REFERENCES "onboarding_workflows"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_creator" FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_accepted_employee" FOREIGN KEY ("accepted_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employee_invitations"`);
  }
}
