import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  provisionDefaultAttendanceReportsForCompany,
  resolveDefaultAttendanceReportsConfigFromEnv,
} from '../utils/provision-default-attendance-reports.util';

/**
 * Ensures every company has the two default "system" attendance reports
 * (Morning Attendance Report, End of Day Attendance Report) provisioned as
 * soon as the company exists, so they behave as built-in reports rather than
 * something an admin has to opt into. Called once at company-creation time;
 * existing companies are backfilled by the `044-attendance-scheduled-reports`
 * database seeder, which shares the same provisioning logic.
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
  }
}
