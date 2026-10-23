import {
  AnalyticsDashboardService,
  AnalyticsOperationalReportService,
  AnalyticsReconciliationService,
  AnalyticsReportService,
  AnalyticsSnapshotService,
  OPERATIONAL_REPORTS,
} from './analytics-core.services';

describe('AnalyticsReconciliationService', () => {
  it('compares payroll totals using precision-safe money checks', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          id: 1,
          gross_total: '100.10',
          analytics_gross: '100.10',
          net_pay_total: '90.05',
          analytics_net: '90.05',
        },
        {
          id: 2,
          gross_total: '200.00',
          analytics_gross: '199.99',
          net_pay_total: '150.00',
          analytics_net: '150.01',
        },
      ]),
    };

    const service = new AnalyticsReconciliationService(dataSource as never);

    await expect(service.reconcilePayroll(12)).resolves.toEqual([
      {
        code: 'PAYROLL_ANALYTICS_GROSS_MISMATCH',
        payroll_run_id: 2,
        expected: '200.00',
        actual: '199.99',
      },
      {
        code: 'PAYROLL_ANALYTICS_NET_MISMATCH',
        payroll_run_id: 2,
        expected: '150.00',
        actual: '150.01',
      },
    ]);
  });

  it('compares employee-finance balances using precision-safe money checks', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          id: 11,
          outstanding_total: '0.30',
          ledger_balance: '0.30',
        },
        {
          id: 12,
          outstanding_total: '0.30',
          ledger_balance: '0.29',
        },
      ]),
    };

    const service = new AnalyticsReconciliationService(dataSource as never);

    await expect(service.reconcileEmployeeFinance(12)).resolves.toEqual([
      {
        code: 'LOAN_ANALYTICS_LEDGER_MISMATCH',
        account_id: 12,
        expected: '0.30',
        actual: '0.29',
      },
    ]);
  });
});

describe('field productivity live-source reports', () => {
  const buildArgs = {
    companyId: 42,
    scope: {
      employeeIds: [8, 9],
      employeeId: null,
      branchId: 3,
      departmentId: 5,
      scopeHash: 'company:42:employees:8,9',
    },
    query: { date_from: '2026-10-01', date_to: '2026-10-31' },
  } as never;

  it.each([
    ['FIELD_PRODUCTIVITY', 'DAILY'],
    ['FIELD_MONTHLY_PRODUCTIVITY', 'MONTHLY'],
  ])('builds %s directly from tenant-scoped live records', (code, period) => {
    const definition = OPERATIONAL_REPORTS.find((item) => item.code === code);
    expect(definition).toBeDefined();
    const built = definition!.build(buildArgs);
    expect(built.sql).toContain('FROM field_visits visit');
    expect(built.sql).toContain('FROM daily_activity_reports report');
    expect(built.sql).toContain('FROM field_opportunities opportunity');
    expect(built.sql).not.toContain('work_activity_period_summaries');
    expect(built.sql).toContain("status <> 'CANCELLED'");
    expect(built.sql).toContain("manager_review_status = 'APPROVED'");
    expect(built.sql).toContain('reported_potential_by_currency');
    expect(built.sql).toContain('validated_actual_by_currency');
    expect(built.sql).toContain(`'${period}' AS period_type`);
    expect(built.sql).toContain('BETWEEN $');
    expect(built.sql).toContain('= ANY($');
    expect(built.params).toContain(42);
    expect(built.params).toContain('2026-10-01');
    expect(built.params).toContain('2026-10-31');
    expect(built.params).toContainEqual([8, 9]);
  });
});

describe('activity to KPI linkage reporting', () => {
  it('reports links tenant-scoped without defining KPI actual contribution', () => {
    const definition = OPERATIONAL_REPORTS.find(
      (item) => item.code === 'ACTIVITY_VS_KPI',
    );
    expect(definition).toBeDefined();
    const built = definition!.build({
      companyId: 42,
      scope: {
        employeeIds: [8, 9],
        employeeId: null,
        branchId: 3,
        departmentId: 5,
        scopeHash: 'company:42:employees:8,9',
      },
      query: { date_from: '2026-10-01', date_to: '2026-10-31' },
    } as never);

    expect(built.sql).toContain('entry.company_id = $1');
    expect(built.sql).toContain('report.company_id = $1');
    expect(built.sql).toContain('employee_kpi.company_id = entry.company_id');
    expect(built.sql).toContain('definition.company_id = entry.company_id');
    expect(built.sql).toContain('entry.employee_kpi_id');
    expect(built.sql).toContain('entry.kpi_definition_id');
    expect(built.sql).not.toContain('UPDATE employee_kpis');
    expect(built.sql).not.toContain('UPDATE kpi_achievements');
    expect(built.params).toContain(42);
    expect(built.params).toContainEqual([8, 9]);
  });
});

describe('attendance without activity live report', () => {
  it('uses one scoped attendance daily summary and the approved submission and eligibility rules', () => {
    const definition = OPERATIONAL_REPORTS.find(
      (item) => item.code === 'ATTENDANCE_WITHOUT_ACTIVITY',
    );
    expect(definition).toBeDefined();
    const built = definition!.build({
      companyId: 42,
      scope: {
        employeeIds: [8, 9],
        employeeId: null,
        branchId: 3,
        departmentId: 5,
        scopeHash: 'company:42:employees:8,9',
      },
      query: { date_from: '2026-10-01', date_to: '2026-10-31' },
    } as never);

    expect(built.sql).toContain('FROM attendance_daily_summaries attendance');
    expect(built.sql).toContain('attendance.check_in_at IS NOT NULL');
    expect(built.sql).toContain('attendance.timezone');
    expect(built.sql).toContain('attendance.schedule_start_at');
    expect(built.sql).toContain('candidate.daily_submission_required');
    expect(built.sql).toContain(
      'candidate.effective_from <= attendance.attendance_date',
    );
    expect(built.sql).toContain("leave.duration_type = 'FULL_DAY'");
    expect(built.sql).toContain('leave.company_id = attendance.company_id');
    expect(built.sql).toContain(
      'report.activity_date = attendance.attendance_date',
    );
    expect(built.sql).toContain('report.submitted_at IS NOT NULL');
    expect(built.sql).toContain("'RETURNED_FOR_CORRECTION'");
    expect(built.sql).toContain('e.company_id = attendance.company_id');
    expect(built.sql).toContain('attendance.is_adjusted');
    expect(built.params).toContain(42);
    expect(built.params).toContainEqual([8, 9]);
    expect(built.params).toContain('2026-10-01');
    expect(built.params).toContain('2026-10-31');
  });
});

describe('AnalyticsSnapshotService.loadEmployeeFinance', () => {
  it('builds repaid amounts without floating-point drift', async () => {
    const financeRepository = {
      create: jest.fn().mockImplementation((value) => value),
      upsert: jest.fn().mockResolvedValue(undefined),
    };

    const service = {
      dataSource: {
        query: jest.fn().mockResolvedValue([
          {
            id: 41,
            employee_id: 7,
            product_type: 'LOAN',
            disbursed_at: '2026-08-03T10:00:00.000Z',
            principal_amount: '0.30',
            total_payable: '0.30',
            outstanding_total: '0.10',
            status: 'ACTIVE',
          },
        ]),
      },
      financeRepository,
    };

    const result = await AnalyticsSnapshotService.prototype[
      'loadEmployeeFinance'
    ].call(service, 12, '2026-08-01', '2026-08-31', {
      id: 'run-1',
    });

    expect(financeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 12,
        accountId: 41,
        repaidAmount: '0.20',
        closingBalance: '0.10',
      }),
    );
    expect(financeRepository.upsert).toHaveBeenCalled();
    expect(result).toEqual({ source_count: 1, upserted: 1 });
  });
});

describe('AnalyticsDashboardService performance aggregation', () => {
  it('filters published reviews by their published timestamp', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([{ published_reviews: '2', average_score: '82.5' }]),
    };
    const service = { dataSource };

    await AnalyticsDashboardService.prototype['performance'].call(
      service,
      {
        companyId: 1,
        employeeIds: null,
        branchId: null,
        departmentId: null,
        employeeId: null,
        scopeHash: 'company:1',
      },
      { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    );

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('review.published_at::date BETWEEN $2 AND $3'),
      [1, '2026-08-01', '2026-08-31'],
    );
  });
});

describe('AnalyticsOperationalReportService', () => {
  function service() {
    return new AnalyticsOperationalReportService(
      {} as never,
      {} as never,
      {
        calculateAvailableDays: jest.fn(() => 8),
      } as never,
      {
        calculateBalance: jest.fn().mockResolvedValue({
          principal: '70.00',
          interest: '5.00',
          fees: '0.00',
          total: '75.00',
        }),
      } as never,
      {
        score: jest.fn(() => ({
          rawScore: '120.0000',
          cappedScore: '110.0000',
          weightedScore: '55.0000',
        })),
      } as never,
      {} as never,
      {} as never,
    );
  }

  it('registers KPI and attendance operational runners', () => {
    const definitions = service().listDefinitions();
    const codes = definitions.map((definition) => definition.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'KPI_ASSIGNMENTS',
        'KPI_TARGET_VS_ACHIEVEMENT',
        'MONTHLY_KPI_SCORE',
        'QUARTERLY_KPI_AVERAGE',
        'ANNUAL_KPI_AVERAGE',
        'KPI_SCORE_HISTORY',
        'ATTENDANCE_EXCEPTIONS',
        'ATTENDANCE_CORRECTIONS',
      ]),
    );
  });

  it('routes pending activity reports through shared eligibility reporting', async () => {
    const workActivityReportingService = {
      getPendingReports: jest.fn().mockResolvedValue({
        data: [{ employee_id: 5, activity_date: '2026-10-20' }],
        meta: { page: 1, limit: 25, total: 1, total_pages: 1 },
        totals: { eligible_employee_days: 4, pending_reports: 1 },
      }),
    };
    const scopeService = {
      resolve: jest.fn().mockResolvedValue({ scopeHash: 'test-scope' }),
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const sut = new AnalyticsOperationalReportService(
      auditService as never,
      scopeService as never,
      {} as never,
      {} as never,
      {} as never,
      workActivityReportingService as never,
      {} as never,
    );

    const result = await sut.run(
      {
        companyId: 9,
        permissions: ['work_activities:manager:read'],
      } as never,
      'PENDING_ACTIVITY',
      {
        date_from: '2026-10-20',
        date_to: '2026-10-21',
        employee_id: 5,
        department_id: 7,
        branch_id: 3,
        page: 1,
        limit: 25,
      },
    );

    expect(workActivityReportingService.getPendingReports).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 9 }),
      expect.objectContaining({
        date_from: '2026-10-20',
        date_to: '2026-10-21',
        employee_id: 5,
        department_id: 7,
        branch_id: 3,
        page: 1,
        limit: 25,
      }),
    );
    expect(result).toMatchObject({
      total: 1,
      totals: { eligible_employee_days: 4, pending_reports: 1 },
      source_policy: 'SHARED_WORK_ACTIVITY_ELIGIBILITY_SERVICE',
    });
  });

  it('exports pending activity rows from the shared scoped report', async () => {
    const workActivityReportingService = {
      exportPendingReports: jest.fn().mockResolvedValue([
        {
          employee_no: 'E005',
          activity_date: '2026-10-20',
          assigned_task_count: 2,
          open_task_count: 1,
        },
      ]),
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const sut = new AnalyticsOperationalReportService(
      auditService as never,
      {
        resolve: jest.fn().mockResolvedValue({ scopeHash: 'test-scope' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      workActivityReportingService as never,
      {} as never,
    );

    const file = await sut.export(
      {
        companyId: 9,
        permissions: ['work_activities:manager:read'],
      } as never,
      'PENDING_ACTIVITY',
      { output_format: 'CSV', date_from: '2026-10-20' } as never,
    );

    expect(
      workActivityReportingService.exportPendingReports,
    ).toHaveBeenCalled();
    expect(file.recordCount).toBe(1);
    expect(file.buffer.toString('utf8')).toContain('assigned_task_count');
    expect(file.buffer.toString('utf8')).toContain('E005');
  });

  it('uses tenant-scoped eligibility rows for scheduled pending activity exports', async () => {
    const workActivityReportingService = {
      exportPendingReportsForCompany: jest.fn().mockResolvedValue([]),
    };
    const sut = new AnalyticsOperationalReportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workActivityReportingService as never,
      {} as never,
    );

    const file = await sut.exportForCompany(9, 'PENDING_ACTIVITY', {
      date_from: '2026-10-20',
      date_to: '2026-10-21',
      output_format: 'CSV',
    } as never);

    expect(
      workActivityReportingService.exportPendingReportsForCompany,
    ).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        date_from: '2026-10-20',
        date_to: '2026-10-21',
      }),
    );
    expect(file.recordCount).toBe(0);
  });

  it('has a dedicated operational runner for every catalog report export', () => {
    const catalog = new AnalyticsReportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ).reportCatalog();
    const toolOnlyReportCodes = new Set([
      'REPORTS_DASHBOARD',
      'CUSTOM_REPORT_BUILDER',
      'SAVED_REPORTS',
    ]);
    const executableReports = catalog.categories
      .flatMap((category) => category.reports)
      .filter((report) => !toolOnlyReportCodes.has(report.code));
    const operationalCodes = new Set(
      OPERATIONAL_REPORTS.map((definition) => definition.code),
    );

    expect(
      executableReports
        .map((report) => report.code)
        .filter((code) => !operationalCodes.has(code)),
    ).toEqual([]);
    expect(
      executableReports.every(
        (report) =>
          report.implementation_status === 'DEDICATED_OPERATIONAL_RUNNER',
      ),
    ).toBe(true);
  });

  it('recalculates KPI report rows with the performance scoring service', async () => {
    const scoringService = {
      score: jest.fn(() => ({
        rawScore: '80.0000',
        cappedScore: '80.0000',
        weightedScore: '32.0000',
      })),
    };
    const sut = new AnalyticsOperationalReportService(
      {} as never,
      {} as never,
      { calculateAvailableDays: jest.fn() } as never,
      { calculateBalance: jest.fn() } as never,
      scoringService as never,
      {} as never,
      {} as never,
    );

    const rows = await AnalyticsOperationalReportService.prototype[
      'enrichRows'
    ].call(
      sut,
      'KPI_TARGET_VS_ACHIEVEMENT',
      [
        {
          scoring_formula: 'PERCENT_TO_TARGET',
          target_value: '100',
          achievement_value: '80',
          weight: '40',
          formula_configuration: null,
        },
      ],
      1,
    );

    expect(scoringService.score).toHaveBeenCalledWith(
      expect.objectContaining({
        formula: 'PERCENT_TO_TARGET',
        targetValue: '100',
        achievementValue: '80',
        weight: '40',
      }),
    );
    expect(rows[0]).toMatchObject({
      raw_score: '80.0000',
      weighted_score: '32.0000',
      calculation_source: 'PerformanceScoringService.score',
    });
  });
});
