import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  provisionDefaultAttendanceReportsForCompany,
  resolveDefaultAttendanceReportsConfigFromEnv,
} from '../utils/provision-default-attendance-reports.util';
import { provisionDefaultWorkforceReportPacksForCompany } from '../utils/provision-default-workforce-report-packs.util';

/**
 * Provisions default attendance reports and inactive draft workforce report
 * templates when a company is created. Existing companies receive these via
 * their respective idempotent database seeders.
 */
@Injectable()
export class AttendanceDefaultReportsProvisioningService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async provisionForCompany(
    companyId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const entityManager = manager ?? this.dataSource.manager;
    const config = resolveDefaultAttendanceReportsConfigFromEnv();

    await provisionDefaultAttendanceReportsForCompany(
      entityManager,
      companyId,
      config,
    );
    await provisionDefaultWorkforceReportPacksForCompany(
      entityManager,
      companyId,
    );
  }
}
