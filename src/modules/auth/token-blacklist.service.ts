import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class TokenBlacklistService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType | null = null;
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isEnabled = this.getBooleanConfig('USE_REDIS', false);
  }

  private getBooleanConfig(key: string, defaultValue: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }

    return defaultValue;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.log(
        'Redis token blacklisting is disabled (USE_REDIS=false or not set). ' +
          'Redis token blacklist cache is disabled. Database token-version validation remains active.',
      );
      return;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'USE_REDIS=true but REDIS_URL is missing, so blacklisting is disabled.',
      );
      return;
    }

    this.logger.log('Connecting to Redis for token revocation cache.');

    this.client = createClient({ url: redisUrl });

    this.client.on('error', (err) => {
      this.logger.error(
        'Redis token blacklist cache is unavailable. Database token-version validation remains active.',
        err,
      );
      this.client = null;
    });

    try {
      await this.client.connect();
      this.logger.log('Redis connected successfully');
    } catch (err) {
      this.logger.error(
        'Redis token blacklist cache is unavailable. Database token-version validation remains active.',
        err,
      );
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      try {
        await this.client.quit();
        this.logger.log('Redis disconnected cleanly');
      } catch (err) {
        this.logger.warn('Redis disconnect failed (ignored)', err);
      }
    }
  }

  async addToBlacklist(token: string, ttlSeconds: number): Promise<void> {
    if (!this.isEnabled || !this.client?.isOpen) {
      return;
    }

    try {
      await this.client.set(`blacklist:${token}`, 'true', { EX: ttlSeconds });
    } catch (err) {
      this.logger.warn('Failed to blacklist token (skipped)', err);
    }
  }

  async isBlacklisted(token: string): Promise<boolean> {
    if (!this.isEnabled || !this.client?.isOpen) {
      return false;
    }

    try {
      const value = await this.client.get(`blacklist:${token}`);
      return value !== null;
    } catch (err) {
      this.logger.warn(
        'Failed to check Redis blacklist cache. Database revocation validation will still be applied.',
        err,
      );
      return false;
    }
  }
}
