import { MigrationInterface, QueryRunner } from 'typeorm';

export class KpiAchievements1797900002000 implements MigrationInterface {
  name = 'KpiAchievements1797900002000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE phase3_kpi_achievements (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      assignment_id int NOT NULL REFERENCES phase1a_kpi_assignments(id),
      latest_revision_id int, approved_revision_id int, created_by int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase3_achievement_assignment UNIQUE(assignment_id))`);
    await q.query(`CREATE TABLE phase3_kpi_achievement_revisions (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      achievement_id int NOT NULL REFERENCES phase3_kpi_achievements(id), revision int NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'draft', actual jsonb, comments text,
      definition_version_id int NOT NULL REFERENCES phase1a_kpi_definition_versions(id),
      target_revision_id int NOT NULL REFERENCES phase1a_kpi_target_revisions(id),
      period_id int NOT NULL REFERENCES phase1a_kpi_periods(id), evidence_required boolean NOT NULL DEFAULT false, submitted_by int NOT NULL,
      submitted_at timestamptz, reviewed_by int, reviewed_at timestamptz, review_comment text,
      row_version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase3_achievement_revision UNIQUE(achievement_id, revision))`);
    await q.query(
      `CREATE INDEX IDX_phase3_achievement_status ON phase3_kpi_achievement_revisions(company_id, status)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX UQ_phase3_one_approved ON phase3_kpi_achievement_revisions(achievement_id) WHERE status='approved'`,
    );
    await q.query(
      `ALTER TABLE phase3_kpi_achievements ADD CONSTRAINT FK_phase3_latest FOREIGN KEY(latest_revision_id) REFERENCES phase3_kpi_achievement_revisions(id)`,
    );
    await q.query(
      `ALTER TABLE phase3_kpi_achievements ADD CONSTRAINT FK_phase3_approved FOREIGN KEY(approved_revision_id) REFERENCES phase3_kpi_achievement_revisions(id)`,
    );
    await q.query(`CREATE TABLE phase3_kpi_achievement_evidence (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      revision_id int NOT NULL REFERENCES phase3_kpi_achievement_revisions(id),
      private_path text NOT NULL, file_name varchar(255) NOT NULL, mime_type varchar(150) NOT NULL,
      file_size int NOT NULL, uploaded_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE phase3_kpi_achievement_events (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      achievement_id int NOT NULL REFERENCES phase3_kpi_achievements(id),
      revision_id int NOT NULL REFERENCES phase3_kpi_achievement_revisions(id),
      action varchar(40) NOT NULL, actor_id int NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE phase3_kpi_evidence_rules (
      id SERIAL PRIMARY KEY, company_id int NOT NULL REFERENCES companies(id),
      definition_version_id int NOT NULL REFERENCES phase1a_kpi_definition_versions(id),
      required boolean NOT NULL DEFAULT false, changed_by int NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase3_evidence_definition UNIQUE(definition_version_id))`);
    await q.query(`CREATE FUNCTION phase3_protect_approved() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status IN ('approved','superseded') AND (NEW.actual IS DISTINCT FROM OLD.actual OR NEW.comments IS DISTINCT FROM OLD.comments OR NEW.target_revision_id IS DISTINCT FROM OLD.target_revision_id OR NEW.definition_version_id IS DISTINCT FROM OLD.definition_version_id) THEN
          RAISE EXCEPTION 'Approved achievement content is immutable';
        END IF;
        IF OLD.status='superseded' AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Superseded achievement is immutable'; END IF;
        RETURN NEW;
      END $$`);
    await q.query(
      `CREATE TRIGGER phase3_approved_immutable BEFORE UPDATE ON phase3_kpi_achievement_revisions FOR EACH ROW EXECUTE FUNCTION phase3_protect_approved()`,
    );
    await q.query(
      `CREATE FUNCTION phase3_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'KPI achievement audit events are append-only'; END $$`,
    );
    await q.query(
      `CREATE TRIGGER phase3_events_immutable BEFORE UPDATE OR DELETE ON phase3_kpi_achievement_events FOR EACH ROW EXECUTE FUNCTION phase3_event_append_only()`,
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
