import { ConfigService } from '@nestjs/config';
import { ReportSmtpSecurityTypeEnum } from '../enums/report-smtp-security-type.enum';
import { ReportSmtpService, type SmtpTestResult } from './report-smtp.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

type MockedNodemailer = {
  default: {
    createTransport: jest.Mock<
      { verify: jest.Mock; sendMail: jest.Mock },
      [unknown]
    >;
  };
};

const mockedNodemailer = jest.requireMock<MockedNodemailer>('nodemailer');
const mockCreateTransport = mockedNodemailer.default.createTransport;
const mockVerify = jest.fn<Promise<void>, []>();
const mockSendMail = jest.fn<Promise<SentMailResult>, [SentMessage]>();

type SentMessage = {
  to?: string[];
  subject?: string;
  text?: string;
};

type SentMailResult = {
  accepted: string[];
  rejected: string[];
  response: string;
  messageId: string;
};

describe('ReportSmtpService', () => {
  let service: ReportSmtpService;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    mockVerify.mockReset().mockResolvedValue(undefined);
    mockSendMail.mockReset().mockResolvedValue({
      accepted: ['override@example.com'],
      rejected: [],
      response: '250 OK',
      messageId: 'message-1',
    });
    mockCreateTransport.mockReset().mockReturnValue({
      verify: mockVerify,
      sendMail: mockSendMail,
    } as never);

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          APP_NAME: 'Alliance HRMS',
          APP_ENV: 'production',
          NODE_ENV: 'production',
          APP_KEY: 'test-app-key',
          MAIL_OVERRIDE_ENABLED: true,
          MAIL_TEST_TO: 'override@example.com',
          MAIL_TEST_CC: '',
          MAIL_TEST_BCC: '',
          MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY: true,
          MAIL_OVERRIDE_SUBJECT_PREFIX: '[TEST]',
        };
        return values[key];
      }),
    };

    service = new ReportSmtpService(configService as unknown as ConfigService);
  });

  it('tests smtp drafts and applies recipient override safely', async () => {
    const result: SmtpTestResult = await service.testDraftConfiguration(
      10,
      'admin@example.com',
      {
        name: 'Primary SMTP',
        host: 'smtp.example.com',
        port: 587,
        securityType: ReportSmtpSecurityTypeEnum.STARTTLS,
        username: 'mailer@example.com',
        password: 'secret',
        senderName: 'Alliance HRMS',
        senderEmail: 'sender@example.com',
        replyToEmail: 'reply@example.com',
        connectionTimeoutMs: 5000,
      },
      'real.user@example.com',
      true,
    );

    expect(mockCreateTransport).toHaveBeenCalled();
    const [sentMessage] = mockSendMail.mock.calls[0] ?? [];

    expect(sentMessage).toEqual(
      expect.objectContaining({
        to: ['override@example.com'],
        subject: '[TEST] Scheduled Reporting SMTP Test',
      }),
    );
    expect(sentMessage?.text).toEqual(
      expect.stringContaining('TEST EMAIL - RECIPIENT OVERRIDE ENABLED'),
    );
    expect(result.smtpTestToken).toContain('.');
    expect(result.messageId).toBe('message-1');
  });

  it('rejects changed smtp payloads against the original proof token', async () => {
    const result: SmtpTestResult = await service.testDraftConfiguration(
      10,
      'admin@example.com',
      {
        name: 'Primary SMTP',
        host: 'smtp.example.com',
        port: 587,
        securityType: ReportSmtpSecurityTypeEnum.STARTTLS,
        username: 'mailer@example.com',
        password: 'secret',
        senderName: 'Alliance HRMS',
        senderEmail: 'sender@example.com',
        replyToEmail: 'reply@example.com',
        connectionTimeoutMs: 5000,
      },
      'real.user@example.com',
      false,
    );

    expect(() =>
      service.verifyProofOrThrow(10, result.smtpTestToken, {
        name: 'Primary SMTP',
        host: 'smtp.changed.example.com',
        port: 587,
        securityType: ReportSmtpSecurityTypeEnum.STARTTLS,
        username: 'mailer@example.com',
        password: 'secret',
        senderName: 'Alliance HRMS',
        senderEmail: 'sender@example.com',
        replyToEmail: 'reply@example.com',
        connectionTimeoutMs: 5000,
      }),
    ).toThrow('SMTP configuration changed after testing');
  });
});
