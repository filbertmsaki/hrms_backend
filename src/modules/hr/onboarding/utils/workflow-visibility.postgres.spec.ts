import { DataSource, QueryRunner } from 'typeorm';
import {
  onboardingActionVisibilitySql,
  onboardingNotificationVisibilitySql,
} from './workflow-visibility';

const databaseUrl = process.env.WORKFLOW_VISIBILITY_TEST_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;

databaseSuite('onboarding visibility on PostgreSQL', () => {
  let source: DataSource;
  let runner: QueryRunner;
  beforeAll(async () => {
    source = new DataSource({ type: 'postgres', url: databaseUrl });
    await source.initialize();
    runner = source.createQueryRunner();
    await runner.connect();
  });
  afterAll(async () => {
    await runner?.release();
    await source?.destroy();
  });
  beforeEach(async () => {
    await runner.startTransaction();
    // Temporary tables shadow real tables; all test data disappears on rollback.
    await runner.query(`
      CREATE TEMP TABLE onboarding_requests (id int, company_id int, status text, current_approval_level int) ON COMMIT DROP;
      CREATE TEMP TABLE onboarding_workflow_steps (id int, step_order int) ON COMMIT DROP;
      CREATE TEMP TABLE onboarding_tasks (id int, onboarding_request_id int, workflow_step_id int, is_required boolean, status text) ON COMMIT DROP;
      CREATE TEMP TABLE onboarding_approvals (id int, onboarding_request_id int, approval_level int, approver_company_user_id int, status text) ON COMMIT DROP;
      CREATE TEMP TABLE action_items (id int, source_entity_type text, source_entity_id text, company_id int, assignee_company_user_id int, metadata jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE app_notifications (id int, type text, entity_id text, company_id int, receiver_company_user_id int) ON COMMIT DROP;
      INSERT INTO onboarding_requests VALUES (1, 10, 'in_progress', 3);
      INSERT INTO onboarding_workflow_steps VALUES (1, 1), (2, 2);
      INSERT INTO onboarding_tasks VALUES (11, 1, 1, true, 'pending'), (22, 1, 2, true, 'pending');
      INSERT INTO onboarding_approvals VALUES (33, 1, 3, 8, 'pending');
      INSERT INTO action_items VALUES
        (1, 'ONBOARDING_TASK', '11', 10, 8, NULL),
        (2, 'ONBOARDING_TASK', '22', 10, 8, NULL),
        (3, 'ONBOARDING_REQUEST', '1', 10, 8, NULL),
        (4, 'LEAVE_REQUEST', '100', 10, 8, NULL);
      INSERT INTO app_notifications VALUES
        (1, 'ONBOARDING_TASK_ASSIGNED', '11', 10, 8),
        (2, 'ONBOARDING_TASK_ASSIGNED', '22', 10, 8),
        (3, 'ONBOARDING_APPROVAL_REQUIRED', '1', 10, 8),
        (4, 'GENERAL', 'anything', 10, 8);
    `);
  });
  afterEach(async () => {
    await runner.rollbackTransaction();
  });

  async function visibleIds(table: 'action_items' | 'app_notifications') {
    const alias = table === 'action_items' ? 'item' : 'notification';
    const filter =
      table === 'action_items'
        ? onboardingActionVisibilitySql()
        : onboardingNotificationVisibilitySql();
    const rows = (await runner.query(
      `SELECT id FROM ${table} ${alias} WHERE ${filter} ORDER BY id`,
    )) as { id: number }[];
    return rows.map((row) => row.id);
  }

  it.each(['action_items', 'app_notifications'] as const)(
    'hides future work in %s until each section finishes',
    async (table) => {
      expect(await visibleIds(table)).toEqual([1, 4]);
      await runner.query(
        "UPDATE onboarding_tasks SET status = 'completed' WHERE id = 11",
      );
      expect(await visibleIds(table)).toEqual([1, 2, 4]);
      await runner.query(
        "UPDATE onboarding_tasks SET status = 'completed' WHERE id = 22",
      );
      expect(await visibleIds(table)).toEqual([1, 2, 3, 4]);
    },
  );

  it('also gates overdue reminders and the old client-generated approval notification', async () => {
    await runner.query(
      "UPDATE app_notifications SET type = 'ONBOARDING_TASK_OVERDUE' WHERE id = 2",
    );
    await runner.query(
      "UPDATE app_notifications SET type = 'onboarding_request_submitted' WHERE id = 3",
    );
    expect(await visibleIds('app_notifications')).toEqual([1, 4]);
  });

  it('preserves pre-workflow employee-details review without leaking cross-company tasks', async () => {
    await runner.query(
      "INSERT INTO action_items VALUES (5, 'ONBOARDING_REQUEST', '1', 10, 8, '{\"stage\":\"employee_details_review\"}'), (6, 'ONBOARDING_TASK', '11', 99, 8, NULL)",
    );
    expect(await visibleIds('action_items')).toEqual([1, 4, 5]);
  });

  it('keeps tasks hidden behind an earlier sign-off', async () => {
    await runner.query(
      "UPDATE onboarding_tasks SET status = 'completed' WHERE id = 11",
    );
    await runner.query('UPDATE onboarding_approvals SET approval_level = 1');
    await runner.query(
      'UPDATE onboarding_requests SET current_approval_level = 1',
    );
    expect(await visibleIds('action_items')).toEqual([1, 3, 4]);
    await runner.query("UPDATE onboarding_approvals SET status = 'approved'");
    expect(await visibleIds('action_items')).toEqual([1, 2, 3, 4]);
  });
});
