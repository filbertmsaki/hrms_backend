import { MigrationInterface, QueryRunner } from 'typeorm';

/** Promotes the activity and evidence tables from the isolated Phase 5 migration. */
export class KpiAchievementActivities1797900040000 implements MigrationInterface {
  name = 'KpiAchievementActivities1797900040000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS phase3_kpi_achievement_activities (
      id SERIAL PRIMARY KEY,
      company_id int NOT NULL REFERENCES companies(id),
      assignment_id int NOT NULL REFERENCES phase1a_kpi_assignments(id),
      revision_id int NOT NULL REFERENCES phase3_kpi_achievement_revisions(id),
      employee_id int NOT NULL REFERENCES employees(id),
      period_id int NOT NULL REFERENCES phase1a_kpi_periods(id),
      activity_date date NOT NULL,
      title varchar(180) NOT NULL,
      details text NOT NULL,
      measurable_result jsonb,
      comments text,
      created_by int NOT NULL,
      row_version int NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT CK_phase3_kpi_activity_date CHECK (activity_date IS NOT NULL),
      CONSTRAINT CK_phase3_kpi_activity_title CHECK (length(trim(title)) > 0),
      CONSTRAINT CK_phase3_kpi_activity_details CHECK (length(trim(details)) > 0),
      CONSTRAINT CK_phase3_kpi_activity_row_version CHECK (row_version > 0)
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS IDX_phase3_kpi_activity_revision
      ON phase3_kpi_achievement_activities(company_id, revision_id, activity_date)`);
    await q.query(`CREATE TABLE IF NOT EXISTS phase3_kpi_achievement_activity_evidence (
      id SERIAL PRIMARY KEY,
      company_id int NOT NULL REFERENCES companies(id),
      activity_id int NOT NULL REFERENCES phase3_kpi_achievement_activities(id) ON DELETE CASCADE,
      private_path text NOT NULL,
      file_name varchar(255) NOT NULL,
      mime_type varchar(150) NOT NULL,
      file_size int NOT NULL CHECK (file_size > 0),
      uploaded_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS IDX_phase3_kpi_activity_evidence
      ON phase3_kpi_achievement_activity_evidence(company_id, activity_id)`);
    await q.query(`CREATE OR REPLACE FUNCTION phase3_validate_kpi_activity_scope() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM phase1a_kpi_assignments a
          JOIN phase3_kpi_achievements h
            ON h.assignment_id = a.id AND h.company_id = a.company_id
          JOIN phase3_kpi_achievement_revisions r
            ON r.id = NEW.revision_id AND r.achievement_id = h.id AND r.company_id = h.company_id
          WHERE a.id = NEW.assignment_id AND a.company_id = NEW.company_id
            AND a.subject_type = 'employee' AND a.subject_id = NEW.employee_id
            AND a.period_id = NEW.period_id AND r.period_id = NEW.period_id
        ) THEN
          RAISE EXCEPTION 'KPI activity scope does not match its employee, assignment, company and period';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(
      `DROP TRIGGER IF EXISTS phase3_kpi_activity_scope ON phase3_kpi_achievement_activities`,
    );
    await q.query(`CREATE TRIGGER phase3_kpi_activity_scope
      BEFORE INSERT OR UPDATE ON phase3_kpi_achievement_activities
      FOR EACH ROW EXECUTE FUNCTION phase3_validate_kpi_activity_scope()`);
    await q.query(`CREATE OR REPLACE FUNCTION phase3_validate_kpi_activity_evidence_scope() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM phase3_kpi_achievement_activities activity
          WHERE activity.id = NEW.activity_id AND activity.company_id = NEW.company_id
        ) THEN
          RAISE EXCEPTION 'KPI activity evidence company does not match its activity';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(
      `DROP TRIGGER IF EXISTS phase3_kpi_activity_evidence_scope ON phase3_kpi_achievement_activity_evidence`,
    );
    await q.query(`CREATE TRIGGER phase3_kpi_activity_evidence_scope
      BEFORE INSERT OR UPDATE ON phase3_kpi_achievement_activity_evidence
      FOR EACH ROW EXECUTE FUNCTION phase3_validate_kpi_activity_evidence_scope()`);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'KPI activity records are retained; use a reviewed forward migration for rollback',
      ),
    );
  }
}
