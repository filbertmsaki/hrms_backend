import { HikvisionPeopleCredentialSyncService } from './hikvision-people-credential-sync.service';

describe('fingerprint device user matching', () => {
  it('does not import fingerprint data returned for a different device user', async () => {
    const service = Object.create(
      HikvisionPeopleCredentialSyncService.prototype,
    ) as HikvisionPeopleCredentialSyncService;
    const saveFingerprint = jest.fn().mockResolvedValue('CREATED');
    Object.assign(service, {
      logger: { warn: jest.fn() },
      hikvisionHelper: {
        findHikvisionDeviceOrFail: jest.fn().mockResolvedValue({ id: 9 }),
      },
      hikvisionAccessControlService: {
        uploadFingerprint: jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          parsed: {
            FingerPrintInfoSearch: {
              FingerPrintList: [{ employeeNo: 'OTHER', fingerPrintID: 1 }],
            },
          },
        }),
      },
      upsertFingerprintCredential: saveFingerprint,
      hikvisionSyncLogRepository: {
        create: jest.fn((value: unknown) => value),
        save: jest.fn(),
      },
    });
    const result = await service.syncUserFingerprints(1, 9, 'EXPECTED');
    expect(result.status).toBe('FAILED');
    expect(result.fingerprints.failed).toBe(10);
    expect(saveFingerprint).not.toHaveBeenCalled();
  });
});
