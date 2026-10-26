import { WorkActivityReportingService } from './work-activity-reporting.service';
import { DailyActivityReportStatusEnum } from '../enums/work-activity.enums';

describe('WorkActivityReportingService', () => {
  const employees = [
    {
      id: 1,
      company_id: 7,
      employee_no: 'E1',
      first_name: 'Ada',
      middle_name: null,
      last_name: 'One',
      primary_department_id: 10,
    },
    {
      id: 2,
      company_id: 7,
      employee_no: 'E2',
      first_name: 'Ben',
      middle_name: null,
      last_name: 'Two',
      primary_department_id: 20,
    },
  ];
  const reports = [
    {
      id: 80,
      companyId: 7,
      employeeId: 1,
      activityDate: '2026-10-22',
      status: DailyActivityReportStatusEnum.SUBMITTED,
    },
    {
      id: 99,
      companyId: 999,
      employeeId: 2,
      activityDate: '2026-10-22',
      status: DailyActivityReportStatusEnum.APPROVED,
    },
  ];
  const departmentHistory = [
    {
      employee_id: 1,
      department_id: 30,
      effective_from: '2026-10-23',
      effective_to: null,
      is_primary: true,
    },
  ];
  const employeeRepository = { createQueryBuilder: jest.fn() };
  const departmentRepository = { findOne: jest.fn(), find: jest.fn() };
  const historyRepository = { createQueryBuilder: jest.fn() };
  const reportRepository = { createQueryBuilder: jest.fn() };
  const entryRepository = { find: jest.fn().mockResolvedValue([]) };
  const hrAccessService = {
    ensureActorCompanyId: jest.fn(),
    getAccessibleEmployeeIds: jest.fn(),
  };
  const eligibilityService = { evaluate: jest.fn() };
  let service: WorkActivityReportingService;

  function queryBuilder<T>(getMany: () => T) {
    const builder: Record<string, jest.Mock> = {};
    for (const method of [
      'where',
      'andWhere',
      'orderBy',
      'select',
      'addSelect',
      'leftJoin',
    ]) {
      builder[method] = jest.fn(() => builder);
    }
    builder.getMany = jest.fn(getMany);
    return builder;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkActivityReportingService(
      hrAccessService as never,
      eligibilityService as never,
      employeeRepository as never,
      departmentRepository as never,
      historyRepository as never,
      reportRepository as never,
      entryRepository as never,
    );
    hrAccessService.ensureActorCompanyId.mockReturnValue(7);
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue(null);
    employeeRepository.createQueryBuilder.mockReturnValue(
      queryBuilder(() => {
        const departmentFilter =
          employeeRepository.createQueryBuilder.mock.results[0]?.value?.andWhere?.mock.calls?.find(
            (call: unknown[]) =>
              String(call[0]).includes(
                'employee_department_assignment_history',
              ),
          );
        return departmentFilter
          ? employees.filter((employee) => employee.id === 2)
          : employees;
      }),
    );
    reportRepository.createQueryBuilder.mockReturnValue(
      queryBuilder(() => reports.filter((report) => report.companyId === 7)),
    );
    historyRepository.createQueryBuilder.mockReturnValue(
      queryBuilder(() =>
        departmentHistory.filter((entry) => entry.employee_id === 1),
      ),
    );
    departmentRepository.findOne.mockResolvedValue({ id: 20, company_id: 7 });
    departmentRepository.find.mockResolvedValue([
      { id: 10, name: 'Sales' },
      { id: 20, name: 'Operations' },
      { id: 30, name: 'Field' },
    ]);
    eligibilityService.evaluate.mockResolvedValue({
      eligible: true,
      isWorkday: true,
      isOffDay: false,
      isHoliday: false,
      hasApprovedLeave: false,
    });
  });

  it('includes missing report rows, applies historical department attribution, and reconciles totals before pagination', async () => {
    const result = await service.getDepartmentSummary(
      { companyId: 7, permissions: ['data_scope:company'] } as never,
      {
        date_from: '2026-10-22',
        date_to: '2026-10-23',
        page: 1,
        limit: 1,
      },
    );

    expect(result.totals).toEqual({
      eligible_employee_days: 4,
      submitted_reports: 1,
      pending_reports: 3,
    });
    expect(result.meta).toEqual({
      page: 1,
      limit: 1,
      total: 3,
      total_pages: 3,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      department_name: 'Field',
      eligible_employee_days: 1,
      submitted_reports: 0,
      pending_reports: 1,
    });
    expect(eligibilityService.evaluate).toHaveBeenCalledTimes(4);
    expect(reportRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('reconciles assigned, completed, and open activity entries into employee-day rows', async () => {
    entryRepository.find.mockResolvedValue([
      {
        id: 1,
        dailyActivityReportId: 80,
        origin: 'ASSIGNED',
        status: 'COMPLETED',
      },
      {
        id: 2,
        dailyActivityReportId: 80,
        origin: 'ASSIGNED',
        status: 'IN_PROGRESS',
      },
      {
        id: 3,
        dailyActivityReportId: 80,
        origin: 'SELF_CREATED',
        status: 'CANCELLED',
      },
    ]);

    const { rows } = await service['buildRows'](
      { companyId: 7, permissions: ['data_scope:company'] } as never,
      { date_from: '2026-10-22', date_to: '2026-10-22' },
    );

    expect(rows.find((row) => row.employee_id === 1)).toMatchObject({
      activity_entry_count: 3,
      assigned_task_count: 2,
      completed_task_count: 1,
      open_task_count: 1,
    });
    expect(entryRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 7 }),
      }),
    );
  });

  it('filters pending data by company-owned department and returns rows with no report', async () => {
    const result = await service.getPendingReports(
      { companyId: 7, permissions: ['data_scope:company'] } as never,
      {
        date_from: '2026-10-22',
        date_to: '2026-10-22',
        department_id: 20,
      },
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      employee_id: 2,
      report_status: 'MISSING',
      department_id: 20,
    });
    expect(result.totals).toEqual({
      eligible_employee_days: 1,
      pending_reports: 1,
    });
    expect(
      employeeRepository.createQueryBuilder.mock.results[0].value.andWhere,
    ).toHaveBeenCalledWith(
      expect.stringContaining('employee_department_assignment_history'),
      expect.objectContaining({ departmentId: 20, companyId: 7 }),
    );
  });

  it('enforces company isolation when a department filter points to another tenant', async () => {
    departmentRepository.findOne.mockResolvedValue(null);
    const result = await service.getPendingReports(
      { companyId: 7, permissions: ['data_scope:company'] } as never,
      {
        date_from: '2026-10-22',
        department_id: 999,
      },
    );
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('rejects invalid, reversed, or excessively broad date filters', async () => {
    const actor = {
      companyId: 7,
      permissions: ['data_scope:company'],
    } as never;
    await expect(
      service.getPendingReports(actor, { date_from: '2026-02-30' }),
    ).rejects.toThrow('invalid');
    await expect(
      service.getPendingReports(actor, {
        date_from: '2026-10-24',
        date_to: '2026-10-22',
      }),
    ).rejects.toThrow('invalid');
    await expect(
      service.getPendingReports(actor, {
        date_from: '2025-01-01',
        date_to: '2026-10-23',
      }),
    ).rejects.toThrow('367');
  });
});
