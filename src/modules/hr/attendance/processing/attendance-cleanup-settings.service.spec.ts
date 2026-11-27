import { Repository } from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { AttendanceCleanupSettingsService } from './attendance-cleanup-settings.service';

describe('AttendanceCleanupSettingsService', () => {
  it('defaults to disabled and reads only the requested company settings', async () => {
    const companies = {
      findOneByOrFail: jest.fn().mockResolvedValue({ metadata: null }),
    };
    const service = new AttendanceCleanupSettingsService(
      companies as unknown as Repository<Company>,
    );
    await expect(service.get(7)).resolves.toEqual({
      recalculationJobs: false,
      unmatchedLogs: false,
      expiredSignInRequests: false,
      notificationQueue: false,
      importQueue: false,
      queueRetentionDays: 30,
    });
    expect(companies.findOneByOrFail).toHaveBeenCalledWith({ id: 7 });
    companies.findOneByOrFail.mockResolvedValue({
      metadata: {
        attendance_cleanup: { recalculationJobs: true, unmatchedLogs: false },
      },
    });
    await expect(service.get(9)).resolves.toEqual({
      recalculationJobs: true,
      unmatchedLogs: false,
      expiredSignInRequests: false,
      notificationQueue: false,
      importQueue: false,
      queueRetentionDays: 30,
    });
  });
});
