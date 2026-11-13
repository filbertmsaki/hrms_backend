import { DataSource, QueryRunner } from 'typeorm';
import { createAppDataSourceOptions } from '../../../database/typeorm-options';
import { loadCommandEnv } from '../../../database/load-command-env';

const disposable =
  process.env.DB_NAME === 'hrms_kpi_dev_test' &&
  ['localhost', '127.0.0.1', '::1'].includes(
    process.env.DB_HOST ?? 'localhost',
  );
(disposable ? describe : describe.skip)(
  'Phase 3 disposable PostgreSQL constraints',
  () => {
    let db: DataSource, q: QueryRunner;
    let companyId: number,
      assignmentId: number,
      targetId: number,
      definitionVersionId: number,
      periodId: number,
      achievementId: number;
    const marker = `phase3_constraint_${Date.now()}`;
    beforeAll(async () => {
      db = new DataSource({
        ...createAppDataSourceOptions(loadCommandEnv(process.env)),
        migrations: [],
      });
      await db.initialize();
    });
    afterAll(async () => {
      await db?.destroy();
    });
    beforeEach(async () => {
      q = db.createQueryRunner();
      await q.connect();
      await q.startTransaction();
      const [company] = await q.query(
        'INSERT INTO companies(name,slug) VALUES($1,$2) RETURNING id',
        ['Phase 3 Constraint', marker],
      );
      companyId = Number(company.id);
      const [employee] = await q.query(
        "INSERT INTO employees(company_id,employee_no,first_name,last_name,gender,version) VALUES($1,$2,'Test','Employee','other',1) RETURNING id",
        [companyId, marker],
      );
      const [period] = await q.query(
        "INSERT INTO phase1a_kpi_periods(company_id,frequency,label,start_date,end_date,created_by) VALUES($1,'monthly','Constraint','2028-01-01','2028-01-31',1) RETURNING id",
        [companyId],
      );
      periodId = Number(period.id);
      const [definition] = await q.query(
        "INSERT INTO phase1a_kpi_definitions(company_id,code,status,created_by) VALUES($1,$2,'published',1) RETURNING id",
        [companyId, marker.toUpperCase()],
      );
      const [version] = await q.query(
        "INSERT INTO phase1a_kpi_definition_versions(company_id,definition_id,version,name,category,measurement_type,direction,frequency,published_at,created_by) VALUES($1,$2,1,'Test KPI','Test','numeric','higher','monthly',now(),1) RETURNING id",
        [companyId, definition.id],
      );
      definitionVersionId = Number(version.id);
      const [assignment] = await q.query(
        "INSERT INTO phase1a_kpi_assignments(company_id,definition_version_id,period_id,subject_type,subject_id,organization_snapshot,status,created_by) VALUES($1,$2,$3,'employee',$4,'{}','active',1) RETURNING id",
        [companyId, definitionVersionId, periodId, employee.id],
      );
      assignmentId = Number(assignment.id);
      const [target] = await q.query(
        "INSERT INTO phase1a_kpi_target_revisions(company_id,assignment_id,revision,target,reason,changed_by) VALUES($1,$2,1,$3,'Initial',1) RETURNING id",
        [companyId, assignmentId, JSON.stringify({ value: 100 })],
      );
      targetId = Number(target.id);
      const [root] = await q.query(
        'INSERT INTO phase3_kpi_achievements(company_id,assignment_id,created_by) VALUES($1,$2,1) RETURNING id',
        [companyId, assignmentId],
      );
      achievementId = Number(root.id);
    });
    afterEach(async () => {
      await q.rollbackTransaction();
      await q.release();
    });
    async function revision(number: number, status: string) {
      const [row] = await q.query(
        'INSERT INTO phase3_kpi_achievement_revisions(company_id,achievement_id,revision,status,actual,definition_version_id,target_revision_id,period_id,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING id',
        [
          companyId,
          achievementId,
          number,
          status,
          JSON.stringify(90),
          definitionVersionId,
          targetId,
          periodId,
        ],
      );
      return Number(row.id);
    }
    it('rejects duplicate achievement roots and duplicate approved revisions', async () => {
      await q.query('SAVEPOINT expected_duplicate_root');
      await expect(
        q.query(
          'INSERT INTO phase3_kpi_achievements(company_id,assignment_id,created_by) VALUES($1,$2,1)',
          [companyId, assignmentId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await q.query('ROLLBACK TO SAVEPOINT expected_duplicate_root');
      await revision(1, 'approved');
      await q.query('SAVEPOINT expected_duplicate_approval');
      await expect(revision(2, 'approved')).rejects.toMatchObject({
        code: '23505',
      });
      await q.query('ROLLBACK TO SAVEPOINT expected_duplicate_approval');
    });
    it('protects approved content and append-only audit events', async () => {
      const id = await revision(1, 'approved');
      await q.query('SAVEPOINT expected_immutable');
      await expect(
        q.query(
          'UPDATE phase3_kpi_achievement_revisions SET actual=$1 WHERE id=$2',
          [JSON.stringify(95), id],
        ),
      ).rejects.toThrow('Approved achievement content is immutable');
      await q.query('ROLLBACK TO SAVEPOINT expected_immutable');
      const [event] = await q.query(
        "INSERT INTO phase3_kpi_achievement_events(company_id,achievement_id,revision_id,action,actor_id) VALUES($1,$2,$3,'approved',1) RETURNING id",
        [companyId, achievementId, id],
      );
      await q.query('SAVEPOINT expected_append_only');
      await expect(
        q.query('DELETE FROM phase3_kpi_achievement_events WHERE id=$1', [
          event.id,
        ]),
      ).rejects.toThrow('append-only');
      await q.query('ROLLBACK TO SAVEPOINT expected_append_only');
    });
  },
);
