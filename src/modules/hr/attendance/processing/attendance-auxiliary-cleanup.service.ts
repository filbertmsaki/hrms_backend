import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AttendanceAuxiliaryCleanupService {
  constructor(private readonly dataSource: DataSource) {}

  private async deleteAndCount(
    sql: string,
    companyId: number,
    retentionDays?: number,
  ): Promise<number> {
    const rows: Array<{ count: string }> = await this.dataSource.query(
      sql,
      retentionDays === undefined ? [companyId] : [companyId, retentionDays],
    );
    return Number(rows[0].count);
  }

  deleteExpiredSignInRequests(companyId: number): Promise<number> {
    return this.deleteAndCount(
      `WITH deleted AS (
      DELETE FROM oidc_requests WHERE company_id = $1 AND expires_at < now()
      RETURNING 1
    ) SELECT count(*) AS count FROM deleted`,
      companyId,
    );
  }

  deleteCompletedNotificationQueueEntries(
    companyId: number,
    retentionDays = 30,
  ): Promise<number> {
    return this.deleteAndCount(
      `WITH deleted AS (
      DELETE FROM notification_outbox_events o
      WHERE o.status = 'PROCESSED' AND o.processed_at < now() - $2 * interval '1 day'
        AND EXISTS (SELECT 1 FROM notifications n WHERE n.id = o.notification_id AND n.company_id = $1)
        AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id = o.notification_id AND d.status IN ('PENDING', 'FAILED'))
      RETURNING 1
    ) SELECT count(*) AS count FROM deleted`,
      companyId,
      retentionDays,
    );
  }

  deleteCompletedImportQueueEntries(
    companyId: number,
    retentionDays = 30,
  ): Promise<number> {
    return this.deleteAndCount(
      `WITH deleted AS (
      DELETE FROM employee_import_outbox_events o
      WHERE o.company_id = $1 AND o.status = 'PUBLISHED'
        AND o.event_type = 'PROCESS_IMPORT_BATCH'
        AND o.published_at < now() - $2 * interval '1 day'
        AND EXISTS (SELECT 1 FROM employee_import_batches b WHERE b.id = o.batch_id AND b.company_id = o.company_id AND b.status IN ('COMPLETED', 'COMPLETED_WITH_ERRORS'))
      RETURNING 1
    ) SELECT count(*) AS count FROM deleted`,
      companyId,
      retentionDays,
    );
  }
}
