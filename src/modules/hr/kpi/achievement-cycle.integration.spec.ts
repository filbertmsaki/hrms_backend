import { DataSource, QueryRunner } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { createAppDataSourceOptions } from '../../../database/typeorm-options';
import { loadCommandEnv } from '../../../database/load-command-env';
import { AchievementService } from './achievement.service';
import {
  KpiAchievement,
  KpiAchievementRevision,
  KpiAchievementEvidence,
  KpiAchievementEvent,
  KpiAchievementActivity,
  KpiAchievementActivityEvidence,
  KpiEvidenceRule,
} from './achievement.entities';
import {
  KpiAssignment,
  KpiDefinitionVersion,
  KpiTargetRevision,
} from './kpi.entities';
import { ScorecardVersion, ScoringPolicyVersion } from './scorecard.entities';
import { DEFAULT_SCORING_CONFIG, scoreMetric } from './scorecard-scoring';

const disposable =
  process.env.DB_NAME === 'hrms_kpi_dev_test' &&
  ['localhost', '127.0.0.1', '::1'].includes(
    process.env.DB_HOST ?? 'localhost',
  );
(disposable ? describe : describe.skip)(
  'achievement review cycle on disposable PostgreSQL',
  () => {
    let db: DataSource;
    let runner: QueryRunner;
    let companyId: number;
    let service: AchievementService;
    let assignmentId: number;
    let employee: any, manager: any, otherManager: any, hr: any;
    const marker = `kpi_cycle_${Date.now()}`;

    beforeAll(async () => {
      db = new DataSource({
        ...createAppDataSourceOptions(loadCommandEnv(process.env)),
        migrations: [],
      });
      await db.initialize();
      runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      db.query = runner.query.bind(runner) as typeof db.query;
      db.getRepository = runner.manager.getRepository.bind(
        runner.manager,
      ) as typeof db.getRepository;
      db.transaction = (async (callback: any) =>
        callback(runner.manager)) as typeof db.transaction;
      const [company] = await db.query(
        'INSERT INTO companies(name,slug) VALUES($1,$2) RETURNING id',
        ['KPI cycle test', marker],
      );
      companyId = Number(company.id);
      const [person] = await db.query(
        "INSERT INTO employees(company_id,employee_no,first_name,last_name,gender,version) VALUES($1,$2,'Test','Employee','other',1) RETURNING id",
        [companyId, marker],
      );
      const employeeId = Number(person.id);
      const [managerPerson] = await db.query(
        "INSERT INTO employees(company_id,employee_no,first_name,last_name,gender,version) VALUES($1,$2,'Test','Manager','other',1) RETURNING id",
        [companyId, `${marker}_manager`],
      );
      const [period] = await db.query(
        "INSERT INTO phase1a_kpi_periods(company_id,frequency,label,start_date,end_date,created_by) VALUES($1,'monthly','Test','2028-01-01','2028-01-31',1) RETURNING id",
        [companyId],
      );
      const [definition] = await db.query(
        "INSERT INTO phase1a_kpi_definitions(company_id,code,status,created_by) VALUES($1,$2,'published',1) RETURNING id",
        [companyId, marker.toUpperCase()],
      );
      const [version] = await db.query(
        "INSERT INTO phase1a_kpi_definition_versions(company_id,definition_id,version,name,category,measurement_type,direction,frequency,published_at,created_by) VALUES($1,$2,1,'Test KPI','Test','numeric','higher','monthly',now(),1) RETURNING id",
        [companyId, definition.id],
      );
      const [assignment] = await db.query(
        "INSERT INTO phase1a_kpi_assignments(company_id,definition_version_id,period_id,subject_type,subject_id,organization_snapshot,status,created_by) VALUES($1,$2,$3,'employee',$4,'{}','active',1) RETURNING id",
        [companyId, version.id, period.id, employeeId],
      );
      assignmentId = Number(assignment.id);
      await db.query(
        "INSERT INTO phase1a_kpi_target_revisions(company_id,assignment_id,revision,target,reason,changed_by) VALUES($1,$2,1,$3,'Initial',1)",
        [companyId, assignmentId, JSON.stringify({ value: 20 })],
      );
      const base = {
        scope: 'company',
        userType: 'COMPANY_USER',
        companyId,
        companyMembershipId: 1,
        permissions: ['data_scope:company'],
      };
      employee = { ...base, id: 101, employeeId, roles: ['EMPLOYEE'] };
      manager = {
        ...base,
        id: 102,
        employeeId: Number(managerPerson.id),
        roles: ['DEPARTMENT_MANAGER'],
      };
      otherManager = { ...manager, id: 103, employeeId: employeeId + 1000001 };
      hr = {
        ...base,
        id: 104,
        employeeId: employeeId + 1000002,
        roles: ['HR_MANAGER'],
      };
      await db
        .getRepository(KpiAssignment)
        .update(assignmentId, { managerEmployeeId: manager.employeeId });
      const kpi = {
        getAssignment: async () =>
          db.getRepository(KpiAssignment).findOneByOrFail({ id: assignmentId }),
        personalAssignments: async () => [
          await db
            .getRepository(KpiAssignment)
            .findOneByOrFail({ id: assignmentId }),
        ],
      };
      const access = {
        ensureActorCompanyId: (actor: any) => actor.companyId,
        hasCompanyScope: (actor: any) =>
          actor.permissions.includes('data_scope:company'),
      };
      service = new AchievementService(
        db,
        db.getRepository(KpiAchievement),
        db.getRepository(KpiAchievementRevision),
        db.getRepository(KpiAchievementEvidence),
        db.getRepository(KpiAchievementEvent),
        db.getRepository(KpiAchievementActivity),
        db.getRepository(KpiAchievementActivityEvidence),
        db.getRepository(KpiEvidenceRule),
        db.getRepository(KpiAssignment),
        db.getRepository(KpiDefinitionVersion),
        db.getRepository(KpiTargetRevision),
        db.getRepository(ScorecardVersion),
        db.getRepository(ScoringPolicyVersion),
        kpi as any,
        access as any,
        {} as any,
        { completeAllOpenForEntity: async () => undefined } as any,
        {} as any,
      );
    });

    afterAll(async () => {
      if (!db?.isInitialized) return;
      try {
        if (runner?.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        await runner?.release();
        await db.destroy();
      }
    });

    it('returns, corrects and approves a result with scoped reviewers', async () => {
      let result = await service.create(employee, { assignmentId, actual: 10 });
      result = await service.addActivity(employee, result.id, {
        activityDate: '2028-01-10',
        title: 'Work',
        details: 'Completed',
        measurableResult: 10,
      });
      result = await service.submit(
        employee,
        result.id,
        result.current!.rowVersion,
      );
      await expect(
        service.decide(otherManager, result.id, 'approved', {
          rowVersion: result.current!.rowVersion,
        }),
      ).rejects.toThrow(ForbiddenException);
      result = await service.decide(manager, result.id, 'returned', {
        rowVersion: result.current!.rowVersion,
        comments: 'Please correct the result',
      });
      expect(result.current?.status).toBe('returned');
      result = await service.create(employee, { assignmentId, actual: 15 });
      expect(result.current?.revision).toBe(2);
      expect(result.current?.activities).toHaveLength(1);
      result = await service.submit(
        employee,
        result.id,
        result.current!.rowVersion,
      );
      result = await service.decide(hr, result.id, 'approved', {
        rowVersion: result.current!.rowVersion,
      });
      expect(result.approvedRevisionId).toBe(result.current?.id);
      expect(result.current?.actual).toBe(15);
      expect(
        scoreMetric(
          {
            entryId: 1,
            weight: '100',
            required: true,
            type: 'numeric',
            direction: 'higher',
            target: { value: 20 },
            actual: result.current?.actual,
          },
          DEFAULT_SCORING_CONFIG,
        ).scoredAchievement,
      ).toBe('75');
    });
  },
);
