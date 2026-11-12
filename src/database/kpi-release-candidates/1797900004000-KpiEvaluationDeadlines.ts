import { MigrationInterface, QueryRunner } from 'typeorm';

// Candidate only: exclude from normal release discovery until UAT upgrade rehearsal passes.
export class KpiEvaluationDeadlines1797900004000 implements MigrationInterface {
  name = 'KpiEvaluationDeadlines1797900004000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE phase4_evaluation_cycles
      ADD COLUMN ack_deadline date,
      ADD COLUMN hr_reviewer_company_user_id int REFERENCES company_users(id),
      ADD COLUMN deadline_policy jsonb NOT NULL DEFAULT '{"mode":"soft"}'::jsonb`);
    await q.query(`ALTER TABLE phase4_evaluations
      ADD COLUMN hr_reviewer_company_user_id int REFERENCES company_users(id)`);
    await q.query(`CREATE TABLE phase4_evaluation_deadline_exceptions (
      id SERIAL PRIMARY KEY,
      company_id int NOT NULL REFERENCES companies(id),
      evaluation_id int NOT NULL REFERENCES phase4_evaluations(id),
      stage varchar(20) NOT NULL CHECK(stage IN ('self','manager','hr','ack')),
      reason text NOT NULL,
      approved_by int NOT NULL,
      approved_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_phase4_deadline_exception UNIQUE(evaluation_id, stage))`);
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'KPI release migrations are forward-only; restore a verified backup or use a reviewed forward fix',
      ),
    );
  }
}
