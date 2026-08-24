import {
  AnalyticsDashboardService,
  AnalyticsReconciliationService,
  AnalyticsSnapshotService,
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
