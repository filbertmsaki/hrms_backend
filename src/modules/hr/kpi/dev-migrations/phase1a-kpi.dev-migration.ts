import { MigrationInterface, QueryRunner } from 'typeorm';

// Development only. This class is deliberately outside src/database/migrations.
// Do not register in the deployable DataSource until UAT history is reconciled.
export class Phase1aKpiDevelopmentOnly1793900000000 implements MigrationInterface {
  name = 'Phase1aKpiDevelopmentOnly1793900000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE phase1a_kpi_definitions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id), code varchar(80) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'draft', created_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase1a_kpi_definition_code UNIQUE(company_id, code))`);
    await q.query(`CREATE TABLE phase1a_kpi_definition_versions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      definition_id int NOT NULL REFERENCES phase1a_kpi_definitions(id), version int NOT NULL,
      name varchar(160) NOT NULL, description text, category varchar(100) NOT NULL, strategic_objective text,
      measurement_type varchar(30) NOT NULL, measurement_unit varchar(60), direction varchar(30) NOT NULL,
      frequency varchar(20) NOT NULL, owner_employee_id int REFERENCES employees(id),
      published_at timestamptz, created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase1a_kpi_definition_version UNIQUE(definition_id, version))`);
    await q.query(
      `CREATE INDEX IDX_phase1a_kpi_version_company ON phase1a_kpi_definition_versions(company_id)`,
    );
    await q.query(`CREATE TABLE phase1a_kpi_templates (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id), code varchar(80) NOT NULL,
      name varchar(160) NOT NULL, description text, category varchar(100) NOT NULL,
      department_classification varchar(100), strategic_objective text, measurement_type varchar(30) NOT NULL,
      measurement_unit varchar(60), direction varchar(30) NOT NULL, frequency varchar(20) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'draft', created_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase1a_kpi_template_code UNIQUE(company_id, code))`);
    await q.query(`CREATE TABLE phase1a_kpi_periods (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id), frequency varchar(20) NOT NULL,
      label varchar(100) NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
      timezone varchar(100), created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase1a_kpi_period UNIQUE(company_id, frequency, start_date, end_date),
      CONSTRAINT CK_phase1a_kpi_period_dates CHECK(start_date <= end_date))`);
    await q.query(`CREATE TABLE phase1a_kpi_assignments (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      definition_version_id int NOT NULL REFERENCES phase1a_kpi_definition_versions(id),
      period_id int NOT NULL REFERENCES phase1a_kpi_periods(id), subject_type varchar(30) NOT NULL,
      subject_id int NOT NULL, manager_employee_id int REFERENCES employees(id), organization_snapshot jsonb NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'active', created_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE INDEX IDX_phase1a_kpi_assignment_subject ON phase1a_kpi_assignments(company_id, subject_type, subject_id)`,
    );
    await q.query(`CREATE TABLE phase1a_kpi_target_revisions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      assignment_id int NOT NULL REFERENCES phase1a_kpi_assignments(id), revision int NOT NULL,
      target jsonb NOT NULL, reason text, changed_by int NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase1a_kpi_target_revision UNIQUE(assignment_id, revision))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE phase1a_kpi_target_revisions');
    await q.query('DROP TABLE phase1a_kpi_assignments');
    await q.query('DROP TABLE phase1a_kpi_periods');
    await q.query('DROP TABLE phase1a_kpi_templates');
    await q.query('DROP TABLE phase1a_kpi_definition_versions');
    await q.query('DROP TABLE phase1a_kpi_definitions');
  }
}
