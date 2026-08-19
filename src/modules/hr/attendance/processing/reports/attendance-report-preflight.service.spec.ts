import { AttendanceReportPreflightService } from './attendance-report-preflight.service';

describe('AttendanceReportPreflightService', () => {
  function buildService(overrides?: {
    processPendingMobilePunches?: jest.Mock;
    processRange?: jest.Mock;
  }) {
    const processPendingMobilePunches =
      overrides?.processPendingMobilePunches ??
      jest.fn().mockResolvedValue({ selected: 0, processed: 0, failed: 0 });
    const processRange =
      overrides?.processRange ?? jest.fn().mockResolvedValue({});

    const eventIngestionService = {
      processPendingMobilePunches,
    } as never;
    const attendanceProcessingService = {
      processRange,
    } as never;

    const service = new AttendanceReportPreflightService(
      eventIngestionService,
      attendanceProcessingService,
    );

    return { service, processPendingMobilePunches, processRange };
  }

  it('ingests pending mobile punches before rebuilding summaries from all device logs', async () => {
    const { service, processPendingMobilePunches, processRange } =
      buildService();

    await service.ensureFullyProcessed(7, '2026-08-19');

    expect(processPendingMobilePunches).toHaveBeenCalledTimes(1);
    expect(processRange).toHaveBeenCalledWith(7, {
      start_date: '2026-08-19',
      end_date: '2026-08-19',
      rebuild_summaries: true,
    });
  });

  it('does not let a mobile punch ingestion failure block the device log rebuild', async () => {
    const processPendingMobilePunches = jest
      .fn()
      .mockRejectedValue(new Error('ingestion boom'));
    const { service, processRange } = buildService({
      processPendingMobilePunches,
    });

    await expect(
      service.ensureFullyProcessed(7, '2026-08-19'),
    ).resolves.toBeUndefined();
    expect(processRange).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the device log rebuild itself fails', async () => {
    const processRange = jest.fn().mockRejectedValue(new Error('range boom'));
    const { service } = buildService({ processRange });

    await expect(
      service.ensureFullyProcessed(7, '2026-08-19'),
    ).resolves.toBeUndefined();
  });
});
