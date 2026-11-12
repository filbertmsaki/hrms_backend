import { MigrationInterface, QueryRunner } from 'typeorm';

export class KpiEvaluations1797900003000 implements MigrationInterface {
  name = 'KpiEvaluations1797900003000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE phase4_evaluation_templates (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id), code varchar(80) NOT NULL,
      created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase4_template_code UNIQUE(company_id, code))`);
    await q.query(`CREATE TABLE phase4_evaluation_template_versions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      template_id int NOT NULL REFERENCES phase4_evaluation_templates(id), version int NOT NULL,
      name varchar(160) NOT NULL, config jsonb NOT NULL, published_at timestamptz,
      created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase4_template_version UNIQUE(template_id, version))`);
    await q.query(`CREATE TABLE phase4_evaluation_cycles (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id), code varchar(80) NOT NULL,
      name varchar(160) NOT NULL, frequency varchar(20) NOT NULL,
      period_id int NOT NULL REFERENCES phase1a_kpi_periods(id),
      template_version_id int NOT NULL REFERENCES phase4_evaluation_template_versions(id),
      start_date date NOT NULL, end_date date NOT NULL, self_deadline date, manager_deadline date,
      hr_deadline date, status varchar(20) NOT NULL DEFAULT 'draft', created_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase4_cycle_code UNIQUE(company_id, code),
      CONSTRAINT CK_phase4_cycle_dates CHECK(start_date <= end_date))`);
    await q.query(`CREATE TABLE phase4_evaluations (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      cycle_id int NOT NULL REFERENCES phase4_evaluation_cycles(id),
      employee_id int NOT NULL REFERENCES employees(id), manager_employee_id int NOT NULL REFERENCES employees(id),
      scorecard_id int NOT NULL REFERENCES phase2_scorecards(id),
      template_version_id int NOT NULL REFERENCES phase4_evaluation_template_versions(id),
      organization_snapshot jsonb NOT NULL, amended_from_id int REFERENCES phase4_evaluations(id),
      status varchar(30) NOT NULL DEFAULT 'self_draft', row_version int NOT NULL DEFAULT 1,
      self_data jsonb, manager_data jsonb, hr_comment text, final_snapshot jsonb,
      finalized_at timestamptz, ack_status varchar(20), ack_comment text, ack_at timestamptz,
      created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT CK_phase4_eval_final CHECK((status = 'finalized' AND final_snapshot IS NOT NULL AND finalized_at IS NOT NULL) OR status <> 'finalized'))`);
    await q.query(
      `CREATE UNIQUE INDEX UQ_phase4_original_participant ON phase4_evaluations(cycle_id, employee_id) WHERE amended_from_id IS NULL`,
    );
    await q.query(
      `CREATE INDEX IDX_phase4_eval_employee ON phase4_evaluations(company_id, employee_id)`,
    );
    await q.query(`CREATE TABLE phase4_evaluation_revisions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      evaluation_id int NOT NULL REFERENCES phase4_evaluations(id), section varchar(20) NOT NULL,
      revision int NOT NULL, data jsonb NOT NULL, created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase4_eval_revision UNIQUE(evaluation_id, section, revision))`);
    await q.query(`CREATE TABLE phase4_evaluation_events (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      evaluation_id int NOT NULL REFERENCES phase4_evaluations(id), action varchar(50) NOT NULL,
      actor_id int NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE FUNCTION phase4_prevent_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.final_snapshot IS NOT NULL AND NEW.final_snapshot IS DISTINCT FROM OLD.final_snapshot THEN
          RAISE EXCEPTION 'Final evaluation snapshot is immutable'; END IF;
        IF OLD.status = 'finalized' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.self_data IS DISTINCT FROM OLD.self_data OR NEW.manager_data IS DISTINCT FROM OLD.manager_data OR NEW.hr_comment IS DISTINCT FROM OLD.hr_comment) THEN
          RAISE EXCEPTION 'Finalized evaluation content is immutable'; END IF;
        RETURN NEW;
      END $$`);
    await q.query(
      `CREATE TRIGGER phase4_snapshot_immutable BEFORE UPDATE ON phase4_evaluations FOR EACH ROW EXECUTE FUNCTION phase4_prevent_snapshot_change()`,
    );
    await q.query(`CREATE FUNCTION phase4_prevent_published_template_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published appraisal template version is immutable'; END IF; RETURN NEW; END $$`);
    await q.query(
      `CREATE TRIGGER phase4_template_immutable BEFORE UPDATE OR DELETE ON phase4_evaluation_template_versions FOR EACH ROW EXECUTE FUNCTION phase4_prevent_published_template_change()`,
    );
    await q.query(
      `CREATE FUNCTION phase4_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Appraisal history is append-only'; END $$`,
    );
    await q.query(
      `CREATE TRIGGER phase4_revisions_immutable BEFORE UPDATE OR DELETE ON phase4_evaluation_revisions FOR EACH ROW EXECUTE FUNCTION phase4_append_only()`,
    );
    await q.query(
      `CREATE TRIGGER phase4_events_immutable BEFORE UPDATE OR DELETE ON phase4_evaluation_events FOR EACH ROW EXECUTE FUNCTION phase4_append_only()`,
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'KPI release migrations are forward-only; restore a verified backup or use a reviewed forward fix',
      ),
    );
  }
}
