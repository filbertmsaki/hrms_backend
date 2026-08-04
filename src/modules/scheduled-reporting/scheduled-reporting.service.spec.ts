import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduledReportingService } from './scheduled-reporting.service';
import { ReportSmtpTestStatusEnum } from './enums/report-smtp-test-status.enum';
import { ReportSmtpSecurityTypeEnum } from './enums/report-smtp-security-type.enum';
import { ReportRegistryService } from './services/report-registry.service';
import { ReportSmtpService } from './services/report-smtp.service';

type RepositoryMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock<Record<string, unknown>, [Record<string, unknown>]>;
  save: jest.Mock<Promise<Record<string, unknown>>, [Record<string, unknown>]>;
  remove: jest.Mock;
  delete: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepositoryMock(): RepositoryMock {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 1, ...value }),
    ),
    remove: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
}

describe('ScheduledReportingService', () => {
  let service: ScheduledReportingService;
  let reportDefinitionRepository: ReturnType<typeof createRepositoryMock>;
  let reportSmtpConfigurationRepository: ReturnType<
    typeof createRepositoryMock
  >;
  let reportTemplateRepository: ReturnType<typeof createRepositoryMock>;
  let reportTemplateRecipientRepository: ReturnType<
    typeof createRepositoryMock
  >;
  let reportScheduleRepository: ReturnType<typeof createRepositoryMock>;
  let reportScheduleWeekdayRepository: ReturnType<typeof createRepositoryMock>;
  let reportExecutionRepository: ReturnType<typeof createRepositoryMock>;
  let reportExecutionRecipientRepository: ReturnType<
    typeof createRepositoryMock
  >;
  let reportExecutionAttemptRepository: ReturnType<typeof createRepositoryMock>;
  let companyUserRepository: ReturnType<typeof createRepositoryMock>;
  let employeeRepository: ReturnType<typeof createRepositoryMock>;
  let departmentRepository: ReturnType<typeof createRepositoryMock>;
  let roleRepository: ReturnType<typeof createRepositoryMock>;
  let reportSmtpService: {
    testDraftConfiguration: jest.Mock;
    verifyProofOrThrow: jest.Mock;
  };

  beforeEach(() => {
    reportDefinitionRepository = createRepositoryMock();
    reportSmtpConfigurationRepository = createRepositoryMock();
    reportTemplateRepository = createRepositoryMock();
    reportTemplateRecipientRepository = createRepositoryMock();
    reportScheduleRepository = createRepositoryMock();
    reportScheduleWeekdayRepository = createRepositoryMock();
    reportExecutionRepository = createRepositoryMock();
    reportExecutionRecipientRepository = createRepositoryMock();
    reportExecutionAttemptRepository = createRepositoryMock();
    companyUserRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    departmentRepository = createRepositoryMock();
    roleRepository = createRepositoryMock();
    reportSmtpService = {
      testDraftConfiguration: jest.fn().mockResolvedValue({
        testedAt: new Date('2026-07-31T08:00:00.000Z'),
      }),
      verifyProofOrThrow: jest.fn(),
    };

    service = new ScheduledReportingService(
      reportDefinitionRepository as never,
      reportSmtpConfigurationRepository as never,
      reportTemplateRepository as never,
      reportTemplateRecipientRepository as never,
      reportScheduleRepository as never,
      reportScheduleWeekdayRepository as never,
      reportExecutionRepository as never,
      reportExecutionRecipientRepository as never,
      reportExecutionAttemptRepository as never,
      companyUserRepository as never,
      employeeRepository as never,
      departmentRepository as never,
      roleRepository as never,
      { get: jest.fn() } as unknown as ConfigService,
      new ReportRegistryService({} as never, {} as never),
      reportSmtpService as unknown as ReportSmtpService,
    );
  });

  it('tests smtp before saving a new smtp configuration', async () => {
    reportSmtpConfigurationRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 1,
        companyId: 10,
        name: 'Primary SMTP',
      });

    await expect(
      service.createSmtpConfiguration(
        10,
        {
          email: 'admin@example.com',
          companyMembershipId: 22,
        } as never,
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
          isActive: true,
          isDefault: true,
        } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 1 }));

    expect(reportSmtpService.testDraftConfiguration).toHaveBeenCalled();
    const [savedConfiguration] =
      reportSmtpConfigurationRepository.save.mock.calls[0] ?? [];

    expect(savedConfiguration).toEqual(
      expect.objectContaining({
        lastTestStatus: ReportSmtpTestStatusEnum.SUCCESS,
      }),
    );
    expect(savedConfiguration?.encryptedPassword).toEqual(
      expect.stringContaining('enc:rpt:v1:'),
    );
  });

  it('rejects unregistered report definitions when creating templates', async () => {
    reportTemplateRepository.findOne.mockResolvedValue(null);
    reportDefinitionRepository.findOne.mockResolvedValue({
      id: 5,
      reportCode: 'ATTENDANCE_DETAILED',
      isActive: true,
      supportedFormats: ['PDF', 'XLSX', 'CSV'],
    });

    await expect(
      service.createTemplate(
        10,
        {
          companyMembershipId: 22,
        } as never,
        {
          reportDefinitionId: 5,
          name: 'Detailed report',
          isActive: false,
        } as never,
      ),
    ).rejects.toThrow(
      'The selected report "ATTENDANCE_DETAILED" is not registered or implemented and cannot be scheduled.',
    );
  });

  it('rejects invalid schedule timezones', async () => {
    reportScheduleRepository.findOne.mockResolvedValue(null);
    reportTemplateRepository.findOne.mockResolvedValue({
      id: 7,
      companyId: 10,
      isActive: true,
      recipients: [
        {
          channel: 'TO',
        },
      ],
    });

    await expect(
      service.createSchedule(
        10,
        {
          companyMembershipId: 22,
        } as never,
        {
          templateId: 7,
          name: 'Broken timezone',
          scheduleType: 'DAILY',
          executionTime: '08:00:00',
          timezone: 'Mars/Phobos',
          isActive: true,
        } as never,
      ),
    ).rejects.toThrow(
      'The timezone "Mars/Phobos" is invalid for scheduled reporting.',
    );
  });

  it('rejects active schedules that point to inactive templates', async () => {
    reportScheduleRepository.findOne.mockResolvedValue(null);
    reportTemplateRepository.findOne.mockResolvedValue({
      id: 7,
      companyId: 10,
      isActive: false,
      recipients: [
        {
          channel: 'TO',
        },
      ],
    });

    await expect(
      service.createSchedule(
        10,
        {
          companyMembershipId: 22,
        } as never,
        {
          templateId: 7,
          name: 'Inactive template schedule',
          scheduleType: 'DAILY',
          executionTime: '08:00:00',
          timezone: 'Africa/Dar_es_Salaam',
          isActive: true,
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'An active report schedule must reference an active report template.',
      ),
    );
  });
});
