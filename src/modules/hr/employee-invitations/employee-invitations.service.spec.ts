import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { EmployeeInvitationsService } from './employee-invitations.service';
import {
  EmployeeInvitationChannel,
  EmployeeInvitationDeliveryStatus,
  EmployeeInvitationStatus,
} from './enums/employee-invitation.enum';

describe('EmployeeInvitationsService', () => {
  const dto = {
    first_name: 'Amina',
    last_name: 'Moshi',
    gender: 'female',
    email: 'amina@example.com',
    phone: '+255712345678',
    primary_branch_id: 2,
    primary_department_id: 5,
    primary_position_id: 9,
    employment_type: EmploymentTypeEnum.FULL_TIME,
    onboarding_workflow_id: 3,
    channels: [EmployeeInvitationChannel.EMAIL, EmployeeInvitationChannel.SMS],
  };

  function createHarness(options?: { mailFailure?: Error }) {
    const duplicateQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const invitationRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        value.id ??= 44;
        value.createdAt ??= new Date();
        value.updatedAt ??= new Date();
        return value;
      }),
      createQueryBuilder: jest.fn(() => duplicateQuery),
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn(),
      update: jest.fn(),
    };
    const companyRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 1, name: 'Alliance' }),
    };
    const userRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const branchRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 2, company_id: 1 }),
    };
    const departmentRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 5,
        company_id: 1,
        branch_id: 2,
      }),
    };
    const positionRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 9,
        company_id: 1,
        branch_id: 2,
        department_id: 5,
      }),
    };
    const employeeRepository = { findOneBy: jest.fn() };
    const workflowRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 3, company_id: 1 }),
    };
    const reportSmtpService = {
      sendCompanyEmail: options?.mailFailure
        ? jest.fn().mockRejectedValue(options.mailFailure)
        : jest.fn().mockResolvedValue({ messageId: 'mail-123' }),
    };
    const smsService = {
      sendGenericNotificationSms: jest
        .fn()
        .mockResolvedValue({ reference: 'sms-123' }),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'APP_FRONTEND_URL') return 'http://localhost:3000';
        if (key === 'EMPLOYEE_INVITATION_TTL_HOURS') return 72;
        return fallback;
      }),
    };

    const service = new EmployeeInvitationsService(
      invitationRepository as never,
      companyRepository as never,
      userRepository as never,
      {} as never,
      branchRepository as never,
      departmentRepository as never,
      positionRepository as never,
      employeeRepository as never,
      workflowRepository as never,
      reportSmtpService as never,
      smsService as never,
      {} as never,
      {} as never,
      configService as never,
    );

    return { service, invitationRepository, reportSmtpService, smsService };
  }

  const actor = {
    id: 10,
    email: 'hr@example.com',
    scope: 'company' as const,
    userType: 'COMPANY_USER' as const,
    companyId: 1,
    companyMembershipId: 20,
    roles: [],
    permissions: ['employees:create'],
  };

  it('lists only pending invitations for the current company', async () => {
    const { service, invitationRepository } = createHarness();
    invitationRepository.find.mockResolvedValue([
      {
        id: 44,
        status: EmployeeInvitationStatus.PENDING,
        firstName: 'Amina',
        lastName: 'Moshi',
        email: 'amina@example.com',
        phone: '+255712345678',
        expiresAt: new Date('2026-09-12T10:00:00.000Z'),
        emailDeliveryStatus: EmployeeInvitationDeliveryStatus.SENT,
        emailMessageId: 'mail-123',
        emailLastError: null,
        smsDeliveryStatus: EmployeeInvitationDeliveryStatus.SENT,
        smsMessageId: 'sms-123',
        smsLastError: null,
      },
    ]);

    const result = await service.findPending(1);

    expect(invitationRepository.find).toHaveBeenCalledWith({
      where: { companyId: 1, status: EmployeeInvitationStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 44,
        status: EmployeeInvitationStatus.PENDING,
        email: 'amina@example.com',
        phone: '+255712345678',
      }),
    ]);
  });

  it('sends through email and SMS without returning the token', async () => {
    const { service, reportSmtpService, smsService } = createHarness();

    const result = await service.create(1, dto, actor);

    expect(reportSmtpService.sendCompanyEmail).toHaveBeenCalledTimes(1);
    expect(smsService.sendGenericNotificationSms).toHaveBeenCalledTimes(1);
    expect(smsService.sendGenericNotificationSms).toHaveBeenCalledWith(
      dto.phone,
      'Employee invitation',
      expect.stringContaining('Alliance has invited you'),
      expect.stringMatching(
        /^http:\/\/localhost:3000\/register\?token=[a-f0-9]{64}$/,
      ),
    );
    expect(result.delivery).toEqual({
      email: {
        status: EmployeeInvitationDeliveryStatus.SENT,
        message_id: 'mail-123',
        last_error: null,
        transport: 'company_smtp',
      },
      sms: {
        status: EmployeeInvitationDeliveryStatus.SENT,
        message_id: 'sms-123',
        last_error: null,
        transport: 'sms_gateway',
      },
    });
    expect(result).not.toHaveProperty('token');
    expect(result.status).toBe(EmployeeInvitationStatus.PENDING);
  });

  it('records a failed email while preserving successful SMS delivery', async () => {
    const { service } = createHarness({
      mailFailure: new Error('mail provider unavailable'),
    });

    const result = await service.create(1, dto, actor);

    expect(result.delivery.email.status).toBe(
      EmployeeInvitationDeliveryStatus.FAILED,
    );
    expect(result.delivery.email.last_error).toBe('mail provider unavailable');
    expect(result.delivery.email.transport).toBe('company_smtp');
    expect(result.delivery.sms.status).toBe(
      EmployeeInvitationDeliveryStatus.SENT,
    );
  });
});
