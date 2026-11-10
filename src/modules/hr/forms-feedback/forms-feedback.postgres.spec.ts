import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource, EntitySchema } from 'typeorm';
import { CreateFormsFeedback1796900000000 } from '../../../database/migrations/1796900000000-CreateFormsFeedback';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../employees/entities/employee.entity';
import {
  FeedbackForm,
  FeedbackParticipation,
  FeedbackResponse,
  FeedbackRound,
} from './forms-feedback.entity';
import { FormsFeedbackService } from './forms-feedback.service';
import { SaveFormDto } from './forms-feedback.dto';
jest.mock('../../../database/migration-helpers/role-permission-grants', () => ({
  ensurePermissions: jest.fn(),
  grantPermissionsToSystemRoles: jest.fn(),
  revokePermissionsFromSystemRoles: jest.fn(),
  removePermissions: jest.fn(),
}));
const url = process.env.HRMS_FORMS_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Forms & Feedback PostgreSQL isolation',
  () => {
    const schema = `forms_test_${randomUUID().replaceAll('-', '')}`;
    let db: DataSource;
    let setup: DataSource;
    let service: FormsFeedbackService;
    const actor = (id = 1, company = 1) =>
      ({
        id,
        companyId: company,
        companyMembershipId: id,
        permissions: ['forms_feedback:manage'],
      }) as AuthenticatedUser;
    const definition: SaveFormDto = {
      title: 'Pulse',
      description: '',
      kind: 'survey',
      responseMode: 'anonymous',
      satisfaction: true,
      audience: { type: 'all', ids: [] },
      schedule: {
        frequency: 'monthly',
        timezone: 'Africa/Dar_es_Salaam',
        startDate: '2026-01-01',
        time: '09:00',
        dayOfMonth: 23,
        openDays: 7,
      },
      questions: [
        { id: 'rating', label: 'Satisfaction', type: 'rating', required: true },
      ],
    };
    let round: FeedbackRound;
    beforeAll(async () => {
      setup = await new DataSource({ type: 'postgres', url }).initialize();
      await setup.query(`CREATE SCHEMA "${schema}"`);
      db = await new DataSource({
        type: 'postgres',
        url,
        schema,
        extra: { options: `-c search_path=${schema},public` },
        entities: [
          FeedbackForm,
          FeedbackRound,
          FeedbackParticipation,
          FeedbackResponse,
          new EntitySchema({
            name: 'Employee',
            target: Employee,
            tableName: 'employees',
            columns: {
              id: { type: Number, primary: true },
              company_id: { type: Number },
              company_user_id: { type: Number },
              employment_status: { type: String },
              first_name: { type: String },
              last_name: { type: String },
              employee_no: { type: String },
            },
          }),
        ],
      }).initialize();
      await db.query(
        `CREATE TABLE companies(id int PRIMARY KEY); CREATE TABLE users(id int PRIMARY KEY); CREATE TABLE employees(id int PRIMARY KEY,company_id int,company_user_id int,employment_status varchar,first_name varchar,last_name varchar,employee_no varchar,primary_branch_id int,primary_department_id int); INSERT INTO companies VALUES(1),(2); INSERT INTO users SELECT generate_series(1,6); INSERT INTO employees SELECT n,CASE WHEN n=6 THEN 2 ELSE 1 END,n,'active','Test','Employee','EMP-'||n,NULL,NULL FROM generate_series(1,6) n;`,
      );
      const runner = db.createQueryRunner();
      await new CreateFormsFeedback1796900000000().up(runner);
      await runner.release();
      service = new FormsFeedbackService(db);
    }, 30000);
    beforeEach(async () => {
      await db.query(
        'TRUNCATE feedback_responses,feedback_participation,feedback_rounds,feedback_forms',
      );
      const form = await service.save(actor(), definition);
      round = await db.getRepository(FeedbackRound).save({
        formId: form.id,
        companyId: 1,
        definition,
        opensAt: new Date(Date.now() - 60000),
        closesAt: new Date(Date.now() + 3600000),
      });
      await db.query(
        'INSERT INTO feedback_participation(round_id,employee_id,company_id) SELECT $1,id,company_id FROM employees WHERE company_id=1',
        [round.id],
      );
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
      if (setup?.isInitialized) {
        await setup.query(`DROP SCHEMA "${schema}" CASCADE`);
        await setup.destroy();
      }
    });
    it('stores anonymous answers without identity and prevents concurrent duplicates', async () => {
      const attempts = await Promise.allSettled([
        service.submit(actor(), round.id, { rating: 4 }),
        service.submit(actor(), round.id, { rating: 5 }),
      ]);
      expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rows = await db.getRepository(FeedbackResponse).find();
      expect(rows).toHaveLength(1);
      expect(rows[0].employeeId).toBeNull();
      expect(rows[0]).not.toHaveProperty('createdAt');
      expect(
        await db
          .getRepository(FeedbackParticipation)
          .findOneBy({ roundId: round.id, employeeId: 1 }),
      ).toMatchObject({ submitted: true });
    });
    it('rejects other companies and withholds live anonymous answers', async () => {
      await expect(
        service.submit(actor(6, 2), round.id, { rating: 4 }),
      ).rejects.toThrow('not found');
      await expect(
        service.results(actor(6, 2), round.id, { page: 1, limit: 20 }),
      ).rejects.toThrow('not found');
      await service.submit(actor(), round.id, { rating: 4 });
      expect(
        await service.results(actor(), round.id, { page: 1, limit: 20 }),
      ).toMatchObject({ withheld: true, rows: [], summary: [] });
    });
    it('releases anonymous answers only after close and computes real satisfaction', async () => {
      for (let n = 1; n <= 5; n++)
        await service.submit(actor(n), round.id, { rating: 4 });
      await db
        .getRepository(FeedbackRound)
        .update(round.id, { closesAt: new Date(Date.now() - 1000) });
      const result = await service.results(actor(), round.id, {
        page: 1,
        limit: 20,
      });
      expect(result.withheld).toBe(false);
      expect(result.rows).toHaveLength(5);
      expect(result.rows[0]).toEqual({ answers: { rating: 4 } });
      expect(await service.satisfaction(actor())).toMatchObject({
        score: 75,
        responseCount: 5,
        satisfied: 5,
      });
    });
    it('database rejects identity attached to anonymous answers', async () => {
      await expect(
        db.getRepository(FeedbackResponse).save({
          roundId: round.id,
          companyId: 1,
          employeeId: 1,
          answers: { rating: 4 },
        }),
      ).rejects.toThrow('Invalid response identity');
    });
    it('identified forms retain the employee identity', async () => {
      await db.getRepository(FeedbackRound).update(round.id, {
        definition: { ...definition, responseMode: 'identified' },
      });
      await service.submit(actor(), round.id, { rating: 3 });
      const result = await service.results(actor(), round.id, {
        page: 1,
        limit: 20,
      });
      expect(result.rows[0]).toMatchObject({
        employee: { id: 1, employeeNo: 'EMP-1' },
        answers: { rating: 3 },
      });
    });
    it('locks identity mode after publishing', async () => {
      await db
        .getRepository(FeedbackForm)
        .update(round.formId, { status: 'paused', publishedMode: 'anonymous' });
      await expect(
        service.save(
          actor(),
          { ...definition, responseMode: 'identified' },
          round.formId,
        ),
      ).rejects.toThrow('locked');
    });
    it('opens a due round once across concurrent scheduler runs and snapshots its questions', async () => {
      await db.getRepository(FeedbackForm).update(round.formId, {
        status: 'scheduled',
        publishedMode: 'anonymous',
        nextOpenAt: new Date(Date.now() - 1000),
      });
      await Promise.all([
        service.openDueForm(round.formId),
        service.openDueForm(round.formId),
      ]);
      expect(
        await db.getRepository(FeedbackRound).countBy({ formId: round.formId }),
      ).toBe(2);
      const form = await db
        .getRepository(FeedbackForm)
        .findOneByOrFail({ id: round.formId });
      expect(form.roundCount).toBe(1);
      const live = await service.list(actor(), {
        page: 1,
        limit: 20,
        status: 'open',
      });
      expect(live.total).toBe(1);
      expect(live.rows[0].displayStatus).toBe('open');
      await service.transition(actor(), form.id, 'pause');
      await service.save(
        actor(),
        { ...definition, title: 'Future title' },
        form.id,
      );
      expect(
        (
          await db
            .getRepository(FeedbackRound)
            .findOneByOrFail({ id: round.id })
        ).definition.title,
      ).toBe('Pulse');
    });
    it('filters employee forms without exposing anonymous answers in submission history', async () => {
      await service.submit(actor(), round.id, { rating: 4 });
      expect(
        (await service.mine(actor(), { page: 1, limit: 20, status: 'pending' }))
          .total,
      ).toBe(0);
      const history = await service.mine(actor(), {
        page: 1,
        limit: 20,
        status: 'submitted',
      });
      expect(history.total).toBe(1);
      expect(history.rows[0]).not.toHaveProperty('answers');
    });
  },
);
