import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DashboardQueryDto } from './dtos/dashboard-query.dto';

@Injectable()
export class DashboardDateService {
  constructor(private readonly configService: ConfigService) {}

  private addDays(dateOnly: string, days: number): string {
    const date = new Date(`${dateOnly}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private daysBetween(dateFrom: string, dateTo: string): number {
    const from = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
    const to = new Date(`${dateTo}T00:00:00.000Z`).getTime();
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
  }

  resolve(query: DashboardQueryDto) {
    const today = new Date().toISOString().slice(0, 10);
    const defaultDays =
      this.configService.get<number>('DASHBOARD_DEFAULT_PERIOD_DAYS') ?? 30;

    const dateTo = query.date_to ?? today;
    const dateFrom = query.date_from ?? this.addDays(dateTo, -(defaultDays - 1));

    const maximumDays =
      this.configService.get<number>('DASHBOARD_MAX_DATE_RANGE_DAYS') ?? 366;

    if (this.daysBetween(dateFrom, dateTo) > maximumDays) {
      throw new BadRequestException(
        `Dashboard range cannot exceed ${maximumDays} days.`,
      );
    }

    return { dateFrom, dateTo, today };
  }
}
