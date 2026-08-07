import axios from 'axios';
import { ConfigService } from '@nestjs/config';
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

  beforeEach(() => {
    jest.resetAllMocks();

    const configService = {
      get: jest.fn(
        <T>(key: string, defaultValue?: T) =>
          (configMap[key] as T | undefined) ?? defaultValue,
      ),
      getOrThrow: jest.fn(<T>(key: string) => configMap[key] as T),
    } as unknown as ConfigService;

    service = new SmsService(configService);
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
      service.sendGenericNotificationSms('+255700000000', 'Alert', 'Rejected'),
    ).rejects.toThrow('SMS gateway rejected the request (500): Rejected');
  });
});
