import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';

@Injectable()
export class AttendanceTempScanCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttendanceTempScanCleanupService.name);
  private readonly ageMs = 7 * 24 * 60 * 60 * 1000;
  constructor(private readonly locks: PostgresAdvisoryLockService) {}

  onApplicationBootstrap() {
    void this.run().catch((error: Error) =>
      this.logger.error(`Temporary scan cleanup failed: ${error.message}`),
    );
  }

  @Cron('0 59 23 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async run() {
    if (process.env.FILE_TEMP_SCAN_CLEANUP_ENABLED !== 'true') return;
    const timeout = Number(process.env.FILE_MALWARE_SCAN_TIMEOUT_MS ?? 30000);
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout >= this.ageMs) {
      this.logger.warn(
        'Temporary scan cleanup skipped because the scan timeout is invalid or exceeds the retention period.',
      );
      return;
    }
    await this.locks.runWithLock('files:temporary-scan-cleanup', async () => {
      let removed = 0;
      for (const entry of await fs.readdir(tmpdir(), { withFileTypes: true })) {
        if (
          !entry.name.startsWith('hrms-upload-scan-') ||
          !entry.isDirectory() ||
          entry.isSymbolicLink()
        )
          continue;
        const path = join(tmpdir(), entry.name);
        try {
          const stat = await fs.lstat(path);
          if (
            !stat.isDirectory() ||
            stat.isSymbolicLink() ||
            Date.now() - Math.max(stat.mtimeMs, stat.ctimeMs) < this.ageMs
          )
            continue;
          await fs.rm(path, { recursive: true, force: true });
          removed++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            this.logger.warn(
              `Could not remove an abandoned scan directory: ${(error as Error).message}`,
            );
        }
      }
      this.logger.log(
        `Removed ${removed} abandoned temporary scan directories.`,
      );
    });
  }
}
