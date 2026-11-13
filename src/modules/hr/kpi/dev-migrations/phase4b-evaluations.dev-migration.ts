import { MigrationInterface, QueryRunner } from 'typeorm';

// Development only; intentionally excluded from normal migration discovery.
export class Phase4bEvaluationsDevelopmentOnly1793900004000 implements MigrationInterface {
  name = 'Phase4bEvaluationsDevelopmentOnly1793900004000';
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
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE phase4_evaluation_deadline_exceptions');
    await q.query(
      'ALTER TABLE phase4_evaluations DROP COLUMN hr_reviewer_company_user_id',
    );
    await q.query(
      'ALTER TABLE phase4_evaluation_cycles DROP COLUMN deadline_policy, DROP COLUMN hr_reviewer_company_user_id, DROP COLUMN ack_deadline',
    );
  }
}
