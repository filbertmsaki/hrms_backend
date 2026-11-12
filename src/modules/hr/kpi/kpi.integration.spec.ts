import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createAppDataSourceOptions } from '../../../database/typeorm-options';
import { loadCommandEnv } from '../../../database/load-command-env';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Company } from '../../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import {
  KpiAssignment,
  KpiDefinition,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
  KpiTemplate,
} from './kpi.entities';
import { KpiService } from './kpi.service';

const localOnly =
  process.env.DB_NAME === 'hrms_kpi_dev_test' &&
  ['localhost', '127.0.0.1', '::1'].includes(
    process.env.DB_HOST ?? 'localhost',
  );
(localOnly ? describe : describe.skip)(
  'Phase 1A isolated PostgreSQL integration',
  () => {
    let db: DataSource;
    let service: KpiService;
    let companyId: number;
    let otherCompanyId: number;
    let employeeId: number;
    let otherEmployeeId: number;
    let managedEmployeeId: number;
    let departmentId: number;
    let branchId: number;
    let admin: AuthenticatedUser;
    let employee: AuthenticatedUser;
    let manager: AuthenticatedUser;
    const marker = `kpi1a_${Date.now()}`;
    const definition = {
      code: `LOSS_${Date.now()}`,
      name: 'Loss ratio',
      category: 'Underwriting',
      measurementType: 'percentage' as const,
      measurementUnit: '%',
      direction: 'lower' as const,
      frequency: 'monthly' as const,
    };
    async function cleanup(ids: number[]) {
      if (!ids.length) return;
      for (const table of [
        'phase1a_kpi_target_revisions',
        'phase1a_kpi_assignments',
        'phase1a_kpi_periods',
        'phase1a_kpi_templates',
        'phase1a_kpi_definition_versions',
        'phase1a_kpi_definitions',
        'employees',
        'departments',
        'branches',
        'companies',
      ]) {
        await db.query(
          `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'} = ANY($1::int[])`,
          [ids],
        );
      }
    }

    beforeAll(async () => {
      db = new DataSource({
        ...createAppDataSourceOptions(loadCommandEnv(process.env)),
        migrations: [],
      });
      await db.initialize();
      const stale: Array<{ id: number }> = await db.query(
        "SELECT id FROM companies WHERE starts_with(slug, 'kpi1a_')",
      );
      await cleanup(stale.map((row) => Number(row.id)));
      const [company] = await db.query(
        'INSERT INTO companies(name, slug, metadata) VALUES ($1, $2, $3) RETURNING id',
        [
          'KPI Test Company',
          marker,
          JSON.stringify({ timezone: 'Africa/Dar_es_Salaam' }),
        ],
      );
      companyId = Number(company.id);
      const [other] = await db.query(
        'INSERT INTO companies(name, slug) VALUES ($1, $2) RETURNING id',
        ['KPI Other Company', `${marker}_other`],
      );
      otherCompanyId = Number(other.id);
      const [branch] = await db.query(
        'INSERT INTO branches(company_id, name) VALUES ($1, $2) RETURNING id',
        [companyId, 'KPI Test Branch'],
      );
      branchId = Number(branch.id);
      const [department] = await db.query(
        'INSERT INTO departments(company_id, branch_id, name) VALUES ($1, $2, $3) RETURNING id',
        [companyId, branchId, 'KPI Test Department'],
      );
      departmentId = Number(department.id);
      const [person] = await db.query(
        'INSERT INTO employees(company_id, employee_no, first_name, last_name, gender, version, primary_branch_id, primary_department_id) VALUES ($1,$2,$3,$4,$5,1,$6,$7) RETURNING id',
        [companyId, marker, 'Test', 'Person', 'other', branchId, departmentId],
      );
      employeeId = Number(person.id);
      const [managedPerson] = await db.query(
        'INSERT INTO employees(company_id, employee_no, first_name, last_name, gender, version, primary_branch_id, primary_department_id, reports_to) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8) RETURNING id',
        [
          companyId,
          `${marker}_managed`,
          'Managed',
          'Person',
          'other',
          branchId,
          departmentId,
          employeeId,
        ],
      );
      managedEmployeeId = Number(managedPerson.id);
      const [otherPerson] = await db.query(
        'INSERT INTO employees(company_id, employee_no, first_name, last_name, gender, version) VALUES ($1,$2,$3,$4,$5,1) RETURNING id',
        [otherCompanyId, `${marker}_other`, 'Other', 'Person', 'other'],
      );
      otherEmployeeId = Number(otherPerson.id);
      const access = {
        ensureActorCompanyId: (actor: AuthenticatedUser) => {
          if (!actor.companyId) throw new ForbiddenException();
          return actor.companyId;
        },
        hasCompanyScope: (actor: AuthenticatedUser) =>
          actor.permissions.includes('data_scope:company'),
        hasDepartmentScope: (actor: AuthenticatedUser) =>
          actor.permissions.includes('data_scope:department'),
        hasBranchScope: (actor: AuthenticatedUser) =>
          actor.permissions.includes('data_scope:branch'),
        hasTeamScope: (actor: AuthenticatedUser) =>
          actor.permissions.includes('data_scope:team'),
        getAccessibleEmployeeIds: async (actor: AuthenticatedUser) =>
          actor.permissions.includes('data_scope:company')
            ? null
            : [employeeId, managedEmployeeId],
        getAccessibleDepartmentIds: async (actor: AuthenticatedUser) =>
          actor.permissions.includes('data_scope:company')
            ? null
            : [departmentId],
        getAccessibleBranchIds: async (actor: AuthenticatedUser) =>
          actor.permissions.includes('data_scope:company') ? null : [branchId],
      } as unknown as HrAccessService;
      service = new KpiService(
        db,
        db.getRepository(KpiDefinition),
        db.getRepository(KpiDefinitionVersion),
        db.getRepository(KpiTemplate),
        db.getRepository(KpiPeriod),
        db.getRepository(KpiAssignment),
        db.getRepository(KpiTargetRevision),
        db.getRepository(Employee),
        db.getRepository(Department),
        db.getRepository(Branch),
        db.getRepository(Company),
        access,
        { broadcast: jest.fn().mockResolvedValue(undefined) } as never,
      );
      const base = {
        id: 1,
        email: 'kpi-test@example.invalid',
        scope: 'company' as const,
        userType: 'COMPANY_USER' as const,
        companyMembershipId: 1,
      };
      admin = {
        ...base,
        companyId,
        roles: ['COMPANY_ADMIN'],
        permissions: ['data_scope:company'],
      };
      manager = {
        ...base,
        id: 2,
        companyId,
        employeeId,
        roles: ['DEPARTMENT_MANAGER'],
        permissions: ['data_scope:department'],
      };
      employee = {
        ...base,
        id: 3,
        companyId,
        employeeId,
        roles: ['EMPLOYEE'],
        permissions: ['data_scope:self'],
      };
    });
    afterAll(async () => {
      if (db?.isInitialized) {
        try {
          await cleanup([companyId, otherCompanyId].filter(Boolean));
        } finally {
          await db.destroy();
        }
      }
    });

    it('persists definitions, immutable published versions, and rejects duplicate identifiers', async () => {
      const created = await service.createDefinition(admin, definition);
      expect(created.currentVersion.version).toBe(1);
      await service.updateDraft(admin, created.id, {
        ...definition,
        name: 'Updated loss ratio',
      });
      await service.publishDefinition(admin, created.id);
      await expect(
        service.updateDraft(admin, created.id, definition),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.createDefinition(admin, definition),
      ).rejects.toBeInstanceOf(ConflictException);
      const revision = await service.createRevision(admin, created.id);
      expect(revision.version).toBe(2);
      expect(
        (await service.listDefinitions(admin)).find(
          (row) => row.id === created.id,
        )?.currentVersion?.version,
      ).toBe(1);
      await expect(
        service.updateDraft(admin, created.id, {
          ...definition,
          code: `RENAMED_${marker}`,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await service.updateDraft(admin, created.id, {
        ...definition,
        name: 'Revised loss ratio',
      });
      const history = await service.getDefinition(admin, created.id);
      expect(history.versions.map((version) => version.name)).toEqual([
        'Revised loss ratio',
        'Updated loss ratio',
      ]);
      await service.publishDefinition(admin, created.id);
    });
    it('persists templates and reporting periods', async () => {
      const template = await service.createTemplate(admin, {
        ...definition,
        code: `TPL_${marker}`,
        departmentClassification: 'Underwriting',
      });
      await service.publishTemplate(admin, template.id);
      const fromTemplate = await service.createFromTemplate(
        admin,
        template.id,
        `FROM_${marker}`,
      );
      expect(fromTemplate.currentVersion.name).toBe(definition.name);
      const period = await service.createPeriod(admin, {
        frequency: 'monthly',
        label: 'November 2026',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      });
      expect(period.timezone).toBe('Africa/Dar_es_Salaam');
      expect(
        (await service.listPeriods(admin)).some((row) => row.id === period.id),
      ).toBe(true);
    });
    it('persists employee and department assignments, revisions, and personal visibility', async () => {
      const item = (await service.listDefinitions(admin)).find(
        (row) => row.code === definition.code,
      );
      const period = (await service.listPeriods(admin))[0];
      expect(item && period).toBeTruthy();
      const employeeAssignment = await service.createAssignment(admin, {
        definitionId: item!.id,
        periodId: period.id,
        subjectType: 'employee',
        subjectId: employeeId,
        target: { value: 45 },
      });
      expect(employeeAssignment.currentTarget.revision).toBe(1);
      const customAssigner = {
        ...manager,
        roles: ['TEST'],
        permissions: [
          'data_scope:department',
          'kpi_assignments:read',
          'kpi_assignments:create',
        ],
      };
      expect(
        (await service.listAssignments(customAssigner)).map((row) => row.id),
      ).toContain(employeeAssignment.id);
      const customAssignment = await service.createAssignment(customAssigner, {
        definitionId: item!.id,
        periodId: period.id,
        subjectType: 'employee',
        subjectId: managedEmployeeId,
        target: { value: 35 },
      });
      expect(customAssignment.subjectId).toBe(managedEmployeeId);
      await expect(
        service.createAssignment(customAssigner, {
          definitionId: item!.id,
          periodId: period.id,
          subjectType: 'employee',
          subjectId: otherEmployeeId,
          target: { value: 40 },
        }),
      ).rejects.toThrow();
      await expect(
        service.createAssignment(
          { ...customAssigner, permissions: ['data_scope:department'] },
          {
            definitionId: item!.id,
            periodId: period.id,
            subjectType: 'employee',
            subjectId: employeeId,
            target: { value: 40 },
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.createAssignment(admin, {
          definitionId: item!.id,
          periodId: period.id,
          subjectType: 'employee',
          subjectId: employeeId,
          target: { value: 46 },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      const departmentAssignment = await service.createAssignment(manager, {
        definitionId: item!.id,
        periodId: period.id,
        subjectType: 'department',
        subjectId: departmentId,
        target: { value: 40 },
      });
      expect(departmentAssignment.subjectType).toBe('department');
      const target = await service.reviseTarget(admin, employeeAssignment.id, {
        target: { value: 42 },
        reason: 'Approved planning revision',
      });
      expect(target.revision).toBe(2);
      expect(
        (await service.getAssignment(admin, employeeAssignment.id))
          .targetHistory,
      ).toHaveLength(2);
      expect(
        (await service.personalAssignments(employee)).map((row) => row.id),
      ).toEqual([employeeAssignment.id]);
      await expect(
        service.createAssignment(manager, {
          definitionId: item!.id,
          periodId: period.id,
          subjectType: 'employee',
          subjectId: otherEmployeeId,
          target: { value: 40 },
        }),
      ).rejects.toThrow();
      const otherActor = { ...admin, companyId: otherCompanyId };
      await expect(
        service.getAssignment(otherActor, employeeAssignment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.reviseTarget(employee, employeeAssignment.id, {
          target: { value: 41 },
          reason: 'Unauthorized',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await service.updateAssignment(admin, employeeAssignment.id, {
        status: 'inactive',
      });
      expect((await service.personalAssignments(employee))[0].status).toBe(
        'inactive',
      );
      await service.archiveDefinition(admin, item!.id);
      expect(
        (await service.getAssignment(admin, employeeAssignment.id))
          .definitionVersion?.name,
      ).toBe('Revised loss ratio');
    });
  },
);
