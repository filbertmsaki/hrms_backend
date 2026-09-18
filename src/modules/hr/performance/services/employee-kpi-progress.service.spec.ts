import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import {
  EmployeeKpiMeasurementTypeEnum,
  EmployeeKpiProgressSourceEnum,
} from '../enums/employee-kpi-status.enum';
import { EmployeeKpiProgressService } from './employee-kpi-progress.service';

function kpi(overrides: Partial<EmployeeKpi> = {}): EmployeeKpi {
  return {
    id: 7,
    companyId: 1,
    employeeId: 11,
    targetValue: '40',
    actualValue: '26',
    weight: '20',
    measurementType: EmployeeKpiMeasurementTypeEnum.NUMBER,
    progressSource: EmployeeKpiProgressSourceEnum.MANUAL,
    ...overrides,
  } as EmployeeKpi;
}

describe('EmployeeKpiProgressService', () => {
  it('calculates achievement and weighted contribution with the configured cap', async () => {
    const config = {
      get: jest.fn().mockReturnValue(120),
    } as unknown as ConfigService;
    const dataSource = { query: jest.fn() } as unknown as DataSource;
    const service = new EmployeeKpiProgressService(config, dataSource);

    await expect(service.calculate(kpi())).resolves.toEqual({
      actualValue: '26.0000',
      achievementPercent: '65.0000',
      cappedAchievementPercent: '65.0000',
      weightedContribution: '13.0000',
    });
  });

  it('keeps the raw score but caps the weighted contribution', async () => {
    const config = {
      get: jest.fn().mockReturnValue(120),
    } as unknown as ConfigService;
    const dataSource = { query: jest.fn() } as unknown as DataSource;
    const service = new EmployeeKpiProgressService(config, dataSource);

    const result = await service.calculate(
      kpi({ targetValue: '10', actualValue: '15', weight: '40' }),
    );

    expect(result.achievementPercent).toBe('150.0000');
    expect(result.cappedAchievementPercent).toBe('120.0000');
    expect(result.weightedContribution).toBe('48.0000');
  });

  it('derives activity-count progress only from approved completed activities', async () => {
    const query = jest.fn().mockResolvedValue([{ count: '8' }]);
    const config = {
      get: jest.fn().mockReturnValue(120),
    } as unknown as ConfigService;
    const dataSource = { query } as unknown as DataSource;
    const service = new EmployeeKpiProgressService(config, dataSource);

    const result = await service.calculate(
      kpi({
        targetValue: '10',
        actualValue: null,
        progressSource: EmployeeKpiProgressSourceEnum.APPROVED_ACTIVITIES,
      }),
    );

    expect(result.achievementPercent).toBe('80.0000');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("entry.review_status = 'APPROVED'"),
      [1, 11, 7],
    );
  });
});
