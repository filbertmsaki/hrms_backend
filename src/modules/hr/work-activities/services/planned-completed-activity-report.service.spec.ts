import { PlannedCompletedActivityReportService } from './planned-completed-activity-report.service';
import { DailyActivityStatusEnum as Status } from '../enums/work-activity.enums';

describe('PlannedCompletedActivityReportService', () => {
  const reportRepository = { createQueryBuilder: jest.fn() };
  const employeeRepository = { find: jest.fn() };
  const entryRepository = { find: jest.fn() };
  const departmentHistoryRepository = { find: jest.fn() };
  const hrAccessService = {
    ensureActorCompanyId: jest.fn(),
    getAccessibleEmployeeIds: jest.fn(),
  };
  let service: PlannedCompletedActivityReportService;

  const report = {
    id: 50,
    companyId: 7,
    employeeId: 2,
    activityDate: '2026-10-20',
    status: 'APPROVED',
  };
  const employee = {
    id: 2,
    employee_no: 'E-2',
    first_name: 'Sam',
    middle_name: null,
    last_name: 'Test',
    primary_department_id: 4,
  };
  const entries = [
    {
      id: 1,
      dailyActivityReportId: 50,
      companyId: 7,
      title: 'Done on time',
      activityCategoryId: 9,
      status: Status.COMPLETED,
      plannedEndTime: new Date('2026-10-20T12:00:00Z'),
      dueDate: null,
      completionDate: new Date('2026-10-20T11:00:00Z'),
      followUpDate: null,
    },
    {
      id: 2,
      dailyActivityReportId: 50,
      companyId: 7,
      title: 'Still open',
      activityCategoryId: 9,
      status: Status.IN_PROGRESS,
      plannedEndTime: new Date('2020-01-01T12:00:00Z'),
      dueDate: null,
      completionDate: null,
      followUpDate: null,
    },
    {
      id: 3,
      dailyActivityReportId: 50,
      companyId: 7,
      title: 'Carried once',
      activityCategoryId: 9,
      status: Status.DEFERRED,
      plannedEndTime: new Date('2020-01-01T12:00:00Z'),
      dueDate: null,
      completionDate: null,
      followUpDate: '2026-10-25',
      deferReason: 'Customer unavailable',
    },
    {
      id: 4,
      dailyActivityReportId: 50,
      companyId: 7,
      title: 'Cancelled',
      activityCategoryId: 9,
      status: Status.CANCELLED,
      plannedEndTime: null,
      dueDate: null,
      completionDate: null,
      followUpDate: null,
    },
    {
      id: 5,
      dailyActivityReportId: 50,
      companyId: 7,
      title: 'Finished late',
      activityCategoryId: 9,
      status: Status.COMPLETED,
      plannedEndTime: new Date('2026-10-20T12:00:00Z'),
      dueDate: null,
      completionDate: new Date('2026-10-20T13:00:00Z'),
      followUpDate: null,
    },
  ];

  function makeQueryBuilder() {
    const builder: Record<string, jest.Mock> = {};
    for (const method of ['where', 'andWhere', 'orderBy', 'addOrderBy']) {
      builder[method] = jest.fn(() => builder);
    }
    builder.getMany = jest.fn().mockResolvedValue([report]);
    return builder;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlannedCompletedActivityReportService(
      hrAccessService as never,
      employeeRepository as never,
      reportRepository as never,
      entryRepository as never,
      departmentHistoryRepository as never,
    );
    hrAccessService.ensureActorCompanyId.mockReturnValue(7);
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue(null);
    reportRepository.createQueryBuilder.mockReturnValue(makeQueryBuilder());
    employeeRepository.find.mockResolvedValue([employee]);
    entryRepository.find.mockResolvedValue(entries);
    departmentHistoryRepository.find.mockResolvedValue([]);
  });

  it('reconciles planned, completed, deferred, cancelled, overdue and late-completed scenarios without carry-forward duplication', async () => {
    const result = await service.getReport(
      { companyId: 7, permissions: ['data_scope:company'] } as never,
      { date_from: '2026-10-20', date_to: '2026-10-20', page: 1, limit: 2 },
    );
    expect(result.totals).toEqual({
      planned_count: 4,
      completed_count: 2,
      incomplete_count: 2,
      deferred_count: 1,
      cancelled_count: 1,
      overdue_count: 1,
      completed_late_count: 1,
      completion_percent: 50,
    });
    expect(result.meta).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      total_pages: 3,
    });
    expect(result.data).toHaveLength(2);
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0]).toMatchObject({
      activity_date: '2026-10-20',
      planned_count: 4,
      completed_count: 2,
    });
    const deferredRow = result.data.find((row) => row.entry_id === 3);
    expect(deferredRow).toBeUndefined(); // Pagination is applied after stable entry ordering.
    const exported = await service.exportReport(
      { companyId: 7, permissions: ['data_scope:company'] } as never,
      { date_from: '2026-10-20', date_to: '2026-10-20' },
    );
    expect(exported.filter((row) => row.entry_id === 3)).toHaveLength(1);
    expect(exported.find((row) => row.entry_id === 3)).toMatchObject({
      activity_date: '2026-10-20',
      follow_up_date: '2026-10-25',
      planned: true,
      completed: false,
      overdue: false,
    });
    expect(exported.at(-1)).toMatchObject({
      row_type: 'TOTAL',
      planned_count: 4,
      completed_count: 2,
      completion_percent: 50,
    });
  });

  it('applies employee/status/overdue/department filters and company scope before totals', async () => {
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([2]);
    const result = await service.getReport(
      {
        companyId: 7,
        employeeId: 2,
        permissions: ['data_scope:team'],
      } as never,
      {
        date_from: '2026-10-20',
        date_to: '2026-10-20',
        employee_id: 2,
        department_id: 4,
        work_status: Status.IN_PROGRESS,
        overdue: true,
      },
    );
    expect(result.meta.total).toBe(1);
    expect(result.totals).toMatchObject({
      planned_count: 1,
      overdue_count: 1,
      completion_percent: 0,
    });
    expect(
      reportRepository.createQueryBuilder.mock.results[0].value.andWhere,
    ).toHaveBeenCalledWith('report.employeeId IN (:...accessibleIds)', {
      accessibleIds: [2],
    });
    expect(entryRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 7 }),
      }),
    );
  });

  it('rejects invalid or reversed report date ranges', async () => {
    const actor = {
      companyId: 7,
      permissions: ['data_scope:company'],
    } as never;
    await expect(
      service.getReport(actor, { date_from: '2026-02-30' }),
    ).rejects.toThrow('invalid');
    await expect(
      service.getReport(actor, {
        date_from: '2026-10-21',
        date_to: '2026-10-20',
      }),
    ).rejects.toThrow('invalid');
    await expect(
      service.getReport(actor, {
        date_from: '2025-01-01',
        date_to: '2026-10-23',
      }),
    ).rejects.toThrow('367');
  });

  it('attributes the activity to the department effective on its original report date', async () => {
    departmentHistoryRepository.find.mockResolvedValue([
      {
        employee_id: 2,
        department_id: 11,
        effective_from: '2026-10-01',
        effective_to: '2026-10-21',
      },
    ]);
    const result = await service.getReport(
      { companyId: 7, permissions: ['data_scope:company'] } as never,
      { date_from: '2026-10-20', date_to: '2026-10-20', department_id: 11 },
    );
    expect(result.meta.total).toBe(5);
    expect(result.data[0].department_id).toBe(11);
    expect(departmentHistoryRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ company_id: 7 }),
      }),
    );
  });
});
