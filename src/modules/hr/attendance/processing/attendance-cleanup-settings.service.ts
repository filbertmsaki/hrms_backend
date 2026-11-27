import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';

export type AttendanceCleanupSettings = {
  recalculationJobs: boolean;
  unmatchedLogs: boolean;
  expiredSignInRequests: boolean;
  notificationQueue: boolean;
  importQueue: boolean;
  queueRetentionDays: number;
};

@Injectable()
export class AttendanceCleanupSettingsService {
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
  ) {}

  async get(companyId: number): Promise<AttendanceCleanupSettings> {
    const company = await this.companies.findOneByOrFail({ id: companyId });
    const settings = company.metadata?.attendance_cleanup as
      | Partial<AttendanceCleanupSettings>
      | undefined;
    return {
      recalculationJobs: settings?.recalculationJobs === true,
      unmatchedLogs: settings?.unmatchedLogs === true,
      expiredSignInRequests: settings?.expiredSignInRequests === true,
      notificationQueue: settings?.notificationQueue === true,
      importQueue: settings?.importQueue === true,
      queueRetentionDays:
        Number.isInteger(settings?.queueRetentionDays) &&
        settings!.queueRetentionDays! >= 7 &&
        settings!.queueRetentionDays! <= 3650
          ? settings!.queueRetentionDays!
          : 30,
    };
  }

  async update(companyId: number, settings: AttendanceCleanupSettings) {
    await this.companies
      .createQueryBuilder()
      .update(Company)
      .set({
        metadata: () =>
          `jsonb_set(COALESCE(metadata::jsonb, '{}'::jsonb), '{attendance_cleanup}', :settings::jsonb)::json`,
      })
      .setParameter(
        'settings',
        JSON.stringify({ ...settings, configuredAt: new Date().toISOString() }),
      )
      .where('id = :companyId', { companyId })
      .execute();
    return this.get(companyId);
  }

  async enabledCompanies(
    key: Exclude<keyof AttendanceCleanupSettings, 'queueRetentionDays'>,
  ): Promise<number[]> {
    const rows = await this.companies
      .createQueryBuilder('company')
      .select('company.id', 'id')
      .where(
        `company.metadata::jsonb -> 'attendance_cleanup' -> :key = 'true'::jsonb`,
        { key },
      )
      .getRawMany<{ id: number }>();
    return rows.map((row) => Number(row.id));
  }
}
