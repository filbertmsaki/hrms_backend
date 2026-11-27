import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type CleanupSizeRow = { type: string; count: number; bytes: string };
type CleanupHistoryRow = {
  type: string;
  scheduledDate: string;
  status: string;
  deletedCount: number;
  errorMessage: string | null;
  executedAt: Date;
};

@Injectable()
export class AttendanceCleanupMonitorService {
  constructor(private readonly dataSource: DataSource) {}

  async assertReady(): Promise<void> {
    await this.dataSource.query('SELECT 1 FROM company_cleanup_runs LIMIT 0');
  }

  async storage(companyId: number): Promise<CleanupSizeRow[]> {
    const rows: CleanupSizeRow[] = await this.dataSource.query(
      `
      SELECT 'recalculationJobs' AS type, count(*)::int AS count, COALESCE(sum(pg_column_size(j)), 0)::bigint AS bytes FROM attendance_recalculation_jobs j WHERE company_id=$1
      UNION ALL SELECT 'unmatchedLogs', count(*)::int, COALESCE(sum(pg_column_size(e)), 0)::bigint FROM attendance_processed_events e WHERE company_id=$1 AND employee_id IS NULL
      UNION ALL SELECT 'expiredSignInRequests', count(*)::int, COALESCE(sum(pg_column_size(r)), 0)::bigint FROM oidc_requests r WHERE company_id=$1
      UNION ALL SELECT 'notificationQueue', count(*)::int, COALESCE(sum(pg_column_size(o)), 0)::bigint FROM notification_outbox_events o WHERE EXISTS (SELECT 1 FROM notifications n WHERE n.id=o.notification_id AND n.company_id=$1)
      UNION ALL SELECT 'importQueue', count(*)::int, COALESCE(sum(pg_column_size(o)), 0)::bigint FROM employee_import_outbox_events o WHERE company_id=$1
      UNION ALL SELECT 'employees', count(*)::int, COALESCE(sum(pg_column_size(e)), 0)::bigint FROM employees e WHERE company_id=$1
      UNION ALL SELECT 'dailySummaries', count(*)::int, COALESCE(sum(pg_column_size(s)), 0)::bigint FROM attendance_daily_summaries s WHERE company_id=$1
      UNION ALL SELECT 'leaveRequests', count(*)::int, COALESCE(sum(pg_column_size(l)), 0)::bigint FROM leave_requests l WHERE company_id=$1
      UNION ALL SELECT 'notifications', count(*)::int, COALESCE(sum(pg_column_size(n)), 0)::bigint FROM notifications n WHERE company_id=$1`,
      [companyId],
    );
    return rows;
  }

  async preview(companyId: number, days: number): Promise<CleanupSizeRow[]> {
    const cutoff = `((date_trunc('day', now() AT TIME ZONE 'Africa/Dar_es_Salaam') AT TIME ZONE 'Africa/Dar_es_Salaam') AT TIME ZONE current_setting('TimeZone'))`;
    const rows: CleanupSizeRow[] = await this.dataSource.query(
      `
      SELECT 'recalculationJobs' AS type, count(*)::int AS count, COALESCE(sum(pg_column_size(j)), 0)::bigint AS bytes FROM attendance_recalculation_jobs j WHERE company_id = $1 AND status = 'SUCCESS' AND created_at < ${cutoff} AND processed_at < ${cutoff}
      UNION ALL SELECT 'unmatchedLogs', count(*)::int, COALESCE(sum(pg_column_size(e)), 0)::bigint FROM attendance_processed_events e WHERE company_id = $1 AND employee_id IS NULL AND raw_log_id IS NOT NULL AND created_at < ${cutoff} AND attendance_date < (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date
      UNION ALL SELECT 'expiredSignInRequests', count(*)::int, COALESCE(sum(pg_column_size(r)), 0)::bigint FROM oidc_requests r WHERE company_id = $1 AND expires_at < now()
      UNION ALL SELECT 'notificationQueue', count(*)::int, COALESCE(sum(pg_column_size(o)), 0)::bigint FROM notification_outbox_events o WHERE status = 'PROCESSED' AND processed_at < now() - $2 * interval '1 day' AND EXISTS (SELECT 1 FROM notifications n WHERE n.id = o.notification_id AND n.company_id = $1) AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id = o.notification_id AND d.status IN ('PENDING', 'FAILED'))
      UNION ALL SELECT 'importQueue', count(*)::int, COALESCE(sum(pg_column_size(o)), 0)::bigint FROM employee_import_outbox_events o WHERE company_id = $1 AND status = 'PUBLISHED' AND event_type = 'PROCESS_IMPORT_BATCH' AND published_at < now() - $2 * interval '1 day' AND EXISTS (SELECT 1 FROM employee_import_batches b WHERE b.id = o.batch_id AND b.company_id = o.company_id AND b.status IN ('COMPLETED', 'COMPLETED_WITH_ERRORS'))`,
      [companyId, days],
    );
    return rows;
  }

  async history(companyId: number): Promise<CleanupHistoryRow[]> {
    const rows: CleanupHistoryRow[] = await this.dataSource.query(
      `SELECT cleanup_type AS "type", scheduled_date AS "scheduledDate", status, deleted_count AS "deletedCount", error_message AS "errorMessage", executed_at AS "executedAt" FROM company_cleanup_runs WHERE company_id = $1 ORDER BY executed_at DESC LIMIT 30`,
      [companyId],
    );
    return rows;
  }

  async record(
    companyId: number,
    type: string,
    scheduledDate: string,
    count: number,
    error?: string,
  ) {
    await this.dataSource.query(
      `INSERT INTO company_cleanup_runs (company_id, cleanup_type, scheduled_date, status, deleted_count, error_message) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (company_id,cleanup_type,scheduled_date) DO UPDATE SET status=EXCLUDED.status, deleted_count=EXCLUDED.deleted_count, error_message=EXCLUDED.error_message, executed_at=now()`,
      [
        companyId,
        type,
        scheduledDate,
        error ? 'FAILED' : 'SUCCESS',
        count,
        error?.slice(0, 500) ?? null,
      ],
    );
  }

  async needsRecovery(
    companyId: number,
    type: string,
    scheduledDate: string,
  ): Promise<boolean> {
    const rows: Array<{ needs: boolean }> = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM companies WHERE id=$1 AND metadata::jsonb -> 'attendance_cleanup' ->> 'configuredAt' IS NOT NULL AND (metadata::jsonb -> 'attendance_cleanup' ->> 'configuredAt')::timestamptz <= (($3::date + interval '23 hours 59 minutes') AT TIME ZONE 'Africa/Dar_es_Salaam')) AND NOT EXISTS (SELECT 1 FROM company_cleanup_runs WHERE company_id=$1 AND cleanup_type=$2 AND scheduled_date >= $3::date AND status='SUCCESS') AS needs`,
      [companyId, type, scheduledDate],
    );
    return rows[0].needs;
  }
}
