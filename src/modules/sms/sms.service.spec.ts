import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { SmsGlobalSetting } from './entities/sms-global-setting.entity';
import { SecurityEventsService } from '../security/security-events.service';
import {
  GLOBAL_SMS_SETTING_KEY,
  SmsSettingsService,
} from './sms-settings.service';
import { SmsService } from './sms.service';

jest.mock('axios');

describe('SmsService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const configMap: Record<string, string | number | boolean> = {
    SMS_GATEWAY_ENABLED: true,
    SMS_GATEWAY_URL: 'http://sms-gateway.local/bulksms',
    SMS_GATEWAY_USERNAME: 'gateway-user',
    SMS_GATEWAY_PASSWORD: 'gateway-pass',
    SMS_GATEWAY_SHORTCODE: 'ALLIANCE',
    SMS_GATEWAY_CHANNEL: '',
    SMS_GATEWAY_TIMEOUT_MS: 5000,
  };

  let service: SmsService;
  let switches: { key: string; isEnabled: boolean }[];
  let settings: SmsSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();

    const configService = {
      get: jest.fn(
        <T>(key: string, defaultValue?: T) =>
          (configMap[key] as T | undefined) ?? defaultValue,
      ),
      getOrThrow: jest.fn(<T>(key: string) => configMap[key] as T),
    } as unknown as ConfigService;

    switches = [{ key: GLOBAL_SMS_SETTING_KEY, isEnabled: true }];
    const repo = {
      findBy: jest.fn(async () => switches),
      createQueryBuilder: () => ({
        addSelect() {
          return this;
        },
        where() {
          return this;
        },
        getOne: async () => null,
      }),
    } as unknown as Repository<SmsGlobalSetting>;
    settings = new SmsSettingsService(
      repo,
      configService,
      {} as SecurityEventsService,
    );
    service = new SmsService(settings);
  });

  it('sends the SMS through the configured gateway and accepts provider code 200', async () => {
    mockedAxios.get.mockResolvedValue({
      data: '<response><error_code>200</error_code><message>Sent</message></response>',
    });

    const result = await service.sendGenericNotificationSms(
      '+255 712 345 678',
      'Alert',
      'Payroll ready',
      'https://example.com/payslip',
      17,
    );

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://sms-gateway.local/bulksms',
      expect.objectContaining({
        params: expect.objectContaining({
          msisdn: '255712345678',
          shortcode: 'ALLIANCE',
          username: 'gateway-user',
          password: 'gateway-pass',
        }),
      }),
    );
    expect(result.providerCode).toBe('200');
    expect(result.providerMessage).toBe('Sent');
  });

  it('throws when the provider returns a non-200 error code', async () => {
    mockedAxios.get.mockResolvedValue({
      data: '<response><error_code>500</error_code><message>Rejected</message></response>',
    });

    await expect(
      service.sendGenericNotificationSms(
        '+255700000000',
        'Alert',
        'Rejected',
        null,
        17,
      ),
    ).rejects.toThrow('SMS gateway rejected the request (500): Rejected');
  });
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'enforces platform %s and company %s at the provider boundary',
    async (platform, company) => {
      switches = [
        { key: GLOBAL_SMS_SETTING_KEY, isEnabled: platform },
        { key: 'COMPANY_SMS:17', isEnabled: company },
      ];
      mockedAxios.get.mockResolvedValue({
        data: '<response><error_code>200</error_code></response>',
      });
      const send = service.sendTextSms('+255700000000', 'Test routing', 17);
      if (platform && company) {
        await expect(send).resolves.toMatchObject({ providerCode: '200' });
      } else {
        await expect(send).rejects.toThrow(
          platform ? 'Company SMS is off' : 'Platform SMS is off',
        );
      }
      expect(mockedAxios.get).toHaveBeenCalledTimes(
        platform && company ? 1 : 0,
      );
    },
  );
  it('keeps the installation password out of platform settings responses', async () => {
    const status = await settings.gatewayStatus();
    expect(status.password_configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain('gateway-pass');
  });
});
