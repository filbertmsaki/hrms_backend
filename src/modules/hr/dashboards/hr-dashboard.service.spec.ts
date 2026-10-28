import { HrDashboardService } from './hr-dashboard.service';
import { AccessibleEmployeeSqlScope } from '../shared/hr-access.service';
import { buildDashboardEmployeeSubquery } from './dashboard-employee-scope';
import { EmployeeDocumentRequirement } from './entities/employee-document-requirement.entity';

describe('HrDashboardService SQL employee scope', () => {
  function buildScope(
    companyId: number,
    filters: {
      branch_id?: number;
      department_id?: number;
      employee_id?: number;
    },
    scope: AccessibleEmployeeSqlScope,
  ) {
    return buildDashboardEmployeeSubquery(companyId, filters, scope);
  }

  it('intersects self, branch, department, team and requested primary filters', () => {
    const scope = buildScope(
      10,
      { branch_id: 4, department_id: 8 },
      {
        companyWide: false,
        actorEmployeeId: 21,
        branchIds: [4, 5],
        departmentIds: [8],
        managerEmployeeId: 21,
      },
    );

    expect(scope.sql).toContain('employee_scope.company_id = :scopeCompanyId');
    expect(scope.sql).toContain('employee_scope.id = :scopeActorEmployeeId');
    expect(scope.sql).toContain('employee_scope.primary_branch_id IN');
    expect(scope.sql).toContain('employee_scope.primary_department_id IN');
    expect(scope.sql).toContain('WITH RECURSIVE accessible_reports');
    expect(scope.sql).toContain(
      'employee_scope.primary_branch_id = :filterBranchId',
    );
    expect(scope.sql).toContain(
      'employee_scope.primary_department_id = :filterDepartmentId',
    );
    expect(scope.params).toEqual({
      scopeCompanyId: 10,
      scopeActorEmployeeId: 21,
      scopeBranchIds: [4, 5],
      scopeDepartmentIds: [8],
      scopeManagerEmployeeId: 21,
      filterBranchId: 4,
      filterDepartmentId: 8,
    });
  });

  it('makes a non-company actor with no grants resolve to an empty scope', () => {
    const scope = buildScope(
      10,
      {},
      {
        companyWide: false,
        actorEmployeeId: null,
        branchIds: [],
        departmentIds: [],
        managerEmployeeId: null,
      },
    );
    expect(scope.sql).toContain('AND FALSE');
    expect(scope.params).toEqual({ scopeCompanyId: 10 });
  });

  it('keeps an employee filter conjunctive with company and access scope', () => {
    const scope = buildScope(
      10,
      { employee_id: 43 },
      {
        companyWide: false,
        actorEmployeeId: null,
        branchIds: [4],
        departmentIds: [],
        managerEmployeeId: null,
      },
    );

    expect(scope.sql).toContain('employee_scope.company_id = :scopeCompanyId');
    expect(scope.sql).toContain('employee_scope.primary_branch_id IN');
    expect(scope.sql).toContain('employee_scope.id = :filterEmployeeId');
    expect(scope.params).toMatchObject({
      scopeCompanyId: 10,
      scopeBranchIds: [4],
      filterEmployeeId: 43,
    });
  });
});

describe('HrDashboardService employee document inventory', () => {
  function buildService(counts: Record<string, string>) {
    const query: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'innerJoin',
      'where',
      'andWhere',
      'setParameters',
      'groupBy',
      'addGroupBy',
    ]) {
      query[method] = jest.fn().mockReturnValue(query);
    }
    query.getRawOne = jest.fn().mockResolvedValue(counts);
    query.getRawMany = jest.fn().mockResolvedValue([]);
    const documentRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const employeeRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const documentRequirementRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const service = Object.assign(Object.create(HrDashboardService.prototype), {
      documentRepository,
      employeeRepository,
      documentRequirementRepository,
    }) as unknown as {
      getDocumentInventory(
        companyId: number,
        employeeScope: { sql: string; params: Record<string, unknown> },
        asOfDate: string,
      ): Promise<Record<string, unknown>>;
    };
    return {
      service,
      documentRepository,
      documentRequirementRepository,
      query,
    };
  }

  const scoped = {
    sql: 'SELECT employee_scope.id FROM employees employee_scope WHERE employee_scope.id IN (:...scopeIds)',
    params: { scopeIds: [21, 22] },
  };

  it('aggregates document inventory and expiry by company-local as-of date', async () => {
    const { service, query } = buildService({
      total_documents: '12',
      verified_documents: '8',
      expired_documents: '3',
      verified_expired_documents: '2',
      expiring_within_30_days: '4',
      verified_unexpired_documents: '6',
    });

    await expect(
      service.getDocumentInventory(10, scoped, '2026-10-27'),
    ).resolves.toEqual({
      total_documents: 12,
      verified_documents: 8,
      unverified_documents: 4,
      expired_documents: 3,
      verified_expired_documents: 2,
      expiring_within_30_days: 4,
      verified_unexpired_documents: 6,
      compliance: {
        available: false,
        reason: 'REQUIREMENT_CATALOG_NOT_CONFIGURED',
        applicable_requirement_count: 0,
        compliant_requirement_count: 0,
        non_compliant_requirement_count: 0,
        compliance_rate: null,
        requirements: [],
      },
      configured_requirements: [],
    });
    expect(query.setParameters).toHaveBeenCalledWith({
      asOfDate: '2026-10-27',
      expiryWindowEndDate: '2026-11-26',
    });
    expect(query.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('document.expiry_date::date < :asOfDate'),
      'expired_documents',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'document.entity_id IN (SELECT employee_scope.id FROM employees employee_scope WHERE employee_scope.id IN (:...scopeIds))',
    );
    expect(query.setParameters).toHaveBeenCalledWith({ scopeIds: [21, 22] });
  });

  it('returns zero inventory for an empty SQL scope', async () => {
    const { service, documentRepository, query } = buildService({
      total_documents: '0',
      verified_documents: '0',
      expired_documents: '0',
      verified_expired_documents: '0',
      expiring_within_30_days: '0',
      verified_unexpired_documents: '0',
    });
    await expect(
      service.getDocumentInventory(
        10,
        { sql: 'SELECT id FROM employees WHERE FALSE', params: {} },
        '2026-10-27',
      ),
    ).resolves.toMatchObject({ total_documents: 0 });
    expect(documentRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(query.andWhere).toHaveBeenCalledWith(
      'document.entity_id IN (SELECT id FROM employees WHERE FALSE)',
    );
  });

  it('keeps company-wide inventory company-filtered in SQL without an ID list', async () => {
    const { service, query } = buildService({
      total_documents: '3',
      verified_documents: '2',
      expired_documents: '0',
      verified_expired_documents: '0',
      expiring_within_30_days: '1',
      verified_unexpired_documents: '2',
    });

    await expect(
      service.getDocumentInventory(
        10,
        {
          sql: 'SELECT employee_scope.id FROM employees employee_scope WHERE employee_scope.company_id = :scopeCompanyId',
          params: { scopeCompanyId: 10 },
        },
        '2026-10-27',
      ),
    ).resolves.toMatchObject({ total_documents: 3 });
    expect(query.where).toHaveBeenCalledWith(
      'document.company_id = :companyId',
      { companyId: 10 },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee_scope.company_id = :scopeCompanyId'),
    );
  });

  it('calculates compliance per applicable employee and requires verified unexpired matches', async () => {
    const query: Record<string, jest.Mock> = {};
    for (const method of [
      'innerJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'setParameters',
      'groupBy',
      'addGroupBy',
    ]) {
      query[method] = jest.fn().mockReturnValue(query);
    }
    query.getRawMany = jest.fn().mockResolvedValue([
      {
        requirement_id: '3',
        document_type_code: 'NATIONAL_ID',
        label: 'National ID',
        applicable_employee_count: '4',
        compliant_employee_count: '2',
        missing_document_employee_count: '1',
        expired_document_employee_count: '1',
        unverified_document_employee_count: '1',
      },
    ]);
    const service = Object.assign(Object.create(HrDashboardService.prototype), {
      employeeRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(query),
      },
    }) as HrDashboardService;
    const scope = {
      sql: 'SELECT employee_scope.id FROM employees employee_scope WHERE employee_scope.company_id = :scopeCompanyId AND employee_scope.primary_branch_id = ANY(:scopeBranchIds)',
      params: { scopeCompanyId: 10, scopeBranchIds: [6] },
    };

    await expect(
      service['getDocumentRequirementCompliance'](10, scope, '2026-10-28'),
    ).resolves.toMatchObject({
      available: true,
      as_of_date: '2026-10-28',
      applicable_requirement_count: 4,
      compliant_requirement_count: 2,
      non_compliant_requirement_count: 2,
      compliance_rate: 50,
      requirements: [
        {
          document_type_code: 'NATIONAL_ID',
          missing_document_employee_count: 1,
          expired_document_employee_count: 1,
          unverified_document_employee_count: 1,
        },
      ],
    });
    expect(query.innerJoin).toHaveBeenCalledWith(
      EmployeeDocumentRequirement,
      'requirement',
      'requirement.company_id = employee.company_id',
    );
    expect(query.where).toHaveBeenCalledWith(
      'employee.company_id = :companyId',
      { companyId: 10 },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee.primary_branch_id'),
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee.id IN (SELECT employee_scope.id'),
    );
    expect(query.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('requirement_document.is_verified = true'),
      'compliant_employee_count',
    );
    expect(query.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCompanyId: 10,
        scopeBranchIds: [6],
        asOfDate: '2026-10-28',
      }),
    );
  });
});
