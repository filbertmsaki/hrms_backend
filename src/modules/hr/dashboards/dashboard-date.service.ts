import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { DashboardQueryDto } from './dtos/dashboard-query.dto';

@Injectable()
export class DashboardDateService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

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

  private localDate(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  async resolve(
    query: Pick<DashboardQueryDto, 'date_from' | 'date_to'>,
    companyId: number,
  ) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'metadata'],
    });
    const timezone = company?.metadata?.timezone;
    if (typeof timezone !== 'string' || !timezone.trim()) {
      throw new ServiceUnavailableException({
        code: 'COMPANY_TIMEZONE_NOT_CONFIGURED',
        message:
          'Configure an IANA timezone for this company to use dashboards.',
      });
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(
        new Date(),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'COMPANY_TIMEZONE_INVALID',
        message: 'The configured company timezone is invalid.',
      });
    }

    const today = this.localDate(new Date(), timezone);
    const defaultDays =
      this.configService.get<number>('DASHBOARD_DEFAULT_PERIOD_DAYS') ?? 30;

    const dateTo = query.date_to ?? today;
    const dateFrom =
      query.date_from ?? this.addDays(dateTo, -(defaultDays - 1));

    if (this.daysBetween(dateFrom, dateTo) < 0) {
      throw new BadRequestException(
        'Dashboard start date must be on or before the end date.',
      );
    }

    const maximumDays =
      this.configService.get<number>('DASHBOARD_MAX_DATE_RANGE_DAYS') ?? 366;

    if (this.daysBetween(dateFrom, dateTo) > maximumDays) {
      throw new BadRequestException(
        `Dashboard range cannot exceed ${maximumDays} days.`,
      );
    }

    return { dateFrom, dateTo, today, timezone };
  }
}
