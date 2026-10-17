import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { hashPassword } from '../../../common/utils/hash.util';
import { RecruitmentCandidateStatus } from '../recruitment/entities/recruitment-candidate.entity';
import { EmployeeInvitationAcceptedEvent } from '../notifications/events/employee-invitation.events';
import { EmployeeInvitationsService } from './employee-invitations.service';
import {
  EmployeeInvitationChannel,
  EmployeeInvitationDeliveryStatus,
  EmployeeInvitationStatus,
} from './enums/employee-invitation.enum';

describe('EmployeeInvitationsService', () => {
  // Accept tests hash and compare real bcrypt passwords, which can exceed the
  // default 5s on a loaded machine or CI runner.
  jest.setTimeout(30_000);

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
    timeZone?: string;
  }) {
    const duplicateQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
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
      // Email lookups are case-insensitive query builders; route them to
      // findOne({ where: { email } }) so tests stub one method.
      createQueryBuilder: jest.fn(() => {
        let email = '';
        const qb = {
          where: jest.fn((_sql: string, params: { email: string }) => {
            email = params.email;
            return qb;
          }),
          getOne: () => userRepository.findOne({ where: { email } }),
        };
        return qb;
      }),
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
    const departmentPositionRepository = {
      findOneBy: jest.fn().mockResolvedValue({ headcount: 1 }),
    };
    const existingEmployeeQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const employeeRepository = {
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(() => existingEmployeeQuery),
    };
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
        if (key === 'APP_TIMEZONE' && options?.timeZone) {
          return options.timeZone;
        }
        return fallback;
      }),
      getOrThrow: jest.fn((key: string) => {
        const value = configService.get(key);
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
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
    const transactionalCandidateRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    // Case-insensitive user lookups go through a query builder; route them to
    // findOneBy so tests can keep queueing users with mockResolvedValueOnce.
    Object.assign(transactionalUserRepository, {
      createQueryBuilder: jest.fn(() => {
        const qb = {
          where: jest.fn(() => qb),
          getOne: () => transactionalUserRepository.findOneBy(),
        };
        return qb;
      }),
    });
    const transactionalEmployeeRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 91, employee_no: 'AICL/091' }),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity.name === 'EmployeeInvitation'
          ? transactionalInvitationRepository
          : entity.name === 'RecruitmentCandidate'
            ? transactionalCandidateRepository
            : entity.name === 'Employee'
              ? transactionalEmployeeRepository
              : transactionalUserRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(async (work) => work(manager)),
      query: jest.fn().mockResolvedValue([[], 0]),
    };

    const eventEmitter = { emit: jest.fn() };
    const service = new EmployeeInvitationsService(
      invitationRepository as never,
      companyRepository as never,
      userRepository as never,
      companyUserRepository as never,
      branchRepository as never,
      departmentRepository as never,
      positionRepository as never,
      departmentPositionRepository as never,
      employeeRepository as never,
      workflowRepository as never,
      mailService as never,
      smsService as never,
      employeesService as never,
      usersService as never,
      configService as never,
      dataSource as never,
      eventEmitter as never,
      {
        assertCanAccessBranch: jest.fn(),
        assertCanAccessDepartment: jest.fn(),
      } as never,
    );

    return {
      service,
      invitationRepository,
      companyUserRepository,
      userRepository,
      existingEmployeeQuery,
      positionRepository,
      duplicateQuery,
      mailService,
      smsService,
      employeesService,
      usersService,
      dataSource,
      eventEmitter,
      lockedInvitationQuery,
      transactionalUserRepository,
      transactionalCandidateRepository,
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
      where: {
        companyId: 1,
        status: EmployeeInvitationStatus.PENDING,
        expiresAt: expect.objectContaining({ _type: 'moreThan' }),
      },
      order: { createdAt: 'DESC' },
    });
    const { expiresAt } = invitationRepository.find.mock.calls[0][0].where;
    expect(Math.abs(expiresAt.value.getTime() - Date.now())).toBeLessThan(
      5_000,
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 44,
        status: EmployeeInvitationStatus.PENDING,
        email: 'amina@example.com',
        phone: '+255712345678',
      }),
    ]);
  });

  describe('rejecting recipients whose account details conflict', () => {
    type UserRow = { id: number; email: string; phone: string };

    function withUsers(
      harness: ReturnType<typeof createHarness>,
      byEmail: UserRow | null,
      byPhone: UserRow | null,
    ) {
      harness.userRepository.findOne.mockImplementation(
        async ({ where }: { where: { email?: string; phone?: string } }) =>
          where.email !== undefined ? byEmail : byPhone,
      );
    }

    async function expectRejected(
      harness: ReturnType<typeof createHarness>,
      message: RegExp,
    ) {
      await expect(harness.service.create(1, dto, actor)).rejects.toThrow(
        message,
      );
      expect(harness.invitationRepository.save).not.toHaveBeenCalled();
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).not.toHaveBeenCalled();
      expect(
        harness.smsService.sendGenericNotificationSms,
      ).not.toHaveBeenCalled();
    }

    it('rejects an email and phone that belong to two different accounts', async () => {
      const harness = createHarness();
      withUsers(
        harness,
        { id: 1, email: dto.email, phone: '+255700000001' },
        { id: 2, email: 'other@example.com', phone: dto.phone },
      );
      await expectRejected(harness, /two different existing accounts/);
    });

    it('rejects an email whose account has a different phone', async () => {
      const harness = createHarness();
      withUsers(
        harness,
        { id: 1, email: dto.email, phone: '+255700000001' },
        null,
      );
      await expectRejected(harness, /email address already has an account/);
    });

    it('rejects a phone whose account has a different email', async () => {
      const harness = createHarness();
      withUsers(harness, null, {
        id: 2,
        email: 'other@example.com',
        phone: dto.phone,
      });
      await expectRejected(harness, /phone number already has an account/);
    });

    it('rejects a matching account that is already an employee of this company', async () => {
      const harness = createHarness();
      const user = { id: 3, email: dto.email, phone: dto.phone };
      withUsers(harness, user, user);
      harness.existingEmployeeQuery.getOne.mockResolvedValue({ id: 50 });
      await expectRejected(harness, /already belongs to an employee/);
      expect(harness.existingEmployeeQuery.andWhere).toHaveBeenCalledWith(
        'membership.user_id = :userId',
        { userId: 3 },
      );
    });

    it('invites a matching account that works for another company', async () => {
      const harness = createHarness();
      const user = { id: 3, email: dto.email, phone: dto.phone };
      withUsers(harness, user, user);

      await harness.service.create(1, dto, actor);

      expect(harness.invitationRepository.save).toHaveBeenCalled();
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).toHaveBeenCalled();
    });
  });

  describe('concurrent invitations for the same recipient', () => {
    function uniqueViolation(constraint: string) {
      return Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint,
      });
    }

    it('expires stale pending invitations for the recipient before inserting', async () => {
      const harness = createHarness();

      await harness.service.create(1, dto, actor);

      expect(harness.duplicateQuery.set).toHaveBeenCalledWith({
        status: EmployeeInvitationStatus.EXPIRED,
      });
      expect(harness.duplicateQuery.andWhere).toHaveBeenCalledWith(
        '(email = :email OR phone = :phone)',
        { email: dto.email, phone: dto.phone },
      );
      expect(harness.duplicateQuery.execute).toHaveBeenCalled();
      const expireOrder =
        harness.duplicateQuery.execute.mock.invocationCallOrder[0];
      const saveOrder =
        harness.invitationRepository.save.mock.invocationCallOrder[0];
      expect(expireOrder).toBeLessThan(saveOrder);
    });

    it.each([
      'UQ_employee_invitation_pending_email',
      'UQ_employee_invitation_pending_phone',
    ])(
      'turns a %s race into a 409 without sending anything',
      async (constraint) => {
        const harness = createHarness();
        harness.invitationRepository.save.mockRejectedValueOnce(
          uniqueViolation(constraint),
        );

        await expect(harness.service.create(1, dto, actor)).rejects.toThrow(
          'A pending invitation already exists',
        );
        expect(
          harness.mailService.sendGenericNotificationEmail,
        ).not.toHaveBeenCalled();
        expect(
          harness.smsService.sendGenericNotificationSms,
        ).not.toHaveBeenCalled();
      },
    );

    it('rethrows unrelated database errors', async () => {
      const harness = createHarness();
      harness.invitationRepository.save.mockRejectedValueOnce(
        uniqueViolation('UQ_some_other_constraint'),
      );

      await expect(harness.service.create(1, dto, actor)).rejects.toThrow(
        'duplicate key value',
      );
    });
  });

  describe('invitation ownership', () => {
    function ownedInvitation(ownerId: number | null) {
      return {
        id: 44,
        companyId: 1,
        status: EmployeeInvitationStatus.PENDING,
        tokenHash: createHash('sha256').update('owner-token').digest('hex'),
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
        createdByCompanyUserId: ownerId,
        expiresAt: new Date(Date.now() + 60_000),
        emailDeliveryStatus: EmployeeInvitationDeliveryStatus.SENT,
        smsDeliveryStatus: EmployeeInvitationDeliveryStatus.SENT,
        emailLastError: null,
        smsLastError: null,
      };
    }

    it('makes the resender the owner of the invitation', async () => {
      const harness = createHarness();
      const invitation = ownedInvitation(5);
      harness.invitationRepository.findOneBy.mockResolvedValue(invitation);

      await harness.service.resend(1, 44, {
        ...actor,
        companyMembershipId: 33,
      });

      expect(invitation.createdByCompanyUserId).toBe(33);
      expect(harness.invitationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ createdByCompanyUserId: 33 }),
      );
    });

    it('refuses to accept an invitation with no owner instead of borrowing another member', async () => {
      const harness = createHarness();
      const invitation = ownedInvitation(null);
      harness.invitationRepository.findOneBy.mockResolvedValue(invitation);
      harness.lockedInvitationQuery.getOneOrFail.mockResolvedValue(invitation);

      await expect(
        harness.service.accept('owner-token', { password: 'StrongPass#2026' }),
      ).rejects.toThrow('Ask HR to resend it');
      expect(harness.companyUserRepository.findOne).not.toHaveBeenCalled();
      expect(
        harness.employeesService.createInTransaction,
      ).not.toHaveBeenCalled();
    });

    it('only accepts on behalf of an owner whose membership is still active', async () => {
      const harness = createHarness();
      const invitation = ownedInvitation(20);
      harness.invitationRepository.findOneBy.mockResolvedValue(invitation);
      harness.lockedInvitationQuery.getOneOrFail.mockResolvedValue(invitation);
      harness.companyUserRepository.findOne.mockResolvedValue(null);

      await expect(
        harness.service.accept('owner-token', { password: 'StrongPass#2026' }),
      ).rejects.toThrow('Ask HR to resend it');
      expect(harness.companyUserRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 20, company_id: 1, status: 'active' },
        }),
      );
      expect(
        harness.employeesService.createInTransaction,
      ).not.toHaveBeenCalled();
    });
  });

  describe('history and lookup', () => {
    it('pages results and reports pagination meta', async () => {
      const harness = createHarness();
      const row = {
        id: 7,
        status: EmployeeInvitationStatus.ACCEPTED,
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        phone: '+255712345678',
        expiresAt: new Date(Date.now() - 1_000),
        acceptedAt: new Date('2026-10-01T10:00:00Z'),
        acceptedEmployeeId: 91,
        sourceCandidateId: null,
      };
      harness.duplicateQuery.getManyAndCount.mockResolvedValueOnce([[row], 41]);

      const result = await harness.service.findHistory(1, {
        status: 'all',
        page: 3,
        limit: 20,
      });

      expect(harness.duplicateQuery.skip).toHaveBeenCalledWith(40);
      expect(harness.duplicateQuery.take).toHaveBeenCalledWith(20);
      expect(result.meta).toEqual(
        expect.objectContaining({
          totalItems: 41,
          currentPage: 3,
          totalPages: 3,
          hasNextPage: false,
        }),
      );
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: 7,
          effective_status: EmployeeInvitationStatus.ACCEPTED,
          accepted_at: '2026-10-01T10:00:00.000Z',
          accepted_employee_id: 91,
        }),
      );
    });

    it('treats a pending invitation past its expiry as expired in responses', async () => {
      const harness = createHarness();
      harness.duplicateQuery.getManyAndCount.mockResolvedValueOnce([
        [
          {
            id: 8,
            status: EmployeeInvitationStatus.PENDING,
            expiresAt: new Date(Date.now() - 1_000),
          },
        ],
        1,
      ]);

      const result = await harness.service.findHistory(1, {});

      expect(result.data[0].status).toBe(EmployeeInvitationStatus.PENDING);
      expect(result.data[0].effective_status).toBe(
        EmployeeInvitationStatus.EXPIRED,
      );
    });

    it('filters "expired" by stored or effective expiry', async () => {
      const harness = createHarness();

      await harness.service.findHistory(1, {
        status: EmployeeInvitationStatus.EXPIRED,
      });

      expect(harness.duplicateQuery.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('invitation.expires_at <= :now'),
        expect.objectContaining({
          expired: EmployeeInvitationStatus.EXPIRED,
          pending: EmployeeInvitationStatus.PENDING,
        }),
      );
    });

    it('escapes LIKE wildcards in the search term', async () => {
      const harness = createHarness();

      await harness.service.findHistory(1, { search: '50%_off' });

      expect(harness.duplicateQuery.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE :term'),
        { term: '%50\\%\\_off%' },
      );
    });

    it('returns one invitation scoped to the company', async () => {
      const harness = createHarness();
      harness.invitationRepository.findOneBy.mockResolvedValueOnce({
        id: 44,
        status: EmployeeInvitationStatus.CANCELLED,
        expiresAt: new Date(),
      });

      await expect(harness.service.findOne(1, 44)).resolves.toEqual(
        expect.objectContaining({ id: 44, effective_status: 'cancelled' }),
      );
      expect(harness.invitationRepository.findOneBy).toHaveBeenCalledWith({
        id: 44,
        companyId: 1,
      });
    });

    it('404s for an invitation in another company', async () => {
      const harness = createHarness();
      harness.invitationRepository.findOneBy.mockResolvedValueOnce(null);

      await expect(harness.service.findOne(2, 44)).rejects.toThrow(
        'Employee invitation not found',
      );
    });
  });

  describe('automatic delivery retries', () => {
    function failedInvitation(
      email: EmployeeInvitationDeliveryStatus,
      sms: EmployeeInvitationDeliveryStatus,
    ) {
      return {
        id: 44,
        companyId: 1,
        status: EmployeeInvitationStatus.PENDING,
        tokenHash: 'old-hash',
        firstName: dto.first_name,
        lastName: dto.last_name,
        email: dto.email,
        phone: dto.phone,
        expiresAt: new Date(Date.now() + 60_000),
        emailDeliveryStatus: email,
        smsDeliveryStatus: sms,
        emailLastError: 'boom',
        smsLastError: null,
        deliveryAttempts: 1,
        lastDeliveryAttemptAt: new Date(Date.now() - 60 * 60_000),
      };
    }

    function claim(harness: ReturnType<typeof createHarness>, ids: number[]) {
      harness.dataSource.query.mockResolvedValueOnce([
        ids.map((id) => ({ id })),
        ids.length,
      ]);
    }

    it('claims due invitations with the attempt limit, backoff and a skip-locked lock', async () => {
      const harness = createHarness();
      claim(harness, []);

      await expect(harness.service.retryFailedDeliveries()).resolves.toBe(0);

      const [sql, params] = harness.dataSource.query.mock.calls[0];
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(sql).toContain('"expires_at" > now()');
      expect(sql).toContain(
        'make_interval(mins => $4 * GREATEST("delivery_attempts", 1))',
      );
      expect(params).toEqual([
        EmployeeInvitationStatus.PENDING,
        EmployeeInvitationDeliveryStatus.FAILED,
        3,
        15,
      ]);
    });

    it('re-sends a failed email with a fresh link and counts the attempt', async () => {
      const harness = createHarness();
      const invitation = failedInvitation(
        EmployeeInvitationDeliveryStatus.FAILED,
        EmployeeInvitationDeliveryStatus.SENT,
      );
      claim(harness, [44]);
      harness.invitationRepository.findOneBy.mockResolvedValueOnce(invitation);

      await expect(harness.service.retryFailedDeliveries()).resolves.toBe(1);

      expect(invitation.tokenHash).not.toBe('old-hash');
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).toHaveBeenCalledTimes(1);
      const [, , , link] =
        harness.mailService.sendGenericNotificationEmail.mock.calls[0];
      const token = new URL(link as string).searchParams.get('token')!;
      expect(createHash('sha256').update(token).digest('hex')).toBe(
        invitation.tokenHash,
      );
      // The SMS already succeeded, so it is not sent again.
      expect(
        harness.smsService.sendGenericNotificationSms,
      ).not.toHaveBeenCalled();
      expect(invitation.emailDeliveryStatus).toBe(
        EmployeeInvitationDeliveryStatus.SENT,
      );
      expect(invitation.deliveryAttempts).toBe(2);
    });

    it('re-sends only a failed SMS and keeps the existing link valid', async () => {
      const harness = createHarness();
      const invitation = failedInvitation(
        EmployeeInvitationDeliveryStatus.SENT,
        EmployeeInvitationDeliveryStatus.FAILED,
      );
      claim(harness, [44]);
      harness.invitationRepository.findOneBy.mockResolvedValueOnce(invitation);

      await harness.service.retryFailedDeliveries();

      expect(invitation.tokenHash).toBe('old-hash');
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).not.toHaveBeenCalled();
      expect(
        harness.smsService.sendGenericNotificationSms,
      ).toHaveBeenCalledTimes(1);
    });

    it('keeps going when one invitation fails again', async () => {
      const harness = createHarness();
      const first = failedInvitation(
        EmployeeInvitationDeliveryStatus.FAILED,
        EmployeeInvitationDeliveryStatus.SKIPPED,
      );
      const second = { ...first, id: 45 };
      claim(harness, [44, 45]);
      harness.invitationRepository.findOneBy
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);
      harness.mailService.sendGenericNotificationEmail
        .mockRejectedValueOnce(new Error('SMTP down'))
        .mockResolvedValueOnce({ messageId: 'retry-ok' });

      await expect(harness.service.retryFailedDeliveries()).resolves.toBe(2);

      expect(first.emailDeliveryStatus).toBe(
        EmployeeInvitationDeliveryStatus.FAILED,
      );
      expect(first.emailLastError).toBe('SMTP down');
      expect(first.deliveryAttempts).toBe(2);
      expect(second.emailDeliveryStatus).toBe(
        EmployeeInvitationDeliveryStatus.SENT,
      );
    });

    it('resets the attempt counter on a manual resend', async () => {
      const harness = createHarness();
      const invitation = {
        ...failedInvitation(
          EmployeeInvitationDeliveryStatus.FAILED,
          EmployeeInvitationDeliveryStatus.SKIPPED,
        ),
        deliveryAttempts: 3,
        createdByCompanyUserId: 20,
      };
      harness.invitationRepository.findOneBy.mockResolvedValue(invitation);

      await harness.service.resend(1, 44, actor);

      // Reset to 0, then the resend itself is attempt 1.
      expect(invitation.deliveryAttempts).toBe(1);
    });
  });

  describe('expiry', () => {
    function invitationWith(status: EmployeeInvitationStatus) {
      return {
        id: 44,
        companyId: 1,
        status,
        tokenHash: 'old-hash',
        firstName: dto.first_name,
        lastName: dto.last_name,
        email: dto.email,
        phone: dto.phone,
        createdByCompanyUserId: 20,
        expiresAt: new Date(Date.now() - 60_000),
        emailDeliveryStatus: EmployeeInvitationDeliveryStatus.SENT,
        smsDeliveryStatus: EmployeeInvitationDeliveryStatus.SENT,
        emailLastError: null,
        smsLastError: null,
      };
    }

    it('marks every overdue pending invitation as expired', async () => {
      const harness = createHarness();
      harness.duplicateQuery.execute.mockResolvedValueOnce({ affected: 3 });

      await expect(harness.service.expireOverdueInvitations()).resolves.toBe(3);
      expect(harness.duplicateQuery.set).toHaveBeenCalledWith({
        status: EmployeeInvitationStatus.EXPIRED,
      });
      expect(harness.duplicateQuery.where).toHaveBeenCalledWith(
        'status = :status',
        { status: EmployeeInvitationStatus.PENDING },
      );
      expect(harness.duplicateQuery.andWhere).toHaveBeenCalledWith(
        'expires_at <= :now',
        { now: expect.any(Date) },
      );
    });

    it('revives an expired invitation on resend with a fresh link and expiry', async () => {
      const harness = createHarness();
      const invitation = invitationWith(EmployeeInvitationStatus.EXPIRED);
      harness.invitationRepository.findOneBy.mockResolvedValue(invitation);

      const result = await harness.service.resend(1, 44, actor);

      expect(result.status).toBe(EmployeeInvitationStatus.PENDING);
      expect(invitation.tokenHash).not.toBe('old-hash');
      expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).toHaveBeenCalledTimes(1);
    });

    it.each([
      EmployeeInvitationStatus.ACCEPTED,
      EmployeeInvitationStatus.CANCELLED,
    ])('refuses to resend a %s invitation', async (status) => {
      const harness = createHarness();
      harness.invitationRepository.findOneBy.mockResolvedValue(
        invitationWith(status),
      );

      await expect(harness.service.resend(1, 44, actor)).rejects.toThrow(
        'Only pending or expired invitations can be resent',
      );
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).not.toHaveBeenCalled();
    });

    it('refuses to revive an expired invitation when a newer one is pending', async () => {
      const harness = createHarness();
      harness.invitationRepository.findOneBy.mockResolvedValue(
        invitationWith(EmployeeInvitationStatus.EXPIRED),
      );
      harness.invitationRepository.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value'), {
          code: '23505',
          constraint: 'UQ_employee_invitation_pending_email',
        }),
      );

      await expect(harness.service.resend(1, 44, actor)).rejects.toThrow(
        'A newer pending invitation already exists',
      );
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).not.toHaveBeenCalled();
    });
  });

  describe('delivery channels', () => {
    function pendingFor(smsStatus: EmployeeInvitationDeliveryStatus) {
      return {
        id: 44,
        companyId: 1,
        status: EmployeeInvitationStatus.PENDING,
        firstName: dto.first_name,
        lastName: dto.last_name,
        email: dto.email,
        phone: dto.phone,
        createdByCompanyUserId: 20,
        expiresAt: new Date(Date.now() + 60_000),
        emailDeliveryStatus: EmployeeInvitationDeliveryStatus.SENT,
        smsDeliveryStatus: smsStatus,
        emailLastError: null,
        smsLastError: null,
      };
    }

    it('sends email only and records SMS as skipped when SMS was not chosen', async () => {
      const harness = createHarness();

      const result = await harness.service.create(
        1,
        { ...dto, channels: [EmployeeInvitationChannel.EMAIL] },
        actor,
      );

      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).toHaveBeenCalledTimes(1);
      expect(
        harness.smsService.sendGenericNotificationSms,
      ).not.toHaveBeenCalled();
      expect(result.delivery.sms.status).toBe(
        EmployeeInvitationDeliveryStatus.SKIPPED,
      );
      expect(result.delivery.email.status).toBe(
        EmployeeInvitationDeliveryStatus.SENT,
      );
    });

    it('resends an email-only invitation by email only', async () => {
      const harness = createHarness();
      const invitation = pendingFor(EmployeeInvitationDeliveryStatus.SKIPPED);
      harness.invitationRepository.findOneBy.mockResolvedValue(invitation);

      await harness.service.resend(1, 44, actor);

      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).toHaveBeenCalledTimes(1);
      expect(
        harness.smsService.sendGenericNotificationSms,
      ).not.toHaveBeenCalled();
      expect(invitation.smsDeliveryStatus).toBe(
        EmployeeInvitationDeliveryStatus.SKIPPED,
      );
    });

    it.each([
      EmployeeInvitationDeliveryStatus.SENT,
      EmployeeInvitationDeliveryStatus.ACCEPTED,
      EmployeeInvitationDeliveryStatus.FAILED,
      EmployeeInvitationDeliveryStatus.QUEUED,
    ])(
      'resends by email and SMS when SMS was chosen (previous SMS status %s)',
      async (smsStatus) => {
        const harness = createHarness();
        harness.invitationRepository.findOneBy.mockResolvedValue(
          pendingFor(smsStatus),
        );

        await harness.service.resend(1, 44, actor);

        expect(
          harness.mailService.sendGenericNotificationEmail,
        ).toHaveBeenCalledTimes(1);
        expect(
          harness.smsService.sendGenericNotificationSms,
        ).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('position capacity warning', () => {
    it('returns capacity with the new invitation so HR is warned about overfilling', async () => {
      const harness = createHarness();
      harness.positionRepository.findOneBy.mockResolvedValue({
        id: 9,
        company_id: 1,
        branch_id: 2,
        department_id: 5,
        headcount: 1,
      });
      Object.assign(harness.existingEmployeeQuery, {
        getCount: jest.fn().mockResolvedValue(1),
      });
      Object.assign(harness.duplicateQuery, {
        getCount: jest.fn().mockResolvedValue(0),
      });

      const result = await harness.service.create(1, dto, actor);

      expect(result.capacity).toEqual({
        position_id: 9,
        headcount: 1,
        filled: 1,
        pending_invitations: 0,
        available: 0,
        will_overfill: true,
      });
      // The invitation itself is still created and sent.
      expect(
        harness.mailService.sendGenericNotificationEmail,
      ).toHaveBeenCalled();
    });

    it('still returns the invitation when capacity cannot be computed', async () => {
      const harness = createHarness();
      Object.assign(harness.existingEmployeeQuery, {
        getCount: jest.fn().mockRejectedValue(new Error('db hiccup')),
      });
      Object.assign(harness.duplicateQuery, {
        getCount: jest.fn().mockResolvedValue(0),
      });

      const result = await harness.service.create(1, dto, actor);

      expect(result.id).toBe(44);
      expect(result.capacity).toBeNull();
    });
  });

  describe('readable expiry in the invitation email', () => {
    function emailBody(harness: ReturnType<typeof createHarness>) {
      return harness.mailService.sendGenericNotificationEmail.mock
        .calls[0][2] as string;
    }

    it('shows the expiry as a local date and time, not an ISO timestamp', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-12T08:00:00Z') });
      try {
        const harness = createHarness();
        await harness.service.create(1, dto, actor);
        // 72h after 08:00 UTC is 15 October, 11:00 in Dar es Salaam (UTC+3).
        expect(emailBody(harness)).toContain(
          'This invitation expires on 15 October 2026 at 11:00 EAT.',
        );
        expect(emailBody(harness)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      } finally {
        jest.useRealTimers();
      }
    });

    it('honours a configured timezone', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-12T08:00:00Z') });
      try {
        const harness = createHarness({ timeZone: 'Africa/Kampala' });
        await harness.service.create(1, dto, actor);
        expect(emailBody(harness)).toContain('15 October 2026 at 11:00');
      } finally {
        jest.useRealTimers();
      }
    });

    it('falls back to UTC for an invalid timezone instead of failing the send', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-12T08:00:00Z') });
      try {
        const harness = createHarness({ timeZone: 'Not/AZone' });
        await harness.service.create(1, dto, actor);
        expect(emailBody(harness)).toContain(
          'This invitation expires on 15 October 2026 at 08:00 UTC.',
        );
      } finally {
        jest.useRealTimers();
      }
    });
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

    it('marks the source recruitment candidate as hired on accept', async () => {
      const {
        service,
        invitation,
        transactionalUserRepository,
        transactionalCandidateRepository,
      } = await setup();
      Object.assign(invitation, { sourceCandidateId: 12 });
      transactionalUserRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 77, email: dto.email });

      await service.accept(token, { password: 'StrongPass#2026' });

      expect(transactionalCandidateRepository.update).toHaveBeenCalledWith(
        {
          id: 12,
          companyId: 1,
          status: RecruitmentCandidateStatus.INVITED,
          invitationId: 44,
        },
        { status: RecruitmentCandidateStatus.HIRED },
      );
    });

    it('does not touch recruitment when the invitation was created directly', async () => {
      const {
        service,
        transactionalUserRepository,
        transactionalCandidateRepository,
      } = await setup();
      transactionalUserRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 77, email: dto.email });

      await service.accept(token, { password: 'StrongPass#2026' });

      expect(transactionalCandidateRepository.update).not.toHaveBeenCalled();
    });

    it('leaves the candidate untouched when the password is wrong', async () => {
      const {
        service,
        invitation,
        existingUser,
        transactionalUserRepository,
        transactionalCandidateRepository,
      } = await setup();
      Object.assign(invitation, { sourceCandidateId: 12 });
      transactionalUserRepository.findOneBy.mockResolvedValue(existingUser);

      await expect(
        service.accept(token, { password: 'Wrong#Pass99' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionalCandidateRepository.update).not.toHaveBeenCalled();
    });

    it('tells the invitation owner once the acceptance has committed', async () => {
      const { service, invitation, transactionalUserRepository, eventEmitter } =
        await setup();
      transactionalUserRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 77, email: dto.email });

      await service.accept(token, { password: 'StrongPass#2026' });

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      const [name, event] = eventEmitter.emit.mock.calls[0];
      expect(name).toBe(EmployeeInvitationAcceptedEvent.EVENT);
      expect(event).toEqual(
        expect.objectContaining({
          companyId: 1,
          invitationId: invitation.id,
          employeeId: 91,
          employeeNo: 'AICL/091',
          employeeName: 'Amina Moshi',
          inviterCompanyUserId: 20,
          profileUrl:
            'http://localhost:3000/dashboard/employees/profile/AICL%2F091',
        }),
      );
    });

    it('does not announce an acceptance that failed', async () => {
      const {
        service,
        existingUser,
        transactionalUserRepository,
        eventEmitter,
      } = await setup();
      transactionalUserRepository.findOneBy.mockResolvedValue(existingUser);

      await expect(
        service.accept(token, { password: 'Wrong#Pass99' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('matches the existing account by email regardless of letter case', async () => {
      const { service, existingUser, transactionalUserRepository } =
        await setup();
      transactionalUserRepository.findOneBy.mockResolvedValue({
        ...existingUser,
        email: 'Amina@Example.com',
      });

      await service.accept(token, { password: 'MyCurrent#Pass1' });

      const qb =
        transactionalUserRepository.createQueryBuilder.mock.results[0].value;
      expect(qb.where).toHaveBeenCalledWith(
        'LOWER(user.email) = LOWER(:email)',
        { email: dto.email },
      );
    });

    it('tells the registration page whether an account already exists', async () => {
      const { service, userRepository } = await setup();

      userRepository.findOne.mockResolvedValueOnce({ id: 5 });
      await expect(service.findPublic(token)).resolves.toEqual(
        expect.objectContaining({ has_existing_account: true }),
      );

      userRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.findPublic(token)).resolves.toEqual(
        expect.objectContaining({ has_existing_account: false }),
      );
      expect(userRepository.findOne).toHaveBeenCalledWith({
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
