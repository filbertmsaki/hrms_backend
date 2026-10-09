import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { hashPassword } from '../../../common/utils/hash.util';
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

  function createHarness(options?: {
    mailFailure?: Error;
    frontendUrl?: string;
  }) {
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
    const companyUserRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 20,
        company_id: 1,
        user: { id: 10, email: 'hr@example.com' },
        employee: null,
        role_assignments: [],
        permission_assignments: [],
      }),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(false),
    };
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
    const mailService = {
      sendGenericNotificationEmail: options?.mailFailure
        ? jest.fn().mockRejectedValue(options.mailFailure)
        : jest.fn().mockResolvedValue({ messageId: 'mail-123' }),
    };
    const smsService = {
      sendGenericNotificationSms: jest
        .fn()
        .mockResolvedValue({ reference: 'sms-123' }),
    };
    const employeesService = {
      create: jest.fn().mockResolvedValue({ id: 91 }),
      createInTransaction: jest.fn().mockResolvedValue({ employeeId: 91 }),
    };
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 77,
        email: dto.email,
      }),
      updatePassword: jest.fn().mockResolvedValue(undefined),
      markEmailVerified: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'APP_FRONTEND_URL') {
          return options?.frontendUrl ?? 'http://localhost:3000';
        }
        if (key === 'EMPLOYEE_INVITATION_TTL_HOURS') return 72;
        return fallback;
      }),
    };
    const transactionalUserRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 77,
        password: 'old',
        is_email_verified: false,
      }),
      save: jest.fn(async (value) => value),
    };
    const lockedInvitationQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn(),
    };
    const transactionalInvitationRepository = {
      createQueryBuilder: jest.fn(() => lockedInvitationQuery),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity.name === 'EmployeeInvitation'
          ? transactionalInvitationRepository
          : transactionalUserRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(async (work) => work(manager)),
    };

    const service = new EmployeeInvitationsService(
      invitationRepository as never,
      companyRepository as never,
      userRepository as never,
      companyUserRepository as never,
      branchRepository as never,
      departmentRepository as never,
      positionRepository as never,
      employeeRepository as never,
      workflowRepository as never,
      mailService as never,
      smsService as never,
      employeesService as never,
      usersService as never,
      configService as never,
      dataSource as never,
    );

    return {
      service,
      invitationRepository,
      companyUserRepository,
      userRepository,
      mailService,
      smsService,
      employeesService,
      usersService,
      dataSource,
      lockedInvitationQuery,
      transactionalUserRepository,
    };
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
    const { service, mailService, smsService } = createHarness();

    const result = await service.create(1, dto, actor);

    expect(mailService.sendGenericNotificationEmail).toHaveBeenCalledTimes(1);
    expect(smsService.sendGenericNotificationSms).toHaveBeenCalledTimes(1);
    expect(smsService.sendGenericNotificationSms).toHaveBeenCalledWith(
      dto.phone,
      'Employee invitation',
      'Amina Moshi, Alliance has invited you to complete your employee registration. Check your email for the registration link.',
    );
    expect(result.delivery).toEqual({
      email: {
        status: EmployeeInvitationDeliveryStatus.SENT,
        message_id: 'mail-123',
        last_error: null,
        transport: 'system_smtp',
      },
      sms: {
        status: EmployeeInvitationDeliveryStatus.ACCEPTED,
        message_id: 'sms-123',
        last_error: null,
        transport: 'sms_gateway',
      },
    });
    expect(result).not.toHaveProperty('token');
    expect(result.status).toBe(EmployeeInvitationStatus.PENDING);
  });

  it('keeps the registration link out of SMS when public HTTPS is configured', async () => {
    const { service, smsService } = createHarness({
      frontendUrl: 'https://hrms.alliance.co.tz',
    });

    await service.create(1, dto, actor);

    expect(smsService.sendGenericNotificationSms).toHaveBeenCalledWith(
      dto.phone,
      'Employee invitation',
      'Amina Moshi, Alliance has invited you to complete your employee registration. Check your email for the registration link.',
    );
  });

  it('marks the employee email verified when the invitation is accepted', async () => {
    const {
      service,
      invitationRepository,
      employeesService,
      lockedInvitationQuery,
      transactionalUserRepository,
      dataSource,
    } = createHarness();
    const invitation = {
      id: 44,
      companyId: 1,
      status: EmployeeInvitationStatus.PENDING,
      tokenHash: createHash('sha256')
        .update('valid-invitation-token')
        .digest('hex'),
      firstName: dto.first_name,
      lastName: dto.last_name,
      gender: dto.gender,
      email: dto.email,
      phone: dto.phone,
      primaryBranchId: dto.primary_branch_id,
      primaryDepartmentId: dto.primary_department_id,
      primaryPositionId: dto.primary_position_id,
      employmentType: dto.employment_type,
      reportsTo: null,
      hireDate: null,
      onboardingWorkflowId: dto.onboarding_workflow_id,
      createdByCompanyUserId: 20,
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      acceptedEmployeeId: null,
    };
    invitationRepository.findOneBy.mockResolvedValue(invitation);
    lockedInvitationQuery.getOneOrFail.mockResolvedValue(invitation);
    transactionalUserRepository.findOneBy.mockResolvedValueOnce(null);

    const result = await service.accept('valid-invitation-token', {
      password: 'StrongPass#2026',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(employeesService.createInTransaction).toHaveBeenCalledTimes(1);
    expect(transactionalUserRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 77,
        is_email_verified: true,
        password: expect.any(String),
      }),
    );
    expect(invitation.status).toBe(EmployeeInvitationStatus.ACCEPTED);
    expect(invitation.acceptedEmployeeId).toBe(91);
    expect(result).toEqual({
      status: EmployeeInvitationStatus.ACCEPTED,
      employee_id: 91,
      login_url: 'http://localhost:3000/login',
    });
  });

  describe('accepting when the invitee may already have an account', () => {
    const token = 'existing-account-token';

    function pendingInvitation() {
      return {
        id: 44,
        companyId: 1,
        status: EmployeeInvitationStatus.PENDING,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        firstName: dto.first_name,
        lastName: dto.last_name,
        gender: dto.gender,
        email: dto.email,
        phone: dto.phone,
        primaryBranchId: dto.primary_branch_id,
        primaryDepartmentId: dto.primary_department_id,
        primaryPositionId: dto.primary_position_id,
        employmentType: dto.employment_type,
        reportsTo: null,
        hireDate: null,
        onboardingWorkflowId: null,
        createdByCompanyUserId: 20,
        expiresAt: new Date(Date.now() + 60_000),
        acceptedAt: null,
        acceptedEmployeeId: null,
      };
    }

    async function setup() {
      const harness = createHarness();
      const invitation = pendingInvitation();
      harness.invitationRepository.findOneBy.mockResolvedValue(invitation);
      harness.lockedInvitationQuery.getOneOrFail.mockResolvedValue(invitation);
      const existingHash = await hashPassword('MyCurrent#Pass1');
      const existingUser = {
        id: 77,
        email: dto.email,
        password: existingHash,
        is_email_verified: true,
        must_set_password: false,
      };
      return { ...harness, invitation, existingUser, existingHash };
    }

    it('keeps the existing password when the invitee confirms it', async () => {
      const {
        service,
        invitation,
        existingUser,
        existingHash,
        employeesService,
        transactionalUserRepository,
      } = await setup();
      transactionalUserRepository.findOneBy.mockResolvedValue(existingUser);

      const result = await service.accept(token, {
        password: 'MyCurrent#Pass1',
      });

      expect(employeesService.createInTransaction).toHaveBeenCalledTimes(1);
      expect(transactionalUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 77,
          password: existingHash,
          must_set_password: false,
        }),
      );
      expect(invitation.status).toBe(EmployeeInvitationStatus.ACCEPTED);
      expect(result.employee_id).toBe(91);
    });

    it('accepts an existing account whose old password is not "strong"', async () => {
      const { service, existingUser, transactionalUserRepository } =
        await setup();
      existingUser.password = await hashPassword('legacy123');
      const legacyHash = existingUser.password;
      transactionalUserRepository.findOneBy.mockResolvedValue(existingUser);

      await service.accept(token, { password: 'legacy123' });

      expect(transactionalUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ password: legacyHash }),
      );
    });

    it('rejects a wrong password without creating the employee or touching the account', async () => {
      const {
        service,
        invitation,
        existingUser,
        existingHash,
        employeesService,
        transactionalUserRepository,
      } = await setup();
      transactionalUserRepository.findOneBy.mockResolvedValue(existingUser);

      await expect(
        service.accept(token, { password: 'Attacker#Pass9' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(employeesService.createInTransaction).not.toHaveBeenCalled();
      expect(transactionalUserRepository.save).not.toHaveBeenCalled();
      expect(existingUser.password).toBe(existingHash);
      expect(invitation.status).toBe(EmployeeInvitationStatus.PENDING);
    });

    it('rejects a weak password for a brand-new account', async () => {
      const { service, employeesService, transactionalUserRepository } =
        await setup();
      transactionalUserRepository.findOneBy.mockResolvedValue(null);

      await expect(service.accept(token, { password: 'weak' })).rejects.toThrow(
        /at least 8 characters/,
      );
      expect(employeesService.createInTransaction).not.toHaveBeenCalled();
    });

    it('tells the registration page whether an account already exists', async () => {
      const { service, userRepository } = await setup();

      userRepository.exists.mockResolvedValueOnce(true);
      await expect(service.findPublic(token)).resolves.toEqual(
        expect.objectContaining({ has_existing_account: true }),
      );

      userRepository.exists.mockResolvedValueOnce(false);
      await expect(service.findPublic(token)).resolves.toEqual(
        expect.objectContaining({ has_existing_account: false }),
      );
      expect(userRepository.exists).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
    });
  });

  it('rejects an acceptance token replaced by a resend before the row lock', async () => {
    const {
      service,
      invitationRepository,
      lockedInvitationQuery,
      employeesService,
    } = createHarness();
    const invitation = {
      id: 44,
      companyId: 1,
      status: EmployeeInvitationStatus.PENDING,
      tokenHash: createHash('sha256').update('old-token').digest('hex'),
      expiresAt: new Date(Date.now() + 60000),
      createdByCompanyUserId: 20,
      email: dto.email,
    };
    invitationRepository.findOneBy.mockResolvedValue(invitation);
    lockedInvitationQuery.getOneOrFail.mockResolvedValue({
      ...invitation,
      tokenHash: 'replacement',
    });

    await expect(
      service.accept('old-token', { password: 'StrongPass#2026' }),
    ).rejects.toThrow('This invitation is no longer available');
    expect(employeesService.createInTransaction).not.toHaveBeenCalled();
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
    expect(result.delivery.email.transport).toBe('system_smtp');
    expect(result.delivery.sms.status).toBe(
      EmployeeInvitationDeliveryStatus.ACCEPTED,
    );
  });

  it('restores the invitation owner data scope for employee creation', async () => {
    const { service, companyUserRepository } = createHarness();
    companyUserRepository.findOne.mockResolvedValue({
      id: 20,
      user: { id: 10, email: 'hr@example.com' },
      employee: { id: 30 },
      role_assignments: [
        {
          role: {
            name: 'HR Manager',
            permissions: [
              { name: 'employees:create' },
              { name: 'data_scope:company' },
            ],
          },
        },
      ],
      permission_assignments: [{ permission: { name: 'employees:read' } }],
    });

    const resolvedActor = await (
      service as unknown as {
        resolveInvitationActor(invitation: {
          companyId: number;
          createdByCompanyUserId: number;
        }): Promise<{
          employeeId?: number;
          roles: string[];
          permissions: string[];
        }>;
      }
    ).resolveInvitationActor({
      companyId: 1,
      createdByCompanyUserId: 20,
    });

    expect(resolvedActor.employeeId).toBe(30);
    expect(resolvedActor.roles).toEqual(['HR Manager']);
    expect(resolvedActor.permissions).toEqual(
      expect.arrayContaining([
        'employees:create',
        'employees:read',
        'data_scope:company',
      ]),
    );
    expect(companyUserRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.objectContaining({
          employee: true,
          role_assignments: expect.any(Object),
          permission_assignments: expect.any(Object),
        }),
      }),
    );
  });
});
