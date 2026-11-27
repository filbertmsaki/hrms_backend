import { DataSource } from 'typeorm';
import { AttendanceAuxiliaryCleanupService } from './attendance-auxiliary-cleanup.service';

describe('AttendanceAuxiliaryCleanupService', () => {
  const query = jest.fn().mockResolvedValue([{ count: '2' }]);
  const service = new AttendanceAuxiliaryCleanupService({
    query,
  } as unknown as DataSource);
  beforeEach(() => query.mockClear());

  it('removes only expired sign-in requests for the company', async () => {
    await expect(service.deleteExpiredSignInRequests(7)).resolves.toBe(2);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('company_id = $1 AND expires_at < now()'),
      [7],
    );
  });

  it('keeps incomplete or failed notification deliveries and scopes through the notification', async () => {
    await service.deleteCompletedNotificationQueueEntries(7);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("o.status = 'PROCESSED'");
    expect(sql).toContain("$2 * interval '1 day'");
    expect(query.mock.calls[0][1]).toEqual([7, 30]);
    expect(sql).toContain('n.company_id = $1');
    expect(sql).toContain("d.status IN ('PENDING', 'FAILED')");
  });

  it('keeps import events unless published, old, and tied to a completed batch', async () => {
    await service.deleteCompletedImportQueueEntries(7);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("o.status = 'PUBLISHED'");
    expect(sql).toContain("o.event_type = 'PROCESS_IMPORT_BATCH'");
    expect(sql).toContain("$2 * interval '1 day'");
    expect(query.mock.calls[0][1]).toEqual([7, 30]);
    expect(sql).toContain("b.status IN ('COMPLETED', 'COMPLETED_WITH_ERRORS')");
    expect(sql).toContain('b.company_id = o.company_id');
  });
});
