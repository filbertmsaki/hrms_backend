import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import {
  EmployeeKpiMeasurementTypeEnum,
  EmployeeKpiProgressSourceEnum,
} from '../enums/employee-kpi-status.enum';

export type EmployeeKpiProgress = {
  actualValue: string | null;
  achievementPercent: string | null;
  cappedAchievementPercent: string | null;
  weightedContribution: string | null;
};

@Injectable()
export class EmployeeKpiProgressService {
  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async calculate(kpi: EmployeeKpi): Promise<EmployeeKpiProgress> {
    const actualValue = await this.resolveActualValue(kpi);
    if (actualValue === null) {
      return {
        actualValue: null,
        achievementPercent: null,
        cappedAchievementPercent: null,
        weightedContribution: null,
      };
    }

    const achievement = this.calculateAchievement(kpi, actualValue);
    const configuredCap = this.configService.get<string | number | null>(
      'PERFORMANCE_DEFAULT_SCORE_CAP',
      120,
    );
    const capped =
      configuredCap === null || String(configuredCap).toUpperCase() === 'NONE'
        ? achievement
        : Decimal.min(achievement, new Decimal(configuredCap));
    const weighted = capped.mul(new Decimal(kpi.weight).div(100));

    return {
      actualValue: actualValue.toDecimalPlaces(4).toFixed(4),
      achievementPercent: achievement.toDecimalPlaces(4).toFixed(4),
      cappedAchievementPercent: capped.toDecimalPlaces(4).toFixed(4),
      weightedContribution: weighted.toDecimalPlaces(4).toFixed(4),
    };
  }

  private async resolveActualValue(kpi: EmployeeKpi): Promise<Decimal | null> {
    if (
      kpi.progressSource !== EmployeeKpiProgressSourceEnum.APPROVED_ACTIVITIES
    ) {
      return kpi.actualValue === null ? null : new Decimal(kpi.actualValue);
    }

    const rows = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM daily_activity_entries entry
       INNER JOIN daily_activity_reports report
         ON report.id = entry.daily_activity_report_id
       WHERE entry.company_id = $1
         AND report.employee_id = $2
         AND entry.employee_kpi_id = $3
         AND entry.status = 'COMPLETED'
         AND entry.review_status = 'APPROVED'`,
      [kpi.companyId, kpi.employeeId, kpi.id],
    );
    return new Decimal(rows[0]?.count ?? 0);
  }

  private calculateAchievement(kpi: EmployeeKpi, actual: Decimal): Decimal {
    if (kpi.measurementType === EmployeeKpiMeasurementTypeEnum.BOOLEAN) {
      return actual.gt(0) ? new Decimal(100) : new Decimal(0);
    }
    if (kpi.measurementType === EmployeeKpiMeasurementTypeEnum.MANUAL) {
      return actual;
    }
    if (kpi.targetValue === null || new Decimal(kpi.targetValue).eq(0)) {
      return actual.eq(0) ? new Decimal(100) : new Decimal(0);
    }
    return actual.div(new Decimal(kpi.targetValue)).mul(100);
  }
}
