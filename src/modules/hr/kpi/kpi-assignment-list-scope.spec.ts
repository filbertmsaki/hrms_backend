import { BadRequestException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { Company } from '../../companies/entities/company.entity';
import type { Branch } from '../branches/entities/branch.entity';
import type { Department } from '../departments/entities/department.entity';
import type { Employee } from '../employees/entities/employee.entity';
import type { HrAccessService } from '../shared/hr-access.service';
import {
  KpiAssignment,
  KpiDefinition,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
  KpiTemplate,
} from './kpi.entities';
import { KpiService } from './kpi.service';

describe('KPI assignment list scope', () => {
  const actor = {
    id: 1,
    email: 'manager@example.invalid',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 3,
    employeeId: 9,
    roles: ['DEPARTMENT_MANAGER'],
    permissions: ['data_scope:department'],
  } as AuthenticatedUser;

  const assignments = [10, 11].map((subjectId) => ({
    id: subjectId,
    companyId: 3,
    subjectType: 'employee' as const,
    subjectId,
    managerEmployeeId: 7,
    createdBy: 1,
    organizationSnapshot: {},
  })) as KpiAssignment[];

  function createService(
    employeeLookup: (id: number) => Promise<Partial<Employee> | null>,
  ) {
    const repository = <T>(value: object) => value as Repository<T>;
    const db = {
      getRepository: () => ({ find: jest.fn().mockResolvedValue([]) }),
    } as unknown as DataSource;
    const access = {
      ensureActorCompanyId: () => 3,
      hasCompanyScope: () => false,
      getAccessibleEmployeeIds: async () => [11],
      getAccessibleDepartmentIds: async () => [5],
    } as unknown as HrAccessService;
    return new KpiService(
      db,
      repository<KpiDefinition>({}),
      repository<KpiDefinitionVersion>({
        findOneBy: jest.fn().mockResolvedValue(null),
      }),
      repository<KpiTemplate>({}),
      repository<KpiPeriod>({ findOneBy: jest.fn().mockResolvedValue(null) }),
      repository<KpiAssignment>({
        find: jest.fn().mockResolvedValue(assignments),
      }),
      repository<KpiTargetRevision>({
        findOne: jest.fn().mockResolvedValue(null),
      }),
      repository<Employee>({
        findOneBy: ({ id }: { id: number }) => employeeLookup(id),
      }),
      repository<Department>({}),
      repository<Branch>({}),
      repository<Company>({}),
      access,
      {} as never,
      {} as never,
    );
  }

  it('keeps a manager dashboard usable when a previous subject left the company', async () => {
    const service = createService(async (id) =>
      id === 11 ? { id, company_id: 3, primary_department_id: 5 } : null,
    );
    const rows = await service.listAssignments(actor);
    expect(rows.map((row) => row.id)).toEqual([11]);
  });

  it('still reports unrelated subject lookup errors', async () => {
    const service = createService(async () => {
      throw new BadRequestException('Unexpected employee lookup failure');
    });
    await expect(service.listAssignments(actor)).rejects.toThrow(
      'Unexpected employee lookup failure',
    );
  });
});
