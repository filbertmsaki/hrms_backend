import ExcelJS from 'exceljs';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  reportPdf,
  reportXlsx,
  safeSpreadsheetText,
} from './kpi-report-export';
import { KpiReportService, type KpiReportDocument } from './kpi-report.service';

const actor = (role: string): AuthenticatedUser => ({
  id: 1,
  email: 'synthetic@example.test',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  employeeId: 7,
  roles: [role],
  permissions: [],
});

const example: KpiReportDocument = {
  kind: 'individual',
  title: 'Individual KPI performance',
  company: 'Example Company',
  generatedAt: '2026-11-06T00:00:00.000Z',
  period: 'November 2026',
  filters: {},
  page: 1,
  pageSize: 20,
  summary: ['One approved achievement.'],
  sections: [
    {
      title: 'KPI results',
      columns: ['KPI', 'Status'],
      rows: [{ KPI: '=HYPERLINK("bad")', Status: 'approved' }],
    },
  ],
  limitations: ['No company index is configured.'],
};

describe('KPI report exports', () => {
  it('prevents spreadsheet formulas in user-controlled cells', async () => {
    expect(safeSpreadsheetText(' =2+2')).toBe("' =2+2");
    expect(safeSpreadsheetText('+cmd')).toBe("'+cmd");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await reportXlsx(example));
    const values: unknown[] = [];
    workbook.worksheets[0].eachRow((row) =>
      row.eachCell((cell) => values.push(cell.value)),
    );
    expect(values).toContain('\'=HYPERLINK("bad")');
    expect(values).toContain('One approved achievement.');
  });

  it('generates a PDF from the same report document', async () => {
    const bytes = await reportPdf(example);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe('KPI report authorization', () => {
  const analytics = {
    overview: jest.fn(),
    coverage: jest.fn(),
    scorecards: jest.fn(),
    evaluations: jest.fn(),
  };
  const companies = {
    findOneBy: jest.fn().mockResolvedValue({ name: 'Example Company' }),
  };
  const employees = {
    find: jest.fn().mockResolvedValue([]),
    findOneBy: jest
      .fn()
      .mockResolvedValue({ id: 7, first_name: 'Test', last_name: 'Employee' }),
  };
  const evidence = { find: jest.fn().mockResolvedValue([]) };
  const achievements = { find: jest.fn().mockResolvedValue([]) };
  const finalQuery: Record<string, jest.Mock> = {};
  for (const method of ['innerJoin', 'where', 'andWhere', 'orderBy', 'limit'])
    finalQuery[method] = jest.fn().mockReturnValue(finalQuery);
  finalQuery.getMany = jest.fn().mockResolvedValue([]);
  const evaluations = {
    createQueryBuilder: jest.fn().mockReturnValue(finalQuery),
  };
  const service = new KpiReportService(
    analytics as never,
    companies as never,
    employees as never,
    achievements as never,
    evidence as never,
    evaluations as never,
  );

  beforeEach(() => {
    employees.find.mockReset().mockResolvedValue([]);
    analytics.overview.mockReset().mockResolvedValue({
      assignments: { total: 1, approved: 1, pending: 0, missing: 0 },
    });
    analytics.coverage.mockReset().mockResolvedValue({
      suppressed: false,
      eligibleEmployees: 1,
      employeesWithScorecards: 1,
      completeScorecards: 1,
      scorecards: 1,
      finalizedEvaluations: 0,
      evaluationsInProgress: 1,
    });
    analytics.scorecards.mockReset().mockResolvedValue({ total: 0, rows: [] });
    analytics.evaluations.mockReset().mockResolvedValue({
      summary: {
        byStatus: {},
        total: 0,
        finalized: 0,
        acknowledged: 0,
        disputed: 0,
        overdue: 0,
      },
    });
  });

  it('denies employee access to HR and executive reports', async () => {
    await expect(
      service.create(actor('EMPLOYEE'), 'hr', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(actor('EMPLOYEE'), 'executive', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('derives employee identity from the authenticated actor', async () => {
    const report = await service.create(actor('EMPLOYEE'), 'individual', {});
    expect(analytics.overview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ employeeId: 7 }),
    );
    expect(report.summary[0]).toContain('Test Employee');
  });

  it('uses the employee name in scorecard report rows', async () => {
    analytics.scorecards.mockResolvedValue({
      total: 1,
      rows: [
        {
          id: 1,
          name: 'November scorecard',
          subjectType: 'employee',
          subjectId: 3,
          periodLabel: 'November',
          performanceStatus: 'awaiting_data',
          completenessPercent: '0',
          overallScore: null,
          rating: null,
          entries: [],
        },
      ],
    });
    employees.find.mockResolvedValue([
      { id: 3, first_name: 'Bosco', last_name: 'Odillo' },
    ]);

    const report = await service.create(actor('HR_MANAGER'), 'hr', {});
    const scorecards = report.sections.find(
      (section) => section.title === 'Scorecards (current page)',
    );

    expect(scorecards?.rows[0].Subject).toBe('Bosco Odillo');
    expect(scorecards?.rows[0].Status).toBe('Awaiting data');
    expect(scorecards?.note).toContain('1 scorecard matches');
    expect(employees.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: expect.anything(), company_id: 1 },
      }),
    );
  });

  it('rejects another employee ID instead of echoing a misleading report filter', async () => {
    await expect(
      service.create(actor('EMPLOYEE'), 'individual', { employeeId: 99 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(analytics.overview).not.toHaveBeenCalled();
  });

  it('withholds individual detail from executive reports', async () => {
    analytics.coverage.mockResolvedValue({
      suppressed: true,
      reason: 'Disclosure policy required',
    });
    const report = await service.create(actor('MANAGEMENT'), 'executive', {});
    expect(report.sections).toHaveLength(0);
    expect(report.limitations.join(' ')).toContain('withheld');
  });
});
