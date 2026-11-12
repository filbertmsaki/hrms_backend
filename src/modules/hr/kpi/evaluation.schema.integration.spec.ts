import { DataSource, QueryRunner } from 'typeorm';
import { createAppDataSourceOptions } from '../../../database/typeorm-options';
import { loadCommandEnv } from '../../../database/load-command-env';

const disposable =
  process.env.DB_NAME === 'hrms_kpi_dev_test' &&
  ['localhost', '127.0.0.1', '::1'].includes(
    process.env.DB_HOST ?? 'localhost',
  );
(disposable ? describe : describe.skip)(
  'Phase 4 disposable PostgreSQL constraints',
  () => {
    let db: DataSource,
      q: QueryRunner,
      companyId: number,
      evaluationId: number,
      templateVersionId: number;
    const stamp = `phase4_constraint_${Date.now()}`;
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
        ['Phase 4 Constraint', stamp],
      );
      companyId = Number(company.id);
      const [manager] = await q.query(
        "INSERT INTO employees(company_id,employee_no,first_name,last_name,gender,version) VALUES($1,$2,'Test','Manager','other',1) RETURNING id",
        [companyId, `${stamp}_m`],
      );
      const [employee] = await q.query(
        "INSERT INTO employees(company_id,employee_no,first_name,last_name,gender,version,reports_to) VALUES($1,$2,'Test','Employee','other',1,$3) RETURNING id",
        [companyId, `${stamp}_e`, manager.id],
      );
      const [period] = await q.query(
        "INSERT INTO phase1a_kpi_periods(company_id,frequency,label,start_date,end_date,created_by) VALUES($1,'monthly','Constraint','2028-01-01','2028-01-31',1) RETURNING id",
        [companyId],
      );
      const [card] = await q.query(
        "INSERT INTO phase2_scorecards(company_id,code,subject_type,subject_id,period_id,organization_snapshot,status,created_by) VALUES($1,$2,'employee',$3,$4,'{}','published',1) RETURNING id",
        [companyId, stamp, employee.id, period.id],
      );
      const [template] = await q.query(
        'INSERT INTO phase4_evaluation_templates(company_id,code,created_by) VALUES($1,$2,1) RETURNING id',
        [companyId, stamp],
      );
      const [version] = await q.query(
        "INSERT INTO phase4_evaluation_template_versions(company_id,template_id,version,name,config,published_at,created_by) VALUES($1,$2,1,'Constraint',$3,now(),1) RETURNING id",
        [
          companyId,
          template.id,
          JSON.stringify({
            competencies: [],
            scale: [
              { value: 1, label: 'Low' },
              { value: 2, label: 'High' },
            ],
            requireHrReview: false,
          }),
        ],
      );
      templateVersionId = Number(version.id);
      const [cycle] = await q.query(
        "INSERT INTO phase4_evaluation_cycles(company_id,code,name,frequency,period_id,template_version_id,start_date,end_date,status,created_by) VALUES($1,$2,'Constraint','monthly',$3,$4,'2028-01-01','2028-01-31','open',1) RETURNING id",
        [companyId, stamp, period.id, version.id],
      );
      const [evaluation] = await q.query(
        "INSERT INTO phase4_evaluations(company_id,cycle_id,employee_id,manager_employee_id,scorecard_id,template_version_id,organization_snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,'{}',1) RETURNING id",
        [companyId, cycle.id, employee.id, manager.id, card.id, version.id],
      );
      evaluationId = Number(evaluation.id);
    });
    afterEach(async () => {
      await q.rollbackTransaction();
      await q.release();
    });
    it('keeps one original evaluation per employee and cycle', async () => {
      await q.query('SAVEPOINT duplicate');
      await expect(
        q.query(
          'INSERT INTO phase4_evaluations(company_id,cycle_id,employee_id,manager_employee_id,scorecard_id,template_version_id,organization_snapshot,created_by) SELECT company_id,cycle_id,employee_id,manager_employee_id,scorecard_id,template_version_id,organization_snapshot,created_by FROM phase4_evaluations WHERE id=$1',
          [evaluationId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await q.query('ROLLBACK TO SAVEPOINT duplicate');
    });
    it('protects published template versions and final result snapshots', async () => {
      await q.query('SAVEPOINT template_change');
      await expect(
        q.query(
          "UPDATE phase4_evaluation_template_versions SET name='Changed' WHERE id=$1",
          [templateVersionId],
        ),
      ).rejects.toThrow('immutable');
      await q.query('ROLLBACK TO SAVEPOINT template_change');
      await q.query(
        "UPDATE phase4_evaluations SET status='finalized',final_snapshot=$1,finalized_at=now() WHERE id=$2",
        [JSON.stringify({ score: '88' }), evaluationId],
      );
      await q.query('SAVEPOINT snapshot_change');
      await expect(
        q.query('UPDATE phase4_evaluations SET final_snapshot=$1 WHERE id=$2', [
          JSON.stringify({ score: '90' }),
          evaluationId,
        ]),
      ).rejects.toThrow('immutable');
      await q.query('ROLLBACK TO SAVEPOINT snapshot_change');
      await q.query(
        "UPDATE phase4_evaluations SET ack_status='disputed',ack_at=now() WHERE id=$1",
        [evaluationId],
      );
    });
    it('preserves revision and event history', async () => {
      const [revision] = await q.query(
        "INSERT INTO phase4_evaluation_revisions(company_id,evaluation_id,section,revision,data,created_by) VALUES($1,$2,'self',1,'{}',1) RETURNING id",
        [companyId, evaluationId],
      );
      const [event] = await q.query(
        "INSERT INTO phase4_evaluation_events(company_id,evaluation_id,action,actor_id) VALUES($1,$2,'self_saved',1) RETURNING id",
        [companyId, evaluationId],
      );
      await q.query('SAVEPOINT revision_change');
      await expect(
        q.query('DELETE FROM phase4_evaluation_revisions WHERE id=$1', [
          revision.id,
        ]),
      ).rejects.toThrow('append-only');
      await q.query('ROLLBACK TO SAVEPOINT revision_change');
      await q.query('SAVEPOINT event_change');
      await expect(
        q.query('DELETE FROM phase4_evaluation_events WHERE id=$1', [event.id]),
      ).rejects.toThrow('append-only');
      await q.query('ROLLBACK TO SAVEPOINT event_change');
    });
  },
);
