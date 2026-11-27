jest.mock('fs', () => {
  const original = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...original,
    promises: {
      ...original.promises,
      readdir: jest.fn(),
      lstat: jest.fn(),
      rm: jest.fn(),
    },
  };
});
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { AttendanceTempScanCleanupService } from './attendance-temp-scan-cleanup.service';

describe('temporary scan cleanup', () => {
  const originalEnabled = process.env.FILE_TEMP_SCAN_CLEANUP_ENABLED;
  const originalTimeout = process.env.FILE_MALWARE_SCAN_TIMEOUT_MS;
  const locks = {
    runWithLock: jest.fn(async (_key: string, fn: () => Promise<void>) => {
      await fn();
      return { acquired: true };
    }),
  };
  const service = new AttendanceTempScanCleanupService(
    locks as unknown as PostgresAdvisoryLockService,
  );
  afterEach(() => {
    if (originalEnabled === undefined)
      delete process.env.FILE_TEMP_SCAN_CLEANUP_ENABLED;
    else process.env.FILE_TEMP_SCAN_CLEANUP_ENABLED = originalEnabled;
    if (originalTimeout === undefined)
      delete process.env.FILE_MALWARE_SCAN_TIMEOUT_MS;
    else process.env.FILE_MALWARE_SCAN_TIMEOUT_MS = originalTimeout;
    jest.clearAllMocks();
  });
  it('is disabled by default', async () => {
    delete process.env.FILE_TEMP_SCAN_CLEANUP_ENABLED;
    await service.run();
    expect(locks.runWithLock).not.toHaveBeenCalled();
  });
  it('removes only old application scan directories and skips symlinks', async () => {
    process.env.FILE_TEMP_SCAN_CLEANUP_ENABLED = 'true';
    process.env.FILE_MALWARE_SCAN_TIMEOUT_MS = '30000';
    const entry = (name: string, directory: boolean, symlink = false) => ({
      name,
      isDirectory: () => directory,
      isSymbolicLink: () => symlink,
    });
    (fs.readdir as jest.Mock).mockResolvedValue([
      entry('hrms-upload-scan-old', true),
      entry('hrms-upload-scan-new', true),
      entry('hrms-upload-scan-link', false, true),
      entry('other-dir', true),
    ]);
    (fs.lstat as jest.Mock).mockImplementation(async (path: string) => ({
      isDirectory: () => true,
      isSymbolicLink: () => false,
      mtimeMs: Date.now() - (path.endsWith('-old') ? 8 : 1) * 86400000,
      ctimeMs: Date.now() - (path.endsWith('-old') ? 8 : 1) * 86400000,
    }));
    await service.run();
    expect(fs.rm).toHaveBeenCalledTimes(1);
    expect(fs.rm).toHaveBeenCalledWith(join(tmpdir(), 'hrms-upload-scan-old'), {
      recursive: true,
      force: true,
    });
  });
});
