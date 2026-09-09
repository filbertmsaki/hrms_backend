import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hashPassword } from '../../../common/utils/hash.util';
import { ReportSmtpService } from '../../scheduled-reporting/services/report-smtp.service';
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
    private readonly reportSmtpService: ReportSmtpService,
    private readonly smsService: SmsService,
    private readonly employeesService: EmployeesService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    companyId: number,
    dto: CreateEmployeeInvitationDto,
    actor: AuthenticatedUser,
  ) {
    await this.validateAssignment(companyId, dto);
    await this.assertRecipientAvailable(companyId, dto.email, dto.phone);

    const company = await this.companyRepository.findOneBy({ id: companyId });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const rawToken = randomBytes(32).toString('hex');
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
      smsDeliveryStatus: EmployeeInvitationDeliveryStatus.QUEUED,
      emailMessageId: null,
      smsMessageId: null,
      emailLastError: null,
      smsLastError: null,
      createdByCompanyUserId: actor.companyMembershipId ?? null,
      expiresAt: this.createExpiry(),
      acceptedAt: null,
      acceptedEmployeeId: null,
    });

    const saved = await this.invitationRepository.save(invitation);
    await this.deliver(saved, rawToken, company.name, dto.channels);
    return this.toResponse(saved);
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

  async resend(companyId: number, invitationId: number) {
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

    const rawToken = randomBytes(32).toString('hex');
    invitation.tokenHash = this.hashToken(rawToken);
    invitation.expiresAt = this.createExpiry();
    invitation.emailDeliveryStatus = EmployeeInvitationDeliveryStatus.QUEUED;
    invitation.smsDeliveryStatus = EmployeeInvitationDeliveryStatus.QUEUED;
    invitation.emailLastError = null;
    invitation.smsLastError = null;
    await this.invitationRepository.save(invitation);
    await this.deliver(invitation, rawToken, company.name, [
      EmployeeInvitationChannel.EMAIL,
      EmployeeInvitationChannel.SMS,
    ]);
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
    };
  }

  async accept(rawToken: string, dto: AcceptEmployeeInvitationDto) {
    const invitation = await this.findUsableInvitation(rawToken);
    const claimed = await this.invitationRepository.update(
      {
        id: invitation.id,
        status: EmployeeInvitationStatus.PENDING,
      },
      { status: EmployeeInvitationStatus.ACCEPTING },
    );
    if (claimed.affected !== 1) {
      throw new ConflictException('This invitation is already being processed');
    }

    try {
      const actor = await this.resolveInvitationActor(invitation);
      const employee = await this.employeesService.create(
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
      );

      const user = await this.usersService.findByEmail(invitation.email);
      if (!user) {
        throw new NotFoundException('Created employee account was not found');
      }
      await this.usersService.updatePassword(
        user.id,
        await hashPassword(dto.password),
      );

      invitation.status = EmployeeInvitationStatus.ACCEPTED;
      invitation.acceptedAt = new Date();
      invitation.acceptedEmployeeId = employee.id;
      await this.invitationRepository.save(invitation);

      return {
        status: invitation.status,
        employee_id: employee.id,
        login_url: `${this.frontendBaseUrl()}/login`,
      };
    } catch (error) {
      await this.invitationRepository.update(
        {
          id: invitation.id,
          status: EmployeeInvitationStatus.ACCEPTING,
        },
        { status: EmployeeInvitationStatus.PENDING },
      );
      throw error;
    }
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

    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { phone }],
    });
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
    const message = `${this.escapeHtml(name)}, ${this.escapeHtml(companyName)} has invited you to complete your employee registration. This invitation expires on ${invitation.expiresAt.toISOString()}.`;

    if (channels.includes(EmployeeInvitationChannel.EMAIL)) {
      try {
        const result = await this.reportSmtpService.sendCompanyEmail(
          invitation.companyId,
          {
            to: invitation.email,
            subject: `Employee invitation from ${companyName}`,
            text: `${name}, ${companyName} has invited you to complete your employee registration. This invitation expires on ${invitation.expiresAt.toISOString()}.\n\n${actionUrl}`,
            html: `<p>${message}</p><p><a href="${this.escapeHtml(actionUrl)}">Complete employee registration</a></p>`,
            sourceModule: 'EmployeeInvitationsService.deliver',
          },
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
          `${name}, ${companyName} has invited you to complete your employee registration.`,
          actionUrl,
        );
        invitation.smsDeliveryStatus = EmployeeInvitationDeliveryStatus.SENT;
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

  private buildInvitationUrl(rawToken: string): string {
    return `${this.frontendBaseUrl()}/register?token=${encodeURIComponent(rawToken)}`;
  }

  private frontendBaseUrl(): string {
    return (
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
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
    const membership = await this.companyUserRepository.findOne({
      where: invitation.createdByCompanyUserId
        ? {
            id: invitation.createdByCompanyUserId,
            company_id: invitation.companyId,
          }
        : { company_id: invitation.companyId, status: 'active' },
      relations: ['user'],
      order: { id: 'ASC' },
    });
    if (!membership?.user) {
      throw new ConflictException(
        'The invitation owner is no longer available. Ask HR to resend it.',
      );
    }
    return {
      id: membership.user.id,
      email: membership.user.email,
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: invitation.companyId,
      companyMembershipId: membership.id,
      roles: [],
      permissions: ['employees:create', 'employees:read'],
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message.slice(0, 2000)
      : String(error).slice(0, 2000);
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const replacements: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return replacements[character];
    });
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
          transport: 'company_smtp',
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
