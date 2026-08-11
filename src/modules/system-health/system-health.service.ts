import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { statfs } from 'fs/promises';
import { createClient } from 'redis';
import { DataSource } from 'typeorm';

type CheckResult = {
  status: 'up' | 'down';
  duration_ms?: number;
  optional?: boolean;
  error?: string;
  [key: string]: unknown;
};

@Injectable()
export class SystemHealthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async readiness() {
    const startedAt = Date.now();

    const [database, redis, disk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkDisk(),
    ]);

    const checks = { database, redis, disk };
    const ready = Object.values(checks).every((check) => check.status === 'up');

    const exposeDetails = this.config.get<boolean>(
      'HEALTH_EXPOSE_DETAILS',
      false,
    );

    const response = {
      status: ready ? 'ready' : 'not_ready',
      duration_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      checks: exposeDetails
        ? checks
        : Object.fromEntries(
            Object.entries(checks).map(([key, value]) => [
              key,
              { status: value.status },
            ]),
          ),
    };

    if (!ready) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  private async checkDatabase(): Promise<CheckResult> {
    const startedAt = Date.now();

    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', duration_ms: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Database check failed',
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const required = this.config.get<boolean>('USE_REDIS', false);

    if (!required) {
      return { status: 'up', optional: true };
    }

    const redisUrl = this.config.get<string>('REDIS_URL');

    if (!redisUrl) {
      return { status: 'down', error: 'REDIS_URL is not configured' };
    }

    const startedAt = Date.now();
    const client = createClient({ url: redisUrl });

    try {
      await client.connect();
      await client.ping();
      return { status: 'up', duration_ms: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Redis check failed',
      };
    } finally {
      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  private async checkDisk(): Promise<CheckResult> {
    try {
      const path = this.config.get<string>('HEALTH_DISK_PATH', '.');
      const minimum = this.config.get<number>(
        'HEALTH_DISK_MIN_FREE_BYTES',
        1024 * 1024 * 1024,
      );

      const result = await statfs(path);
      const available = result.bavail * result.bsize;

      return {
        status: available >= minimum ? 'up' : 'down',
        available_bytes: available,
        minimum_bytes: minimum,
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Disk check failed',
      };
    }
  }
}
