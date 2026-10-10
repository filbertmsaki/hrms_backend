import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { isStrongPassword } from 'class-validator';
import {
  comparePasswords,
  hashPassword,
} from '../../../common/utils/hash.util';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { ContactTypeEnum } from '../employees/enums/contact-type.enum';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { Position } from '../positions/entities/position.entity';
import { OnboardingWorkflow } from '../onboarding/entities/onboarding-workflow.entity';
import {
  RecruitmentCandidate,
  RecruitmentCandidateStatus,
} from '../recruitment/entities/recruitment-candidate.entity';
import { CreateEmployeeInvitationDto } from './dtos/create-employee-invitation.dto';
import { AcceptEmployeeInvitationDto } from './dtos/accept-employee-invitation.dto';
import { EmployeeInvitation } from './entities/employee-invitation.entity';
import {
  EmployeeInvitationChannel,
  EmployeeInvitationDeliveryStatus,
  EmployeeInvitationStatus,
} from './enums/employee-invitation.enum';

@Injectable()
export class EmployeeInvitationsService {
  constructor(
    @InjectRepository(EmployeeInvitation)
    private readonly invitationRepository: Repository<EmployeeInvitation>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(OnboardingWorkflow)
    private readonly workflowRepository: Repository<OnboardingWorkflow>,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly employeesService: EmployeesService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    companyId: number,
    dto: CreateEmployeeInvitationDto,
    actor: AuthenticatedUser,
    sourceCandidateId: number | null = null,
  ) {
    await this.validateAssignment(companyId, dto);
    await this.assertRecipientAvailable(companyId, dto.email, dto.phone);

    const company = await this.companyRepository.findOneBy({ id: companyId });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const rawToken = this.createToken();
    const invitation = this.invitationRepository.create({
      companyId,
      tokenHash: this.hashToken(rawToken),
      firstName: dto.first_name,
      lastName: dto.last_name,
      gender: dto.gender,
      email: dto.email,
      phone: dto.phone,
      primaryBranchId: dto.primary_branch_id,
      primaryDepartmentId: dto.primary_department_id,
      primaryPositionId: dto.primary_position_id,
      employmentType: dto.employment_type,
      reportsTo: dto.reports_to ?? null,
      hireDate: dto.hire_date ?? null,
      onboardingWorkflowId: dto.onboarding_workflow_id ?? null,
      status: EmployeeInvitationStatus.PENDING,
      emailDeliveryStatus: EmployeeInvitationDeliveryStatus.QUEUED,
      smsDeliveryStatus: dto.channels.includes(EmployeeInvitationChannel.SMS)
        ? EmployeeInvitationDeliveryStatus.QUEUED
        : EmployeeInvitationDeliveryStatus.SKIPPED,
      emailMessageId: null,
      smsMessageId: null,
      emailLastError: null,
      smsLastError: null,
      createdByCompanyUserId: actor.companyMembershipId ?? null,
      expiresAt: this.createExpiry(),
      acceptedAt: null,
      acceptedEmployeeId: null,
      sourceCandidateId,
    });

    // Expired-but-still-pending rows would otherwise trip the unique index.
    await this.expireStalePending(companyId, dto.email, dto.phone);
    let saved: EmployeeInvitation;
    try {
      saved = await this.invitationRepository.save(invitation);
    } catch (error) {
      // Two HR users inviting the same person at once: the partial unique
      // index lets exactly one insert win.
      if (this.isPendingDuplicate(error)) {
        throw new ConflictException(
          'A pending invitation already exists for this email address or phone number',
        );
      }
      throw error;
    }
    await this.deliver(saved, rawToken, company.name, dto.channels);
    return this.toResponse(saved);
  }

  private async expireStalePending(
    companyId: number,
    email: string,
    phone: string,
  ): Promise<void> {
    await this.invitationRepository
      .createQueryBuilder()
      .update(EmployeeInvitation)
      .set({ status: EmployeeInvitationStatus.EXPIRED })
      .where('company_id = :companyId', { companyId })
      .andWhere('status = :status', {
        status: EmployeeInvitationStatus.PENDING,
      })
      .andWhere('expires_at <= :now', { now: new Date() })
      .andWhere('(email = :email OR phone = :phone)', { email, phone })
      .execute();
  }

  private isPendingDuplicate(error: unknown): boolean {
    const driverError = error as {
      code?: string;
      constraint?: string;
      driverError?: { code?: string; constraint?: string };
    };
    const code = driverError?.code ?? driverError?.driverError?.code;
    const constraint =
      driverError?.constraint ?? driverError?.driverError?.constraint ?? '';
    return (
      code === '23505' &&
      constraint.startsWith('UQ_employee_invitation_pending_')
    );
  }

  async findPending(companyId: number) {
    const invitations = await this.invitationRepository.find({
      where: {
        companyId,
        status: EmployeeInvitationStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });

    return invitations.map((invitation) => this.toResponse(invitation));
  }

  async resend(
    companyId: number,
    invitationId: number,
    actor: AuthenticatedUser,
  ) {
    const invitation = await this.invitationRepository.findOneBy({
      id: invitationId,
      companyId,
    });
    if (!invitation) {
      throw new NotFoundException('Employee invitation not found');
    }
    if (invitation.status !== EmployeeInvitationStatus.PENDING) {
      throw new ConflictException('Only pending invitations can be resent');
    }

    const company = await this.companyRepository.findOneBy({ id: companyId });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const rawToken = this.createToken();
    invitation.tokenHash = this.hashToken(rawToken);
    invitation.expiresAt = this.createExpiry();
    // Resend through the channels chosen at creation; a skipped SMS stays
    // skipped. Rows created before SKIPPED existed resend through both.
    const channels = [EmployeeInvitationChannel.EMAIL];
    if (
      invitation.smsDeliveryStatus !== EmployeeInvitationDeliveryStatus.SKIPPED
    ) {
      channels.push(EmployeeInvitationChannel.SMS);
      invitation.smsDeliveryStatus = EmployeeInvitationDeliveryStatus.QUEUED;
    }
    invitation.emailDeliveryStatus = EmployeeInvitationDeliveryStatus.QUEUED;
    invitation.emailLastError = null;
    invitation.smsLastError = null;
    // Whoever resends takes ownership, so an invitation whose original owner
    // left the company becomes acceptable again.
    if (actor.companyMembershipId) {
      invitation.createdByCompanyUserId = actor.companyMembershipId;
    }
    await this.invitationRepository.save(invitation);
    await this.deliver(invitation, rawToken, company.name, channels);
    return this.toResponse(invitation);
  }

  async findPublic(rawToken: string) {
    const invitation = await this.findUsableInvitation(rawToken);
    const company = await this.companyRepository.findOneBy({
      id: invitation.companyId,
    });
    if (!company) {
      throw new NotFoundException('Invitation company not found');
    }

    return {
      first_name: invitation.firstName,
      last_name: invitation.lastName,
      email: invitation.email,
      phone: invitation.phone,
      company_name: company.name,
      expires_at: invitation.expiresAt.toISOString(),
      has_existing_account: await this.userRepository.exists({
        where: { email: invitation.email },
      }),
    };
  }

  private assertStrongPassword(password: string): void {
    const strong = isStrongPassword(password, {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    });
    if (!strong) {
      throw new BadRequestException(
        'Password must be at least 8 characters long and contain an uppercase letter, lowercase letter, number, and special character',
      );
    }
  }

  async accept(rawToken: string, dto: AcceptEmployeeInvitationDto) {
    const invitation = await this.findUsableInvitation(rawToken);
    const actor = await this.resolveInvitationActor(invitation);
    return this.dataSource.transaction(async (manager) => {
      const current = await manager
        .getRepository(EmployeeInvitation)
        .createQueryBuilder('invitation')
        .setLock('pessimistic_write')
        .where('invitation.id = :id', { id: invitation.id })
        .getOneOrFail();
      if (
        current.status !== EmployeeInvitationStatus.PENDING ||
        current.expiresAt <= new Date() ||
        current.tokenHash !== this.hashToken(rawToken.trim())
      ) {
        throw new ConflictException('This invitation is no longer available');
      }

      // An invitee who already has an account (e.g. in another company) must
      // prove ownership with their current password; we never overwrite it.
      const existingUser = await manager.getRepository(User).findOneBy({
        email: invitation.email,
      });
      if (existingUser) {
        const matches = await comparePasswords(
          dto.password,
          existingUser.password,
        );
        if (!matches) {
          throw new BadRequestException(
            'You already have an account. Enter your current password to accept this invitation.',
          );
        }
      } else {
        this.assertStrongPassword(dto.password);
      }

      const created = await this.employeesService.createInTransaction(
        invitation.companyId,
        {
          first_name: invitation.firstName,
          last_name: invitation.lastName,
          gender: invitation.gender,
          primary_branch_id: invitation.primaryBranchId,
          primary_department_id: invitation.primaryDepartmentId,
          primary_position_id: invitation.primaryPositionId,
          employment_status: EmploymentStatusEnum.ONBOARDING,
          employment_type: invitation.employmentType,
          reports_to: invitation.reportsTo ?? undefined,
          hire_date: invitation.hireDate ?? undefined,
          departments: [
            {
              department_id: invitation.primaryDepartmentId,
              is_primary: true,
            },
          ],
          contacts: [
            {
              contact_type: ContactTypeEnum.WORK,
              email: invitation.email,
              is_primary: true,
            },
            {
              contact_type: ContactTypeEnum.MOBILE,
              phone_number: invitation.phone,
              is_primary: true,
            },
          ],
          onboarding: invitation.onboardingWorkflowId
            ? {
                workflow_id: invitation.onboardingWorkflowId,
                auto_start: true,
                submit: false,
              }
            : undefined,
        },
        actor,
        manager,
        { allowPositionOverfill: true },
      );
      const user = await manager.getRepository(User).findOneBy({
        email: invitation.email,
      });
      if (!user) {
        throw new NotFoundException('Created employee account was not found');
      }
      user.is_email_verified = true;
      if (!existingUser) {
        user.password = await hashPassword(dto.password);
        // The invitee has chosen and verified their permanent password; do not
        // route them through the admin reset temporary-password flow at login.
        user.must_set_password = false;
      }
      await manager.getRepository(User).save(user);

      current.status = EmployeeInvitationStatus.ACCEPTED;
      current.acceptedAt = new Date();
      current.acceptedEmployeeId = created.employeeId;
      await manager.getRepository(EmployeeInvitation).save(current);

      // Close the recruitment loop: the candidate behind this invitation is
      // now an employee. Guarded so a candidate re-linked elsewhere is untouched.
      if (current.sourceCandidateId) {
        await manager.getRepository(RecruitmentCandidate).update(
          {
            id: current.sourceCandidateId,
            companyId: current.companyId,
            status: RecruitmentCandidateStatus.INVITED,
            invitationId: current.id,
          },
          { status: RecruitmentCandidateStatus.HIRED },
        );
      }

      return {
        status: current.status,
        employee_id: created.employeeId,
        login_url: `${this.frontendBaseUrl()}/login`,
      };
    });
  }

  async cancel(companyId: number, invitationId: number) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmployeeInvitation);
      const invitation = await repository
        .createQueryBuilder('invitation')
        .setLock('pessimistic_write')
        .where(
          'invitation.id = :invitationId AND invitation.companyId = :companyId',
          { invitationId, companyId },
        )
        .getOne();
      if (
        !invitation ||
        invitation.status !== EmployeeInvitationStatus.PENDING
      ) {
        throw new ConflictException(
          'Only a pending invitation can be cancelled',
        );
      }
      const sourceCandidateId = invitation.sourceCandidateId;
      invitation.status = EmployeeInvitationStatus.CANCELLED;
      invitation.sourceCandidateId = null;
      await repository.save(invitation);
      if (sourceCandidateId) {
        await manager.getRepository(RecruitmentCandidate).update(
          {
            id: sourceCandidateId,
            companyId,
            status: RecruitmentCandidateStatus.INVITED,
            invitationId,
          },
          {
            status: RecruitmentCandidateStatus.OFFER_ACCEPTED,
            invitationId: null,
          },
        );
      }
      return { id: invitationId, status: invitation.status };
    });
  }

  private async validateAssignment(
    companyId: number,
    dto: CreateEmployeeInvitationDto,
  ): Promise<void> {
    const [branch, department, position, manager, workflow] = await Promise.all(
      [
        this.branchRepository.findOneBy({
          id: dto.primary_branch_id,
          company_id: companyId,
        }),
        this.departmentRepository.findOneBy({
          id: dto.primary_department_id,
          company_id: companyId,
        }),
        this.positionRepository.findOneBy({
          id: dto.primary_position_id,
          company_id: companyId,
        }),
        dto.reports_to
          ? this.employeeRepository.findOneBy({
              id: dto.reports_to,
              company_id: companyId,
            })
          : Promise.resolve(null),
        dto.onboarding_workflow_id
          ? this.workflowRepository.findOneBy({
              id: dto.onboarding_workflow_id,
              company_id: companyId,
            })
          : Promise.resolve(null),
      ],
    );

    if (!branch)
      throw new BadRequestException('Selected branch is not available');
    if (
      !department ||
      (department.branch_id && department.branch_id !== branch.id)
    ) {
      throw new BadRequestException(
        'Selected department is not available for this branch',
      );
    }
    if (
      !position ||
      (position.branch_id && position.branch_id !== branch.id) ||
      (position.department_id && position.department_id !== department.id)
    ) {
      throw new BadRequestException(
        'Selected position is not available for this assignment',
      );
    }
    if (dto.reports_to && !manager) {
      throw new BadRequestException('Selected manager is not available');
    }
    if (dto.onboarding_workflow_id && !workflow) {
      throw new BadRequestException(
        'Selected onboarding workflow is not available',
      );
    }
  }

  private async assertRecipientAvailable(
    companyId: number,
    email: string,
    phone: string,
  ): Promise<void> {
    const duplicateInvitation = await this.invitationRepository
      .createQueryBuilder('invitation')
      .where('invitation.company_id = :companyId', { companyId })
      .andWhere('invitation.status = :status', {
        status: EmployeeInvitationStatus.PENDING,
      })
      .andWhere('invitation.expires_at > :now', { now: new Date() })
      .andWhere(
        '(LOWER(invitation.email) = :email OR invitation.phone = :phone)',
        {
          email,
          phone,
        },
      )
      .getOne();
    if (duplicateInvitation) {
      throw new ConflictException(
        'A pending invitation already exists for this email address or phone number',
      );
    }

    // Mirror the account rules EmployeesService applies on accept, so HR is
    // told now instead of the invitee hitting an unrecoverable error later.
    const [existingByEmail, existingByPhone] = await Promise.all([
      this.userRepository.findOne({ where: { email } }),
      this.userRepository.findOne({ where: { phone } }),
    ]);
    if (
      existingByEmail &&
      existingByPhone &&
      existingByEmail.id !== existingByPhone.id
    ) {
      throw new ConflictException(
        'This email address and phone number belong to two different existing accounts',
      );
    }
    if (existingByEmail && existingByEmail.phone !== phone) {
      throw new ConflictException(
        'This email address already has an account with a different phone number',
      );
    }
    if (existingByPhone && existingByPhone.email !== email) {
      throw new ConflictException(
        'This phone number already has an account with a different email address',
      );
    }
    const existingUser = existingByEmail ?? existingByPhone;
    if (!existingUser) return;

    const existingEmployee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('membership.user_id = :userId', { userId: existingUser.id })
      .getOne();
    if (existingEmployee) {
      throw new ConflictException(
        'This email address or phone number already belongs to an employee',
      );
    }
  }

  private async deliver(
    invitation: EmployeeInvitation,
    rawToken: string,
    companyName: string,
    channels: EmployeeInvitationChannel[],
  ): Promise<void> {
    const actionUrl = this.buildInvitationUrl(rawToken);
    const name = `${invitation.firstName} ${invitation.lastName}`.trim();

    if (channels.includes(EmployeeInvitationChannel.EMAIL)) {
      try {
        const result = await this.mailService.sendGenericNotificationEmail(
          invitation.email,
          `Employee invitation from ${companyName}`,
          `${name}, ${companyName} has invited you to complete your employee registration. This invitation expires on ${invitation.expiresAt.toISOString()}.`,
          actionUrl,
        );
        invitation.emailDeliveryStatus = EmployeeInvitationDeliveryStatus.SENT;
        invitation.emailMessageId = result.messageId;
        invitation.emailLastError = null;
      } catch (error) {
        invitation.emailDeliveryStatus =
          EmployeeInvitationDeliveryStatus.FAILED;
        invitation.emailLastError = this.errorMessage(error);
      }
    }

    if (channels.includes(EmployeeInvitationChannel.SMS)) {
      try {
        const result = await this.smsService.sendGenericNotificationSms(
          invitation.phone,
          'Employee invitation',
          `${name}, ${companyName} has invited you to complete your employee registration. Check your email for the registration link.`,
        );
        invitation.smsDeliveryStatus =
          EmployeeInvitationDeliveryStatus.ACCEPTED;
        invitation.smsMessageId = result.reference;
        invitation.smsLastError = null;
      } catch (error) {
        invitation.smsDeliveryStatus = EmployeeInvitationDeliveryStatus.FAILED;
        invitation.smsLastError = this.errorMessage(error);
      }
    }

    await this.invitationRepository.save(invitation);
  }

  private createExpiry(): Date {
    const configuredHours = this.configService.get<number>(
      'EMPLOYEE_INVITATION_TTL_HOURS',
      72,
    );
    const hours =
      Number.isFinite(configuredHours) && configuredHours > 0
        ? configuredHours
        : 72;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private createToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private buildInvitationUrl(rawToken: string): string {
    return `${this.frontendBaseUrl()}/register?token=${encodeURIComponent(rawToken)}`;
  }

  private frontendBaseUrl(): string {
    return this.configService
      .get<string>('APP_FRONTEND_URL')!
      .replace(/\/$/, '');
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private async findUsableInvitation(
    rawToken: string,
  ): Promise<EmployeeInvitation> {
    const normalizedToken = rawToken.trim();
    if (!normalizedToken) {
      throw new NotFoundException('Employee invitation not found');
    }
    const invitation = await this.invitationRepository.findOneBy({
      tokenHash: this.hashToken(normalizedToken),
    });
    if (!invitation) {
      throw new NotFoundException('Employee invitation not found');
    }
    if (invitation.status === EmployeeInvitationStatus.ACCEPTED) {
      throw new ConflictException('This invitation has already been accepted');
    }
    if (
      invitation.status === EmployeeInvitationStatus.EXPIRED ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      if (invitation.status !== EmployeeInvitationStatus.EXPIRED) {
        invitation.status = EmployeeInvitationStatus.EXPIRED;
        await this.invitationRepository.save(invitation);
      }
      throw new ConflictException('This invitation has expired');
    }
    if (invitation.status !== EmployeeInvitationStatus.PENDING) {
      throw new ConflictException('This invitation is not available');
    }
    return invitation;
  }

  private async resolveInvitationActor(
    invitation: EmployeeInvitation,
  ): Promise<AuthenticatedUser> {
    // The employee is created with the invitation owner's permissions and data
    // scope. Never borrow another member's: without an active owner, HR must
    // resend (which makes the resender the owner).
    if (!invitation.createdByCompanyUserId) {
      throw new ConflictException(
        'The invitation owner is no longer available. Ask HR to resend it.',
      );
    }
    const membership = await this.companyUserRepository.findOne({
      where: {
        id: invitation.createdByCompanyUserId,
        company_id: invitation.companyId,
        status: 'active',
      },
      relations: {
        user: true,
        employee: true,
        role_assignments: {
          role: {
            permissions: true,
          },
        },
        permission_assignments: {
          permission: true,
        },
      },
    });
    if (!membership?.user) {
      throw new ConflictException(
        'The invitation owner is no longer available. Ask HR to resend it.',
      );
    }
    const permissions = new Set<string>(['employees:create', 'employees:read']);

    membership.permission_assignments?.forEach((assignment) => {
      if (assignment.permission?.name) {
        permissions.add(assignment.permission.name);
      }
    });
    membership.role_assignments?.forEach((assignment) => {
      assignment.role?.permissions?.forEach((permission) => {
        if (permission?.name) {
          permissions.add(permission.name);
        }
      });
    });

    return {
      id: membership.user.id,
      email: membership.user.email,
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: invitation.companyId,
      companyMembershipId: membership.id,
      employeeId: membership.employee?.id,
      roles:
        membership.role_assignments
          ?.map((assignment) => assignment.role?.name)
          .filter((role): role is string => Boolean(role)) ?? [],
      permissions: Array.from(permissions),
    };
  }

  private errorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    const normalized = raw.trim();
    const lower = normalized.toLowerCase();

    if (
      lower.includes('sendasdenied') ||
      lower.includes('not allowed to send as')
    ) {
      return 'The SMTP account is not permitted to use the configured sender address. Set the sender address to the authenticated mailbox or grant Send As permission.';
    }
    if (lower.includes('authentication unsuccessful')) {
      return 'SMTP authentication failed. Verify the configured username, password, and mailbox SMTP AUTH setting.';
    }

    const diagnosticStart = normalized.indexOf('[BeginDiagnosticData]');
    const withoutDiagnostics =
      diagnosticStart >= 0
        ? normalized.slice(0, diagnosticStart).trim()
        : normalized;
    return withoutDiagnostics.slice(0, 500);
  }

  private toResponse(invitation: EmployeeInvitation) {
    return {
      id: invitation.id,
      status: invitation.status,
      first_name: invitation.firstName,
      last_name: invitation.lastName,
      email: invitation.email,
      phone: invitation.phone,
      gender: invitation.gender,
      primary_branch_id: invitation.primaryBranchId,
      primary_department_id: invitation.primaryDepartmentId,
      primary_position_id: invitation.primaryPositionId,
      employment_type: invitation.employmentType,
      reports_to: invitation.reportsTo,
      hire_date: invitation.hireDate,
      onboarding_workflow_id: invitation.onboardingWorkflowId,
      expires_at: invitation.expiresAt.toISOString(),
      created_at: invitation.createdAt?.toISOString() ?? null,
      updated_at: invitation.updatedAt?.toISOString() ?? null,
      delivery: {
        email: {
          status: invitation.emailDeliveryStatus,
          message_id: invitation.emailMessageId,
          last_error: invitation.emailLastError,
          transport: 'system_smtp',
        },
        sms: {
          status: invitation.smsDeliveryStatus,
          message_id: invitation.smsMessageId,
          last_error: invitation.smsLastError,
          transport: 'sms_gateway',
        },
      },
    };
  }
}
