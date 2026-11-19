import { ForbiddenException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
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

describe('KPI definition creation access', () => {
  let service: KpiService;
  let transaction: jest.Mock;
  const definition = {
    code: 'KPI_TEST',
    name: 'Test KPI',
    category: 'Sales',
    measurementType: 'numeric' as const,
    direction: 'higher' as const,
    frequency: 'monthly' as const,
  };
  const base: AuthenticatedUser = {
    id: 1,
    email: 'manager@example.invalid',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 3,
    companyMembershipId: 4,
    roles: [],
    permissions: [],
  };

  beforeEach(() => {
    let nextId = 1;
    const manager = {
      create: (_entity: unknown, value: object) => value,
      save: async (_entity: unknown, value: object) => ({
        ...value,
        id: nextId++,
      }),
    };
    transaction = jest.fn(
      async (task: (manager: typeof manager) => Promise<unknown>) =>
        task(manager),
    );
    const unused = {} as Repository<never>;
    service = new KpiService(
      { transaction } as unknown as DataSource,
      unused as Repository<KpiDefinition>,
      unused as Repository<KpiDefinitionVersion>,
      unused as Repository<KpiTemplate>,
      unused as Repository<KpiPeriod>,
      unused as Repository<KpiAssignment>,
      unused as Repository<KpiTargetRevision>,
      unused,
      unused,
      unused,
      unused,
      unused as unknown as HrAccessService,
      unused as never,
    );
    Object.defineProperty(service, 'access', {
      value: {
        ensureActorCompanyId: (actor: AuthenticatedUser) => {
          if (actor.scope !== 'company' || !actor.companyId)
            throw new ForbiddenException('Active company context is required');
          return actor.companyId;
        },
      },
    });
  });

  it('creates a draft for a department manager', async () => {
    await expect(
      service.createDefinition(
        { ...base, roles: ['DEPARTMENT_MANAGER'] },
        definition,
      ),
    ).resolves.toMatchObject({ code: 'KPI_TEST', status: 'draft' });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a draft for a role granted KPI creation permission', async () => {
    await expect(
      service.createDefinition(
        { ...base, roles: ['CUSTOM'], permissions: ['kpi_definitions:create'] },
        definition,
      ),
    ).resolves.toMatchObject({ code: 'KPI_TEST', status: 'draft' });
  });

  it('rejects an employee without KPI creation access', async () => {
    await expect(
      service.createDefinition({ ...base, roles: ['EMPLOYEE'] }, definition),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
