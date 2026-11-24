import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeProfileRecordChanges1797900211000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE employee_profile_record_changes (
      id SERIAL PRIMARY KEY,
      company_id integer NOT NULL,
      employee_id integer NOT NULL,
      record_type varchar(40) NOT NULL,
      record_id integer NULL,
      action varchar(20) NOT NULL ,
      status varchar(20) NOT NULL ,
      sensitive boolean NOT NULL DEFAULT false,
      payload text NULL,
      before_data text NULL,
      after_data text NULL,
      rollback_of_change_id integer NULL,
      rolled_back_by_change_id integer NULL,
      reason text NULL,
      requested_by_user_id integer NOT NULL,
      reviewed_by_user_id integer NULL,
      reviewed_at timestamp NULL,
      review_comment text NULL,
      applied_at timestamp NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`);
    for (const sql of [
      `ADD CONSTRAINT "CHK_eprc_status" CHECK (status IN ('PENDING_HR','APPLIED','REJECTED','CANCELLED'))`,
      `ADD CONSTRAINT "CHK_eprc_action" CHECK (action IN ('CREATE','UPDATE','DELETE','ROLLBACK'))`,
      `ADD CONSTRAINT "FK_6a834f86ed2b7850c8666d47358" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      `ADD CONSTRAINT "FK_7893f7bd0d79c9e4d3c1f567c59" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      `ADD CONSTRAINT "FK_8d5082f07c8e673a547ae98bcb7" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
      `ADD CONSTRAINT "FK_0e3d1ff8b9e88c9328232702f40" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      `ADD CONSTRAINT "FK_8d290774a50572b71a0c7d4d0f8" FOREIGN KEY ("rollback_of_change_id") REFERENCES "employee_profile_record_changes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
      `ADD CONSTRAINT "FK_56b412c928ba969c0008db46c2b" FOREIGN KEY ("rolled_back_by_change_id") REFERENCES "employee_profile_record_changes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    ]) {
      await runner.query(
        `ALTER TABLE "employee_profile_record_changes" ${sql}`,
      );
    }
    await runner.query(
      `CREATE INDEX "IDX_eprc_company_status" ON employee_profile_record_changes (company_id, status)`,
    );
    await runner.query(
      `CREATE INDEX "IDX_eprc_employee_record" ON employee_profile_record_changes (employee_id, record_type, record_id)`,
    );
    // Audit rows are never deleted, even by mistake.
    await runner.query(`CREATE OR REPLACE FUNCTION eprc_block_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'employee_profile_record_changes is append-only'; END;
      $$ LANGUAGE plpgsql`);
    await runner.query(`CREATE TRIGGER eprc_no_delete BEFORE DELETE ON employee_profile_record_changes
      FOR EACH ROW EXECUTE FUNCTION eprc_block_delete()`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS employee_profile_record_changes`);
    await runner.query(`DROP FUNCTION IF EXISTS eprc_block_delete()`);
  }
}
