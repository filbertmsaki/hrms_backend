import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, MoreThan, Repository } from 'typeorm';
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
import { DepartmentPosition } from '../departments/entities/department-position.entity';
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
import { ListEmployeeInvitationsQueryDto } from './dtos/list-employee-invitations-query.dto';
import { buildPaginationMeta } from '../shared/hr.utils';
import { EmployeeInvitationAcceptedEvent } from '../notifications/events/employee-invitation.events';
import { EmployeeInvitation } from './entities/employee-invitation.entity';
import {
  EmployeeInvitationChannel,
  EmployeeInvitationDeliveryStatus,
  EmployeeInvitationStatus,
} from './enums/employee-invitation.enum';

/** Delivery rounds (first send + automatic retries) before giving up. */
const MAX_DELIVERY_ATTEMPTS = 3;
/** Wait this many minutes x attempts so far before the next retry. */
const RETRY_BACKOFF_MINUTES = 15;

export interface PositionCapacity {
  position_id: number;
  headcount: number;
  filled: number;
  pending_invitations: number;
  available: number;
  will_overfill: boolean;
}

@Injectable()
export class EmployeeInvitationsService {
  private readonly logger = new Logger(EmployeeInvitationsService.name);

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
    @InjectRepository(DepartmentPosition)
    private readonly departmentPositionRepository: Repository<DepartmentPosition>,
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
    private readonly eventEmitter: EventEmitter2,
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
      deliveryAttempts: 0,
      lastDeliveryAttemptAt: null,
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
    return this.withCapacity(saved);
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
    // Hide invitations that expired since the last sweep ran.
    const invitations = await this.invitationRepository.find({
      where: {
        companyId,
        status: EmployeeInvitationStatus.PENDING,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    return invitations.map((invitation) => this.toResponse(invitation));
  }

  /**
   * How full a position is, counting both filled seats and pending
   * invitations (each will take a seat on acceptance). Accepting never
   * blocks on headcount, so this is how HR is warned before overfilling.
   */
  async positionCapacity(
    companyId: number,
    positionId: number,
    departmentId?: number,
    excludeInvitationId: number | null = null,
  ): Promise<PositionCapacity> {
    const position = await this.positionRepository.findOneBy({
      id: positionId,
      company_id: companyId,
    });
    if (!position) {
      throw new NotFoundException('Position not found');
    }
    const mapping = departmentId
      ? await this.departmentPositionRepository.findOneBy({
          company_id: companyId,
          position_id: positionId,
          department_id: departmentId,
        })
      : null;
    if (departmentId && !mapping) {
      throw new NotFoundException(
        'Position is not assigned to this department',
      );
    }
    const [filled, pendingInvitations] = await Promise.all([
      (() => {
        const query = this.employeeRepository
          .createQueryBuilder('employee')
          .where('employee.company_id = :companyId', { companyId })
          .andWhere('employee.primary_position_id = :positionId', {
            positionId,
          })
          .andWhere('employee.employment_status IN (:...statuses)', {
            statuses: [
              EmploymentStatusEnum.ONBOARDING,
              EmploymentStatusEnum.ACTIVE,
              EmploymentStatusEnum.SUSPENDED,
            ],
          });
        if (departmentId) {
          query.andWhere('employee.primary_department_id = :departmentId', {
            departmentId,
          });
        }
        return query.getCount();
      })(),
      (() => {
        const query = this.invitationRepository
          .createQueryBuilder('invitation')
          .where('invitation.company_id = :companyId', { companyId })
          .andWhere('invitation.primary_position_id = :positionId', {
            positionId,
          })
          .andWhere('invitation.status = :pending', {
            pending: EmployeeInvitationStatus.PENDING,
          })
          .andWhere('invitation.expires_at > :now', { now: new Date() })
          .andWhere('invitation.id <> :excludeId', {
            excludeId: excludeInvitationId ?? 0,
          });
        if (departmentId) {
          query.andWhere('invitation.primary_department_id = :departmentId', {
            departmentId,
          });
        }
        return query.getCount();
      })(),
    ]);
    const headcount = mapping?.headcount ?? position.headcount;
    const available = headcount - filled - pendingInvitations;
    return {
      position_id: position.id,
      headcount,
      filled,
      pending_invitations: pendingInvitations,
      available: Math.max(available, 0),
      // True when one more acceptance would exceed the approved headcount.
      will_overfill: available <= 0,
    };
  }

  /** Every invitation for the company, filtered by effective status. */
  async findHistory(companyId: number, query: ListEmployeeInvitationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const now = new Date();
    const qb = this.invitationRepository
      .createQueryBuilder('invitation')
      .where('invitation.company_id = :companyId', { companyId });

    // "pending"/"expired" use the effective status, because the expiry sweep
    // only runs hourly.
    switch (query.status ?? 'all') {
      case EmployeeInvitationStatus.PENDING:
        qb.andWhere('invitation.status = :pending', {
          pending: EmployeeInvitationStatus.PENDING,
        }).andWhere('invitation.expires_at > :now', { now });
        break;
      case EmployeeInvitationStatus.EXPIRED:
        qb.andWhere(
          '(invitation.status = :expired OR (invitation.status = :pending AND invitation.expires_at <= :now))',
          {
            expired: EmployeeInvitationStatus.EXPIRED,
            pending: EmployeeInvitationStatus.PENDING,
            now,
          },
        );
        break;
      case EmployeeInvitationStatus.ACCEPTED:
      case EmployeeInvitationStatus.CANCELLED:
        qb.andWhere('invitation.status = :status', { status: query.status });
        break;
    }

    if (query.search) {
      qb.andWhere(
        `(invitation.first_name ILIKE :term OR invitation.last_name ILIKE :term
          OR (invitation.first_name || ' ' || invitation.last_name) ILIKE :term
          OR invitation.email ILIKE :term OR invitation.phone ILIKE :term)`,
        { term: `%${query.search.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('invitation.created_at', 'DESC')
      .addOrderBy('invitation.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((invitation) => this.toResponse(invitation)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, invitationId: number) {
    const invitation = await this.invitationRepository.findOneBy({
      id: invitationId,
      companyId,
    });
    if (!invitation) {
      throw new NotFoundException('Employee invitation not found');
    }
    return this.toResponse(invitation);
  }

  /**
   * Retries failed deliveries of pending invitations: up to
   * MAX_DELIVERY_ATTEMPTS rounds in total, waiting RETRY_BACKOFF_MINUTES x
   * attempts between rounds. Only failed channels are retried. A failed email
   * gets a fresh token (only the hash is stored, and the old email never
   * arrived); a failed SMS is re-sent as-is because it carries no link.
   */
  @Cron(CronExpression.EVERY_10_MINUTES, {
    name: 'retry-employee-invitation-delivery',
  })
  async retryFailedDeliveries(): Promise<number> {
    const claimed = await this.claimRetryableInvitations();
    let retried = 0;
    for (const id of claimed) {
      const invitation = await this.invitationRepository.findOneBy({ id });
      if (!invitation) continue;
      const company = await this.companyRepository.findOneBy({
        id: invitation.companyId,
      });
      if (!company) continue;

      const channels: EmployeeInvitationChannel[] = [];
      let rawToken: string | null = null;
      if (
        invitation.emailDeliveryStatus ===
        EmployeeInvitationDeliveryStatus.FAILED
      ) {
        channels.push(EmployeeInvitationChannel.EMAIL);
        rawToken = this.createToken();
        invitation.tokenHash = this.hashToken(rawToken);
      }
      if (
        invitation.smsDeliveryStatus === EmployeeInvitationDeliveryStatus.FAILED
      ) {
        channels.push(EmployeeInvitationChannel.SMS);
      }
      if (!channels.length) continue;

      try {
        await this.deliver(invitation, rawToken, company.name, channels);
        retried += 1;
      } catch (error) {
        this.logger.warn(
          `Retrying delivery of invitation ${id} failed: ${this.errorMessage(error)}`,
        );
      }
    }
    return retried;
  }

  /**
   * Atomically picks due invitations and stamps them, so overlapping runs or
   * extra app instances never retry the same invitation twice.
   */
  private async claimRetryableInvitations(): Promise<number[]> {
    const rows: unknown = await this.dataSource.query(
      `UPDATE "employee_invitations" AS "invitation"
          SET "last_delivery_attempt_at" = now()
        WHERE "invitation"."id" IN (
          SELECT "id" FROM "employee_invitations"
           WHERE "status" = $1
             AND "expires_at" > now()
             AND ("email_delivery_status" = $2 OR "sms_delivery_status" = $2)
             AND "delivery_attempts" < $3
             AND ("last_delivery_attempt_at" IS NULL OR
                  "last_delivery_attempt_at" <= now() - make_interval(mins => $4 * GREATEST("delivery_attempts", 1)))
           ORDER BY "last_delivery_attempt_at" NULLS FIRST
           LIMIT 25
           FOR UPDATE SKIP LOCKED
        )
        RETURNING "invitation"."id"`,
      [
        EmployeeInvitationStatus.PENDING,
        EmployeeInvitationDeliveryStatus.FAILED,
        MAX_DELIVERY_ATTEMPTS,
        RETRY_BACKOFF_MINUTES,
      ],
    );
    // node-postgres returns [rows, rowCount] for UPDATE ... RETURNING.
    const list = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    return (Array.isArray(list) ? (list as Array<{ id: number }>) : []).map(
      (row) => row.id,
    );
  }

  /** Marks pending invitations past their expiry as expired, every hour. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'expire-employee-invitations' })
  async expireOverdueInvitations(): Promise<number> {
    const result = await this.invitationRepository
      .createQueryBuilder()
      .update(EmployeeInvitation)
      .set({ status: EmployeeInvitationStatus.EXPIRED })
      .where('status = :status', { status: EmployeeInvitationStatus.PENDING })
      .andWhere('expires_at <= :now', { now: new Date() })
      .execute();
    return result.affected ?? 0;
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
    // An expired invitation can be revived: resending issues a fresh token and
    // expiry and makes it pending again.
    const resendable = [
      EmployeeInvitationStatus.PENDING,
      EmployeeInvitationStatus.EXPIRED,
    ];
    if (!resendable.includes(invitation.status)) {
      throw new ConflictException(
        'Only pending or expired invitations can be resent',
      );
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
    // A manual resend starts a fresh round of automatic retries.
    invitation.deliveryAttempts = 0;
    // Whoever resends takes ownership, so an invitation whose original owner
    // left the company becomes acceptable again.
    if (actor.companyMembershipId) {
      invitation.createdByCompanyUserId = actor.companyMembershipId;
    }
    invitation.status = EmployeeInvitationStatus.PENDING;
    try {
      await this.invitationRepository.save(invitation);
    } catch (error) {
      // Reviving an expired invitation while a newer one is pending for the
      // same person would break the one-pending-per-recipient rule.
      if (this.isPendingDuplicate(error)) {
        throw new ConflictException(
          'A newer pending invitation already exists for this email address or phone number',
        );
      }
      throw error;
    }
    await this.deliver(invitation, rawToken, company.name, channels);
    return this.withCapacity(invitation);
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
      has_existing_account: Boolean(
        await this.findUserByEmail(this.userRepository, invitation.email),
      ),
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
    const result = await this.dataSource.transaction(async (manager) => {
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
      const existingUser = await this.findUserByEmail(
        manager.getRepository(User),
        invitation.email,
      );
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
      const user = await this.findUserByEmail(
        manager.getRepository(User),
        invitation.email,
      );
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

      const employee = await manager.getRepository(Employee).findOne({
        where: { id: created.employeeId },
        select: { id: true, employee_no: true },
      });

      return {
        response: {
          status: current.status,
          employee_id: created.employeeId,
          login_url: `${this.frontendBaseUrl()}/login`,
        },
        employeeNo: employee?.employee_no ?? null,
        inviterCompanyUserId: current.createdByCompanyUserId,
      };
    });

    // Emitted only after commit, so HR is never told about a rolled-back hire.
    this.eventEmitter.emit(
      EmployeeInvitationAcceptedEvent.EVENT,
      new EmployeeInvitationAcceptedEvent(
        invitation.companyId,
        invitation.id,
        result.response.employee_id,
        result.employeeNo,
        `${invitation.firstName} ${invitation.lastName}`.trim(),
        result.inviterCompanyUserId,
        result.employeeNo
          ? `${this.frontendBaseUrl()}/dashboard/employees/profile/${encodeURIComponent(result.employeeNo)}`
          : null,
      ),
    );
    return result.response;
  }

  /** Emails are compared case-insensitively everywhere in this flow. */
  private findUserByEmail(
    repository: Repository<User>,
    email: string,
  ): Promise<User | null> {
    return repository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
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
      this.findUserByEmail(this.userRepository, email),
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
    if (
      existingByPhone &&
      existingByPhone.email.trim().toLowerCase() !== email.trim().toLowerCase()
    ) {
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
    // Null only for an SMS-only retry: the SMS never carries the link.
    rawToken: string | null,
    companyName: string,
    channels: EmployeeInvitationChannel[],
  ): Promise<void> {
    const name = `${invitation.firstName} ${invitation.lastName}`.trim();
    invitation.deliveryAttempts = (invitation.deliveryAttempts ?? 0) + 1;
    invitation.lastDeliveryAttemptAt = new Date();

    if (channels.includes(EmployeeInvitationChannel.EMAIL)) {
      if (!rawToken) {
        throw new Error('An email delivery needs a registration token');
      }
      const actionUrl = this.buildInvitationUrl(rawToken);
      try {
        const result = await this.mailService.sendGenericNotificationEmail(
          invitation.email,
          `Employee invitation from ${companyName}`,
          `${name}, ${companyName} has invited you to complete your employee registration. This invitation expires on ${this.formatExpiry(invitation.expiresAt)}.`,
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
    // Startup validation (config/env.validation.ts) already requires a valid
    // APP_FRONTEND_URL; getOrThrow makes a misconfigured test module fail
    // with a clear message instead of "cannot read properties of undefined".
    return this.configService
      .getOrThrow<string>('APP_FRONTEND_URL')
      .replace(/\/$/, '');
  }

  /** e.g. "12 October 2026 at 11:00 EAT" in the company's timezone. */
  private formatExpiry(date: Date): string {
    const timeZone = this.configService.get<string>(
      'APP_TIMEZONE',
      'Africa/Dar_es_Salaam',
    );
    const format = (zone: string) =>
      new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: zone,
      }).format(date);
    try {
      return `${format(timeZone)} ${this.timeZoneLabel(date, timeZone)}`.trim();
    } catch {
      // An invalid zone must never stop the invitation from being sent.
      return `${format('UTC')} UTC`;
    }
  }

  private timeZoneLabel(date: Date, timeZone: string): string {
    const part = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'short',
    })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value;
    // en-GB renders East Africa Time as "GMT+3"; use the familiar label.
    return timeZone === 'Africa/Dar_es_Salaam' ? 'EAT' : (part ?? timeZone);
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

  /**
   * Adds the position's capacity so HR sees an overfill warning. A failure
   * here must never hide the fact that the invitation was sent.
   */
  private async withCapacity(invitation: EmployeeInvitation) {
    let capacity: PositionCapacity | null = null;
    try {
      capacity = await this.positionCapacity(
        invitation.companyId,
        invitation.primaryPositionId,
        invitation.primaryDepartmentId,
        invitation.id,
      );
    } catch (error) {
      this.logger.warn(
        `Could not compute capacity for invitation ${invitation.id}: ${this.errorMessage(error)}`,
      );
    }
    return { ...this.toResponse(invitation), capacity };
  }

  private toResponse(invitation: EmployeeInvitation) {
    const effectiveStatus =
      invitation.status === EmployeeInvitationStatus.PENDING &&
      invitation.expiresAt.getTime() <= Date.now()
        ? EmployeeInvitationStatus.EXPIRED
        : invitation.status;
    return {
      id: invitation.id,
      status: invitation.status,
      /** Status as HR should see it: pending past expiry reads as expired. */
      effective_status: effectiveStatus,
      accepted_at: invitation.acceptedAt?.toISOString() ?? null,
      accepted_employee_id: invitation.acceptedEmployeeId ?? null,
      source_candidate_id: invitation.sourceCandidateId ?? null,
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
