import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Acting employee / leave delegation: who covers for an employee while on
 * leave. New table only; existing leave tables are untouched. At most one
 * non-cancelled assignment per leave request (replacements cancel the old
 * row and keep it as history). Constraint names match the entity so a
 * migration:generate dry run shows no drift.
 */
export class LeaveActingAssignments1797900037000 implements MigrationInterface {
  name = 'LeaveActingAssignments1797900037000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_acting_assignments" (
      "id" SERIAL NOT NULL,
      "company_id" integer NOT NULL,
      "leave_request_id" integer NOT NULL,
      "absent_employee_id" integer NOT NULL,
      "acting_employee_id" integer NOT NULL,
      "appointed_by_employee_id" integer,
      "appointed_by_company_user_id" integer,
      "start_date" date NOT NULL,
      "end_date" date NOT NULL,
      "follows_leave_dates" boolean NOT NULL DEFAULT true,
      "responsibilities" text,
      "status" character varying(20) NOT NULL DEFAULT 'PENDING',
      "route_approvals" boolean NOT NULL DEFAULT false,
      "approval_delegation_id" integer,
      "activated_at" TIMESTAMP WITH TIME ZONE,
      "completed_at" TIMESTAMP WITH TIME ZONE,
      "cancelled_at" TIMESTAMP WITH TIME ZONE,
      "cancelled_by_company_user_id" integer,
      "cancellation_reason" character varying(500),
      "replaced_by_assignment_id" integer,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_leave_acting_not_self" CHECK ("acting_employee_id" <> "absent_employee_id"),
      CONSTRAINT "CHK_leave_acting_dates" CHECK ("end_date" >= "start_date"),
      CONSTRAINT "CHK_leave_acting_status" CHECK ("status" IN ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
      CONSTRAINT "PK_68ad412e204866200c9e0410ea1" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_acting_open_per_request" ON "leave_acting_assignments" ("leave_request_id") WHERE "status" <> 'CANCELLED'`,
    );
    await q.query(
      `CREATE INDEX "IDX_leave_acting_acting" ON "leave_acting_assignments" ("company_id", "acting_employee_id", "status")`,
    );
    await q.query(
      `CREATE INDEX "IDX_leave_acting_absent" ON "leave_acting_assignments" ("company_id", "absent_employee_id", "status")`,
    );
    await q.query(
      `CREATE INDEX "IDX_leave_acting_leave_request" ON "leave_acting_assignments" ("leave_request_id")`,
    );
    const fk = (name: string, column: string, target: string, onDelete: string) =>
      q.query(
        `ALTER TABLE "leave_acting_assignments" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${target}"("id") ON DELETE ${onDelete} ON UPDATE NO ACTION`,
      );
    await fk('FK_7a90fc8da846c43277f6950691f', 'company_id', 'companies', 'CASCADE');
    await fk('FK_a440eb20bf8b272a82076d9a306', 'appointed_by_company_user_id', 'company_users', 'SET NULL');
    await fk('FK_301aa642193304fe6473ffc94ae', 'cancelled_by_company_user_id', 'company_users', 'SET NULL');
    await fk('FK_afe8a452c4db9c38742278a3ee2', 'approval_delegation_id', 'leave_approval_delegations', 'SET NULL');
    await fk('FK_f8ed91ec790c8d72aabde583ed9', 'replaced_by_assignment_id', 'leave_acting_assignments', 'SET NULL');
    await fk('FK_edc11cdedc9e48ee2252c360e80', 'leave_request_id', 'leave_requests', 'CASCADE');
    await fk('FK_0a1f8b56b00027774f420098d83', 'absent_employee_id', 'employees', 'CASCADE');
    await fk('FK_fc176fbc139cb921fd7a69a063e', 'acting_employee_id', 'employees', 'RESTRICT');
    await fk('FK_6e00123cf019ae1358862886dbe', 'appointed_by_employee_id', 'employees', 'SET NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "leave_acting_assignments"`);
  }
}
