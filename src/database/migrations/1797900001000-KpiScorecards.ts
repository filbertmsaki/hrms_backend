import { MigrationInterface, QueryRunner } from 'typeorm';

export class KpiScorecards1797900001000 implements MigrationInterface {
  name = 'KpiScorecards1797900001000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE phase2_scoring_policies (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id), code varchar(80) NOT NULL,
      created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase2_policy_code UNIQUE(company_id, code))`);
    await q.query(`CREATE TABLE phase2_scoring_policy_versions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      policy_id int NOT NULL REFERENCES phase2_scoring_policies(id), version int NOT NULL,
      name varchar(160) NOT NULL, method varchar(30) NOT NULL DEFAULT 'weighted',
      config jsonb NOT NULL, rating_bands jsonb NOT NULL,
      published_at timestamptz, created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase2_policy_version UNIQUE(policy_id, version))`);
    await q.query(`CREATE TABLE phase2_scorecards (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id), code varchar(80) NOT NULL,
      subject_type varchar(30) NOT NULL, subject_id int NOT NULL,
      period_id int NOT NULL REFERENCES phase1a_kpi_periods(id),
      manager_employee_id int REFERENCES employees(id), organization_snapshot jsonb NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'draft', created_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase2_scorecard_code UNIQUE(company_id, code))`);
    await q.query(
      'CREATE INDEX IDX_phase2_scorecard_subject ON phase2_scorecards(company_id, subject_type, subject_id)',
    );
    await q.query(`CREATE TABLE phase2_scorecard_versions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      scorecard_id int NOT NULL REFERENCES phase2_scorecards(id), version int NOT NULL,
      name varchar(160) NOT NULL, description text, mode varchar(20) NOT NULL,
      policy_version_id int REFERENCES phase2_scoring_policy_versions(id),
      entries jsonb NOT NULL, published_at timestamptz, created_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase2_scorecard_version UNIQUE(scorecard_id, version))`);
    await q.query(`CREATE TABLE phase2_scorecard_templates (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      code varchar(80) NOT NULL, name varchar(160) NOT NULL, mode varchar(20) NOT NULL,
      policy_version_id int REFERENCES phase2_scoring_policy_versions(id),
      items jsonb NOT NULL, status varchar(20) NOT NULL DEFAULT 'draft',
      created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase2_scorecard_template_code UNIQUE(company_id, code))`);
    await q.query(`CREATE FUNCTION phase2_immutable_published() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.published_at IS NOT NULL THEN
          RAISE EXCEPTION 'Published Phase 2 versions are immutable';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$`);
    for (const table of [
      'phase2_scoring_policy_versions',
      'phase2_scorecard_versions',
    ]) {
      await q.query(`CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION phase2_immutable_published()`);
    }
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'KPI release migrations are forward-only; restore a verified backup or use a reviewed forward fix',
      ),
    );
  }
}
