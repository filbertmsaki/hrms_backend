import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  revokePermissionsFromSystemRoles,
  removePermissions,
} from '../migration-helpers/role-permission-grants';
const permissions = [
  {
    name: 'forms_feedback:manage',
    displayName: 'Manage forms and feedback',
    description: 'Create and schedule company forms and view results',
  },
];
const grants = {
  COMPANY_ADMIN: ['forms_feedback:manage'],
  HR_MANAGER: ['forms_feedback:manage'],
  HR_OFFICER: ['forms_feedback:manage'],
};
export class CreateFormsFeedback1796900000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE feedback_forms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id int NOT NULL REFERENCES companies(id), created_by int NOT NULL REFERENCES users(id),
      definition jsonb NOT NULL, status varchar NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','paused','closed')),
      published_mode varchar NULL CHECK(published_mode IN ('identified','anonymous')), next_open_at timestamptz NULL, round_count int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX ON feedback_forms(company_id);
      CREATE INDEX ON feedback_forms(next_open_at) WHERE status='scheduled';
      CREATE TABLE feedback_rounds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), form_id uuid NOT NULL REFERENCES feedback_forms(id), company_id int NOT NULL REFERENCES companies(id), definition jsonb NOT NULL, opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL, UNIQUE(form_id,opens_at), CHECK(closes_at>opens_at));
      CREATE INDEX ON feedback_rounds(company_id,opens_at);
      CREATE TABLE feedback_participation (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES feedback_rounds(id), employee_id int NOT NULL REFERENCES employees(id), company_id int NOT NULL REFERENCES companies(id), submitted boolean NOT NULL DEFAULT false, last_notified_at timestamptz NULL, UNIQUE(round_id,employee_id));
      CREATE INDEX ON feedback_participation(company_id,employee_id);
      CREATE TABLE feedback_responses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES feedback_rounds(id), company_id int NOT NULL REFERENCES companies(id), employee_id int NULL REFERENCES employees(id), answers jsonb NOT NULL);
      CREATE INDEX ON feedback_responses(company_id,round_id);
      CREATE UNIQUE INDEX ON feedback_responses(round_id,employee_id) WHERE employee_id IS NOT NULL;
      CREATE FUNCTION feedback_response_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM feedback_rounds r WHERE r.id=NEW.round_id AND r.company_id=NEW.company_id AND ((r.definition->>'responseMode'='anonymous' AND NEW.employee_id IS NULL) OR (r.definition->>'responseMode'='identified' AND NEW.employee_id IS NOT NULL))) THEN
          RAISE EXCEPTION 'Invalid response identity';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER feedback_response_identity BEFORE INSERT OR UPDATE ON feedback_responses FOR EACH ROW EXECUTE FUNCTION feedback_response_identity_guard();`);
    await ensurePermissions(q, permissions);
    await grantPermissionsToSystemRoles(q, grants);
  }
  async down(q: QueryRunner) {
    await q.query(
      'DROP TABLE feedback_responses; DROP FUNCTION feedback_response_identity_guard(); DROP TABLE feedback_participation; DROP TABLE feedback_rounds; DROP TABLE feedback_forms;',
    );
    await revokePermissionsFromSystemRoles(q, grants);
    await removePermissions(
      q,
      permissions.map((p) => p.name),
    );
  }
}
