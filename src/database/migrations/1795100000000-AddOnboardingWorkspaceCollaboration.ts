import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingWorkspaceCollaboration1795100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE onboarding_workspace_notes (
      id SERIAL PRIMARY KEY, company_id integer NOT NULL,
      request_id integer NOT NULL REFERENCES onboarding_requests(id) ON DELETE CASCADE,
      author_id integer REFERENCES company_users(id) ON DELETE SET NULL,
      client_key uuid NOT NULL, requirement_id varchar(180) NOT NULL,
      visibility varchar(20) NOT NULL CHECK (visibility IN ('internal', 'employee')),
      body text NOT NULL, created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_onboarding_workspace_note_retry" UNIQUE (request_id, author_id, client_key)
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_onboarding_workspace_notes_request" ON onboarding_workspace_notes(request_id)',
    );
    await queryRunner.query(`CREATE TABLE onboarding_workspace_visits (
      request_id integer NOT NULL REFERENCES onboarding_requests(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at timestamptz NOT NULL, PRIMARY KEY (request_id, user_id)
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE onboarding_workspace_visits');
    await queryRunner.query('DROP TABLE onboarding_workspace_notes');
  }
}
