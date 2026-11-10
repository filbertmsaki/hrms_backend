import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  const createGateway = (config: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;

    return new NotificationsGateway(
      {} as JwtService,
      configService,
      {} as Repository<CompanyUser>,
      {} as TokenBlacklistService,
      {} as Repository<User>,
    );
  };

  const getRedisChannel = (gateway: NotificationsGateway): string =>
    (gateway as unknown as { redisChannel: string }).redisChannel;

  it.each([
    ['production', 'hrms:production:notifications:realtime'],
    ['uat', 'hrms:uat:notifications:realtime'],
  ])('uses an environment-specific channel for %s', (appEnv, expected) => {
    const gateway = createGateway({ APP_ENV: appEnv });

    expect(getRedisChannel(gateway)).toBe(expected);
  });

  it('sends inbox updates only to the affected company without request details', async () => {
    const gateway = createGateway({ APP_ENV: 'uat' });
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    Object.assign(gateway, { server: { to } });
    await gateway.onActionInboxChanged({ companyId: 10 });
    expect(to).toHaveBeenCalledWith('company:10');
    expect(emit).toHaveBeenCalledWith('action-inbox:changed', {});
    to.mockClear();
    await gateway.onActionInboxChanged({ companyId: 0 });
    expect(to).not.toHaveBeenCalled();
  });

  it('uses the configured notification channel when provided', () => {
    const gateway = createGateway({
      APP_ENV: 'uat',
      REDIS_NOTIFICATION_CHANNEL: 'custom:notifications',
    });

    expect(getRedisChannel(gateway)).toBe('custom:notifications');
  });
});
