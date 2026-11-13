import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createAppDataSourceOptions } from '../../../database/typeorm-options';
import { loadCommandEnv } from '../../../database/load-command-env';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { KpiService } from './kpi.service';
import {
  KpiAssignment,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
} from './kpi.entities';
import {
  Scorecard,
  ScorecardTemplate,
  ScorecardVersion,
  ScoringPolicy,
  ScoringPolicyVersion,
} from './scorecard.entities';
import { ScorecardService } from './scorecard.service';

const localOnly =
  process.env.DB_NAME === 'hrms_kpi_dev_test' &&
  ['localhost', '127.0.0.1', '::1'].includes(
    process.env.DB_HOST ?? 'localhost',
  );
(localOnly ? describe : describe.skip)(
  'Phase 2 scorecard disposable PostgreSQL integration',
  () => {
    let db: DataSource,
      service: ScorecardService,
      companyId: number,
      employeeId: number,
      periodId: number,
      assignmentId: number,
      definitionId: number,
      targetId: number;
    let actor: AuthenticatedUser;
    const marker = `scorecard_test_${Date.now()}`;
    beforeAll(async () => {
      db = new DataSource({
        ...createAppDataSourceOptions(loadCommandEnv(process.env)),
        migrations: [],
      });
      await db.initialize();
      const [company] = await db.query(
        'INSERT INTO companies(name,slug) VALUES($1,$2) RETURNING id',
        ['Scorecard Test', marker],
      );
      companyId = Number(company.id);
      const [employee] = await db.query(
        "INSERT INTO employees(company_id,employee_no,first_name,last_name,gender,version) VALUES($1,$2,'Test','Employee','other',1) RETURNING id",
        [companyId, marker],
      );
      employeeId = Number(employee.id);
      const [period] = await db.query(
        "INSERT INTO phase1a_kpi_periods(company_id,frequency,label,start_date,end_date,created_by) VALUES($1,'monthly','Test Period','2026-01-01','2026-01-31',1) RETURNING id",
        [companyId],
      );
      periodId = Number(period.id);
      const [definition] = await db.query(
        "INSERT INTO phase1a_kpi_definitions(company_id,code,status,created_by) VALUES($1,$2,'published',1) RETURNING id",
        [companyId, marker.toUpperCase()],
      );
      definitionId = Number(definition.id);
      const [version] = await db.query(
        "INSERT INTO phase1a_kpi_definition_versions(company_id,definition_id,version,name,category,measurement_type,direction,frequency,published_at,created_by) VALUES($1,$2,1,'Test KPI','Test','numeric','higher','monthly',now(),1) RETURNING id",
        [companyId, definitionId],
      );
      const [assignment] = await db.query(
        "INSERT INTO phase1a_kpi_assignments(company_id,definition_version_id,period_id,subject_type,subject_id,organization_snapshot,status,created_by) VALUES($1,$2,$3,'employee',$4,'{}','active',1) RETURNING id",
        [companyId, version.id, periodId, employeeId],
      );
      assignmentId = Number(assignment.id);
      const [target] = await db.query(
        "INSERT INTO phase1a_kpi_target_revisions(company_id,assignment_id,revision,target,reason,changed_by) VALUES($1,$2,1,$3,'Initial',1) RETURNING id",
        [companyId, assignmentId, JSON.stringify({ value: 100 })],
      );
      targetId = Number(target.id);
      actor = {
        id: 1,
        email: 'scorecard@example.invalid',
        scope: 'company',
        userType: 'COMPANY_USER',
        companyId,
        companyMembershipId: 1,
        roles: ['COMPANY_ADMIN'],
        permissions: ['data_scope:company'],
      };
      const access = {
        ensureActorCompanyId: (a: AuthenticatedUser) => {
          if (!a.companyId) throw new ForbiddenException();
          return a.companyId;
        },
        hasCompanyScope: (a: AuthenticatedUser) =>
          a.permissions.includes('data_scope:company'),
      } as HrAccessService;
      const kpi = {
        scorecardSubject: async (
          a: AuthenticatedUser,
          type: string,
          id: number,
        ) => {
          if (
            a.companyId !== companyId ||
            type !== 'employee' ||
            id !== employeeId
          )
            throw new ForbiddenException();
          return { employeeId: id };
        },
        getAssignment: async (a: AuthenticatedUser, id: number) => {
          if (a.companyId !== companyId || id !== assignmentId)
            throw new ForbiddenException();
          const assignment = await db
            .getRepository(KpiAssignment)
            .findOneByOrFail({ id, companyId });
          const definitionVersion = await db
            .getRepository(KpiDefinitionVersion)
            .findOneByOrFail({ id: assignment.definitionVersionId, companyId });
          const currentTarget = await db
            .getRepository(KpiTargetRevision)
            .findOneByOrFail({ id: targetId, companyId });
          const period = await db
            .getRepository(KpiPeriod)
            .findOneByOrFail({ id: periodId, companyId });
          return { ...assignment, definitionVersion, currentTarget, period };
        },
      } as unknown as KpiService;
      service = new ScorecardService(
        db,
        db.getRepository(Scorecard),
        db.getRepository(ScorecardVersion),
        db.getRepository(ScoringPolicy),
        db.getRepository(ScoringPolicyVersion),
        db.getRepository(ScorecardTemplate),
        db.getRepository(KpiAssignment),
        db.getRepository(KpiDefinitionVersion),
        db.getRepository(KpiTargetRevision),
        db.getRepository(KpiPeriod),
        kpi,
        access,
      );
    });
    afterAll(async () => {
      if (!db?.isInitialized) return;
      try {
        for (const table of [
          'phase2_scorecard_versions',
          'phase2_scorecards',
          'phase2_scorecard_templates',
          'phase2_scoring_policy_versions',
          'phase2_scoring_policies',
          'phase1a_kpi_target_revisions',
          'phase1a_kpi_assignments',
          'phase1a_kpi_definition_versions',
          'phase1a_kpi_definitions',
          'phase1a_kpi_periods',
          'employees',
          'companies',
        ])
          await db.query(
            `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'} = $1`,
            [companyId],
          );
      } finally {
        await db.destroy();
      }
    });
    it('persists a draft with pinned definition and target versions and edits it', async () => {
      const created = await service.create(actor, {
        code: marker.toUpperCase(),
        name: 'Test scorecard',
        subjectType: 'employee',
        subjectId: employeeId,
        periodId,
        mode: 'weighted',
        entries: [{ assignmentId, weight: '100', required: true }],
      });
      expect(created.currentVersion.version).toBe(1);
      expect(created.currentVersion.entries[0]).toMatchObject({
        assignmentId,
        definitionVersionId: expect.any(Number),
        targetRevisionId: targetId,
      });
      expect(created.entries[0]).toMatchObject({
        kpiName: 'Test KPI',
        target: { value: 100 },
        actual: null,
        status: 'awaiting_data',
      });
      const saved = await service.updateDraft(actor, created.id, {
        name: 'Updated card',
        mode: 'weighted',
        entries: [{ assignmentId, weight: '100', required: true }],
      });
      expect(saved.currentVersion.name).toBe('Updated card');
      const persisted = await db
        .getRepository(ScorecardVersion)
        .findOneByOrFail({ scorecardId: created.id });
      expect(persisted.name).toBe('Updated card');
    });
    it('rejects duplicate entries, foreign subjects and nonzero strategic weights', async () => {
      await expect(
        service.create(actor, {
          code: `${marker}_D`,
          name: 'Duplicate',
          subjectType: 'employee',
          subjectId: employeeId,
          periodId,
          mode: 'weighted',
          entries: [
            { assignmentId, weight: '50' },
            { assignmentId, weight: '50' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(actor, {
          code: `${marker}_F`,
          name: 'Foreign',
          subjectType: 'employee',
          subjectId: employeeId + 9999,
          periodId,
          mode: 'weighted',
          entries: [{ assignmentId, weight: '100' }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.create(actor, {
          code: `${marker}_S`,
          name: 'Strategic',
          subjectType: 'employee',
          subjectId: employeeId,
          periodId,
          mode: 'strategic',
          entries: [{ assignmentId, weight: '20' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('calculates an example preview without persisting achievements', async () => {
      const card = (await service.list(actor)).find(
        (row) => row.code === marker.toUpperCase(),
      );
      expect(card).toBeDefined();
      const result = await service.preview(actor, card!.id, {
        examples: [{ assignmentId, actual: 90 }],
      });
      expect(result).toMatchObject({
        overallScore: '90',
        exampleOnly: true,
        persisted: false,
      });
      const assignments = await db
        .getRepository(KpiAssignment)
        .findBy({ companyId });
      expect(assignments).toHaveLength(1);
    });
  },
);
