import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { ContactTypeEnum } from '../hr/employees/enums/contact-type.enum';
import { SecurityEventsService } from '../security/security-events.service';
import { SmsLogStatusEnum } from './enums/sms-log-status.enum';
import { SmsGlobalSetting } from './entities/sms-global-setting.entity';
import { SmsNotificationLog } from './entities/sms-notification-log.entity';
import { SmsNotificationRegistry } from './entities/sms-notification-registry.entity';
import { SmsNotificationManagementService } from './sms-notification-management.service';
import { SmsService } from './sms.service';

describe('SmsNotificationManagementService', () => {
  let service: SmsNotificationManagementService;
  let globalSettingRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let registryRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let logRepository: {
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let companyUserRepository: {
    findOne: jest.Mock;
  };
  let employeeRepository: {
    findOne: jest.Mock;
  };
  let smsService: {
    sendTextSms: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let securityEventsService: {
    logBestEffort: jest.Mock;
  };
  let savedLogs: Array<Record<string, unknown>>;

  const actor = {
    id: 1,
    email: 'tester@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    roles: [],
    permissions: [],
    companyMembershipId: 91,
  } as AuthenticatedUser;

  const context = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    requestId: 'req-1',
  } as AuditRequestContext;

  beforeEach(() => {
    savedLogs = [];

    globalSettingRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => ({ ...value })),
    };
    registryRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      create: jest.fn((value) => ({ ...value })),
    };
    logRepository = {
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value: Record<string, unknown>) => {
        const persisted = {
          ...value,
          id: (value.id as number | undefined) ?? savedLogs.length + 1,
        };
        Object.assign(value, persisted);
        savedLogs.push(JSON.parse(JSON.stringify(persisted)));
        return value;
      }),
      createQueryBuilder: jest.fn(),
    };
    companyUserRepository = {
      findOne: jest.fn(),
    };
    employeeRepository = {
      findOne: jest.fn(),
    };
    smsService = {
      sendTextSms: jest.fn().mockResolvedValue({
        reference: 'sms-ref-1',
        providerCode: '200',
        rawResponse: 'sent',
      }),
    };
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'APP_NAME') {
          return 'HRMS';
        }

        return defaultValue ?? null;
      }),
    };
    securityEventsService = {
      logBestEffort: jest.fn(),
    };

    service = new SmsNotificationManagementService(
      globalSettingRepository as unknown as Repository<SmsGlobalSetting>,
      registryRepository as unknown as Repository<SmsNotificationRegistry>,
      logRepository as unknown as Repository<SmsNotificationLog>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      employeeRepository as unknown as Repository<Employee>,
      smsService as unknown as SmsService,
      configService as unknown as ConfigService,
      securityEventsService as unknown as SecurityEventsService,
    );

    jest.spyOn(service as any, 'ensureDefaults').mockResolvedValue(undefined);
  });

  it("resolves Bosco's unverified primary work contact to +255621991156", async () => {
    registryRepository.findOne.mockResolvedValue(
      buildRegistry('leave.rejected'),
    );
    companyUserRepository.findOne.mockResolvedValue(
      buildMembership({
        companyId: 17,
        membershipId: 44,
        userPhone: '+255712000999',
        employeeId: 24,
        employeeCompanyId: 17,
        contacts: [
          buildContact({
            id: 1,
            type: ContactTypeEnum.WORK,
            phone: '+255621991156',
            isPrimary: true,
            isVerified: false,
          }),
        ],
      }),
    );

    const result = await service.sendConfiguredNotification({
      code: 'leave.rejected',
      recipientCompanyUserId: 44,
      bypassGlobal: true,
    });

    expect(result).toEqual({ status: SmsLogStatusEnum.SENT, reason: null });
    expect(companyUserRepository.findOne).toHaveBeenCalledWith({
      where: { id: 44, status: 'active' },
      relations: { user: true, employee: { contacts: true } },
    });
    expect(smsService.sendTextSms).toHaveBeenCalledWith(
      '+255621991156',
      'Template for leave.rejected',
    );
    expect(savedLogs[0]?.recipientPhone).toBe('+255621991156');
  });

  it.each([
    ['+255621991156', '+255621991156'],
    ['0621991156', '+255621991156'],
    ['0712345678', '+255712345678'],
    ['255621991156', '+255621991156'],
    ['(0621) 991-156', '+255621991156'],
  ])(
    'normalizes %s to %s when selected from an employee contact',
    async (inputPhone, expectedPhone) => {
      registryRepository.findOne.mockResolvedValue(
        buildRegistry('leave.application.submitted'),
      );
      companyUserRepository.findOne.mockResolvedValue(
        buildMembership({
          companyId: 17,
          membershipId: 44,
          userPhone: '+255700000001',
          employeeId: 24,
          employeeCompanyId: 17,
          contacts: [
            buildContact({
              id: 1,
              type: ContactTypeEnum.WORK,
              phone: inputPhone,
              isPrimary: true,
            }),
          ],
        }),
      );

      const result = await service.sendConfiguredNotification({
        code: 'leave.application.submitted',
        recipientCompanyUserId: 44,
        bypassGlobal: true,
      });

      expect(result.status).toBe(SmsLogStatusEnum.SENT);
      expect(smsService.sendTextSms).toHaveBeenCalledWith(
        expectedPhone,
        'Template for leave.application.submitted',
      );
      expect(savedLogs[0]?.recipientPhone).toBe(expectedPhone);
    },
  );

  it('uses a secondary employee contact when the primary contact has no phone number', async () => {
    registryRepository.findOne.mockResolvedValue(
      buildRegistry('leave.approval.required'),
    );
    companyUserRepository.findOne.mockResolvedValue(
      buildMembership({
        companyId: 17,
        membershipId: 44,
        userPhone: '+255700000001',
        employeeId: 24,
        employeeCompanyId: 17,
        contacts: [
          buildContact({
            id: 1,
            type: ContactTypeEnum.PERSONAL,
            phone: null,
            isPrimary: true,
          }),
          buildContact({
            id: 2,
            type: ContactTypeEnum.WORK,
            phone: '0621991156',
          }),
        ],
      }),
    );

    await service.sendConfiguredNotification({
      code: 'leave.approval.required',
      recipientCompanyUserId: 44,
      bypassGlobal: true,
    });

    expect(smsService.sendTextSms).toHaveBeenCalledWith(
      '+255621991156',
      'Template for leave.approval.required',
    );
    expect(savedLogs[0]?.recipientPhone).toBe('+255621991156');
  });

  it('uses User.phone only as a fallback when no employee contact has a phone number', async () => {
    registryRepository.findOne.mockResolvedValue(
      buildRegistry('leave.rejected'),
    );

    companyUserRepository.findOne
      .mockResolvedValueOnce(
        buildMembership({
          companyId: 17,
          membershipId: 44,
          userPhone: '+255712000999',
          employeeId: 24,
          employeeCompanyId: 17,
          contacts: [
            buildContact({
              id: 1,
              type: ContactTypeEnum.WORK,
              phone: '+255621991156',
              isPrimary: true,
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        buildMembership({
          companyId: 17,
          membershipId: 44,
          userPhone: '0712000999',
          employeeId: 24,
          employeeCompanyId: 17,
          contacts: [
            buildContact({
              id: 1,
              type: ContactTypeEnum.WORK,
              phone: null,
              isPrimary: true,
            }),
          ],
        }),
      );

    await service.sendConfiguredNotification({
      code: 'leave.rejected',
      recipientCompanyUserId: 44,
      bypassGlobal: true,
    });
    await service.sendConfiguredNotification({
      code: 'leave.rejected',
      recipientCompanyUserId: 44,
      bypassGlobal: true,
    });

    expect(smsService.sendTextSms).toHaveBeenNthCalledWith(
      1,
      '+255621991156',
      'Template for leave.rejected',
    );
    expect(smsService.sendTextSms).toHaveBeenNthCalledWith(
      2,
      '+255712000999',
      'Template for leave.rejected',
    );
  });

  it('never selects employee contacts from another company', async () => {
    registryRepository.findOne.mockResolvedValue(
      buildRegistry('leave.rejected'),
    );
    companyUserRepository.findOne.mockResolvedValue(
      buildMembership({
        companyId: 17,
        membershipId: 44,
        userPhone: '0712000999',
        employeeId: 24,
        employeeCompanyId: 18,
        contacts: [
          buildContact({
            id: 1,
            type: ContactTypeEnum.WORK,
            phone: '+255621991156',
            isPrimary: true,
          }),
        ],
      }),
    );

    await service.sendConfiguredNotification({
      code: 'leave.rejected',
      recipientCompanyUserId: 44,
      bypassGlobal: true,
    });

    expect(smsService.sendTextSms).toHaveBeenCalledWith(
      '+255712000999',
      'Template for leave.rejected',
    );
    expect(savedLogs[0]?.recipientPhone).toBe('+255712000999');
  });

  it('writes a skipped log with a precise missing-phone error when no recipient phone exists', async () => {
    registryRepository.findOne.mockResolvedValue(
      buildRegistry('leave.rejected'),
    );
    companyUserRepository.findOne.mockResolvedValue(
      buildMembership({
        companyId: 17,
        membershipId: 44,
        userPhone: null,
        employeeId: 24,
        employeeCompanyId: 17,
        contacts: [
          buildContact({
            id: 1,
            type: ContactTypeEnum.WORK,
            phone: null,
            isPrimary: true,
          }),
        ],
      }),
    );

    const result = await service.sendConfiguredNotification({
      code: 'leave.rejected',
      recipientCompanyUserId: 44,
      bypassGlobal: true,
    });

    expect(result).toEqual({
      status: SmsLogStatusEnum.SKIPPED,
      reason: 'Recipient has no phone number',
    });
    expect(smsService.sendTextSms).not.toHaveBeenCalled();
    expect(savedLogs[0]?.recipientPhone).toBe('UNKNOWN');
    expect(savedLogs[0]?.errorMessage).toBe('Recipient has no phone number');
  });

  it('writes a skipped log with the invalid phone value when the selected recipient phone is malformed', async () => {
    registryRepository.findOne.mockResolvedValue(
      buildRegistry('leave.rejected'),
    );
    companyUserRepository.findOne.mockResolvedValue(
      buildMembership({
        companyId: 17,
        membershipId: 44,
        userPhone: '+255712000999',
        employeeId: 24,
        employeeCompanyId: 17,
        contacts: [
          buildContact({
            id: 1,
            type: ContactTypeEnum.WORK,
            phone: '12345',
            isPrimary: true,
          }),
        ],
      }),
    );

    const result = await service.sendConfiguredNotification({
      code: 'leave.rejected',
      recipientCompanyUserId: 44,
      bypassGlobal: true,
    });

    expect(result).toEqual({
      status: SmsLogStatusEnum.SKIPPED,
      reason: 'Recipient has no valid Tanzania phone number',
    });
    expect(smsService.sendTextSms).not.toHaveBeenCalled();
    expect(savedLogs[0]?.recipientPhone).toBe('12345');
    expect(savedLogs[0]?.errorMessage).toBe(
      'Recipient has no valid Tanzania phone number',
    );
  });

  it('re-resolves the recipient phone on retry after the employee contact is corrected', async () => {
    const existingLog = {
      id: 7,
      registryId: 3,
      notificationCode: 'leave.rejected',
      notificationName: 'Leave rejected',
      module: 'leave',
      recipientPhone: 'UNKNOWN',
      recipientCompanyUserId: 44,
      recipientEmployeeId: 24,
      message: 'Template for leave.rejected',
      templateSnapshot: 'Template for leave.rejected',
      relatedEntityType: null,
      relatedEntityId: null,
      status: SmsLogStatusEnum.SKIPPED,
    } as SmsNotificationLog;

    jest
      .spyOn(service as any, 'findLogWithScope')
      .mockResolvedValue(existingLog);
    jest
      .spyOn(service as any, 'assertEnabledForCode')
      .mockResolvedValue(buildRegistry('leave.rejected'));

    companyUserRepository.findOne.mockResolvedValue(
      buildMembership({
        companyId: 17,
        membershipId: 44,
        userPhone: null,
        employeeId: 24,
        employeeCompanyId: 17,
        contacts: [
          buildContact({
            id: 1,
            type: ContactTypeEnum.WORK,
            phone: '0621991156',
            isPrimary: true,
          }),
        ],
      }),
    );

    const retried = await service.retryFailedLog(7, actor, context, {
      companyId: 17,
    });

    expect(retried.status).toBe(SmsLogStatusEnum.SENT);
    expect(smsService.sendTextSms).toHaveBeenCalledWith(
      '+255621991156',
      'Template for leave.rejected',
    );
    expect(savedLogs[0]?.retryOfLogId).toBe(7);
    expect(savedLogs[0]?.recipientPhone).toBe('+255621991156');
  });
});

function buildRegistry(code: string): SmsNotificationRegistry {
  return {
    id: 3,
    code,
    name: code,
    module: 'leave',
    description: null,
    smsTemplate: `Template for ${code}`,
    isEnabled: true,
  } as SmsNotificationRegistry;
}

function buildMembership(input: {
  companyId: number;
  membershipId: number;
  userPhone: string | null;
  employeeId: number;
  employeeCompanyId: number;
  contacts: Array<ReturnType<typeof buildContact>>;
}): CompanyUser {
  return {
    id: input.membershipId,
    company_id: input.companyId,
    user_id: 8,
    status: 'active',
    user: {
      id: 8,
      phone: input.userPhone,
    },
    employee: {
      id: input.employeeId,
      company_id: input.employeeCompanyId,
      company_user_id: input.membershipId,
      contacts: input.contacts,
    },
  } as unknown as CompanyUser;
}

function buildContact(input: {
  id: number;
  type: ContactTypeEnum;
  phone: string | null;
  isPrimary?: boolean;
  isVerified?: boolean;
}) {
  return {
    id: input.id,
    contact_type: input.type,
    phone_number: input.phone,
    is_primary: input.isPrimary ?? false,
    is_verified: input.isVerified ?? false,
  };
}
