import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import { normalizeTanzaniaPhone } from '../../../common/utils/tanzania-phone.util';
import { MailService } from '../../mail/mail.service';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import { HrDocumentsService } from '../documents/hr-documents.service';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { EmployeeInvitationsService } from '../employee-invitations/employee-invitations.service';
import { EmployeeInvitationChannel } from '../employee-invitations/enums/employee-invitation.enum';
import { EmployeeInvitation } from '../employee-invitations/entities/employee-invitation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { Position } from '../positions/entities/position.entity';
import {
  CreateRecruitmentCandidateDto,
  CreateRecruitmentRequestDto,
  RecruitmentCheckDto,
  RecruitmentInterviewDto,
  RecruitmentOfferDto,
  RecruitmentScoreDto,
} from './dto/recruitment.dto';
import {
  RecruitmentCandidate,
  RecruitmentCandidateStatus,
} from './entities/recruitment-candidate.entity';
import {
  RecruitmentRequest,
  RecruitmentRequestStatus,
} from './entities/recruitment-request.entity';

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly documents: HrDocumentsService,
    private readonly invitations: EmployeeInvitationsService,
    private readonly securityEvents: SecurityEventsService,
    @InjectRepository(RecruitmentRequest)
    private readonly requests: Repository<RecruitmentRequest>,
    @InjectRepository(RecruitmentCandidate)
    private readonly candidates: Repository<RecruitmentCandidate>,
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(EmployeeInvitation)
    private readonly invitationRepository: Repository<EmployeeInvitation>,
  ) {}

  private companyId(actor: AuthenticatedUser): number {
    if (!actor.companyId || !actor.companyMembershipId)
      throw new ForbiddenException('Company membership required');
    return actor.companyId;
  }

  private canManage(actor: AuthenticatedUser): boolean {
    return (
      actor.permissions.includes('employees:create') ||
      actor.roles.some((role) =>
        ['HR_MANAGER', 'HR_OFFICER', 'COMPANY_ADMIN'].includes(role),
      )
    );
  }

  private assertManage(actor: AuthenticatedUser): void {
    if (!this.canManage(actor))
      throw new ForbiddenException('HR recruitment access required');
  }

  private async requestOrFail(
    companyId: number,
    id: number,
  ): Promise<RecruitmentRequest> {
    const request = await this.requests.findOneBy({ id, companyId });
    if (!request) throw new NotFoundException('Recruitment request not found');
    return request;
  }

  private async candidateOrFail(
    companyId: number,
    id: number,
  ): Promise<RecruitmentCandidate> {
    const candidate = await this.candidates.findOneBy({ id, companyId });
    if (!candidate || candidate.status === RecruitmentCandidateStatus.PURGED)
      throw new NotFoundException('Candidate not found');
    return candidate;
  }

  private async availableHeadcount(
    request: RecruitmentRequest,
  ): Promise<number> {
    const position = await this.positions.findOneBy({
      id: request.positionId,
      company_id: request.companyId,
    });
    if (!position) throw new NotFoundException('Position not found');
    const occupied = await this.employees.count({
      where: {
        company_id: request.companyId,
        primary_position_id: request.positionId,
        employment_status: In([
          EmploymentStatusEnum.ONBOARDING,
          EmploymentStatusEnum.ACTIVE,
          EmploymentStatusEnum.SUSPENDED,
        ]),
      },
    });
    return position.headcount - occupied;
  }

  async createRequest(
    actor: AuthenticatedUser,
    dto: CreateRecruitmentRequestDto,
  ) {
    const companyId = this.companyId(actor);
    const [position, manager] = await Promise.all([
      this.positions.findOneBy({
        id: dto.position_id,
        company_id: companyId,
        is_active: true,
      }),
      this.employees.findOneBy({
        id: dto.manager_employee_id,
        company_id: companyId,
      }),
    ]);
    if (!position || !manager?.company_user_id)
      throw new BadRequestException(
        'Active position and linked manager are required',
      );
    if (actor.employeeId !== manager.id && !this.canManage(actor))
      throw new ForbiddenException('Only the manager or HR may request hiring');
    if (!position.branch_id || !position.department_id)
      throw new BadRequestException(
        'Position requires a branch and department before recruitment',
      );
    if (dto.vacancies > position.headcount)
      throw new BadRequestException('Vacancies exceed position headcount');
    if (Number(dto.budget_amount) <= 0)
      throw new BadRequestException('Budget must be positive');
    return this.requests.save(
      this.requests.create({
        companyId,
        positionId: position.id,
        managerEmployeeId: manager.id,
        vacancies: dto.vacancies,
        budgetAmount: dto.budget_amount,
        jobTitle: dto.job_title.trim(),
        jobDescription: dto.job_description.trim(),
        closesOn: dto.closes_on ?? null,
        status: RecruitmentRequestStatus.PENDING_MANAGER,
        requestedByCompanyUserId: actor.companyMembershipId!,
      }),
    );
  }

  async listRequests(actor: AuthenticatedUser) {
    const companyId = this.companyId(actor);
    if (this.canManage(actor) || actor.permissions.includes('payroll:config')) {
      return this.requests.find({
        where: { companyId },
        order: { createdAt: 'DESC' },
      });
    }
    if (!actor.employeeId)
      throw new ForbiddenException('Recruitment access required');
    return this.requests.find({
      where: { companyId, managerEmployeeId: actor.employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async approveRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.companyId(actor);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RecruitmentRequest);
      const request = await repository
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id AND request.companyId = :companyId', {
          id,
          companyId,
        })
        .getOne();
      if (!request)
        throw new NotFoundException('Recruitment request not found');
      if (request.status === RecruitmentRequestStatus.PENDING_MANAGER) {
        const reportingManager = await manager
          .getRepository(Employee)
          .findOneByOrFail({
            id: request.managerEmployeeId,
            company_id: companyId,
          });
        if (reportingManager.company_user_id !== actor.companyMembershipId)
          throw new ForbiddenException('Assigned manager approval required');
        request.managerApprovedByCompanyUserId = actor.companyMembershipId!;
        request.status = RecruitmentRequestStatus.PENDING_HR;
      } else if (request.status === RecruitmentRequestStatus.PENDING_HR) {
        this.assertManage(actor);
        if (
          actor.companyMembershipId === request.managerApprovedByCompanyUserId
        )
          throw new ForbiddenException('HR approval must be independent');
        request.hrApprovedByCompanyUserId = actor.companyMembershipId!;
        request.status = RecruitmentRequestStatus.PENDING_FINANCE;
      } else if (request.status === RecruitmentRequestStatus.PENDING_FINANCE) {
        if (!actor.permissions.includes('payroll:config'))
          throw new ForbiddenException('Finance approval required');
        if (
          [
            request.managerApprovedByCompanyUserId,
            request.hrApprovedByCompanyUserId,
          ].includes(actor.companyMembershipId!)
        )
          throw new ForbiddenException('Finance approval must be independent');
        if (request.vacancies > (await this.availableHeadcount(request)))
          throw new ConflictException(
            'Position headcount is no longer available',
          );
        request.financeApprovedByCompanyUserId = actor.companyMembershipId!;
        request.status = RecruitmentRequestStatus.APPROVED;
      } else {
        throw new ConflictException('Request has no pending approval');
      }
      return repository.save(request);
    });
  }

  async post(actor: AuthenticatedUser, id: number) {
    this.assertManage(actor);
    const request = await this.requestOrFail(this.companyId(actor), id);
    if (request.status !== RecruitmentRequestStatus.APPROVED)
      throw new ConflictException('Request is not approved');
    request.status = RecruitmentRequestStatus.POSTED;
    return this.requests.save(request);
  }

  async closeRequest(actor: AuthenticatedUser, id: number) {
    this.assertManage(actor);
    const companyId = this.companyId(actor);
    return this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(RecruitmentRequest);
      const candidateRepository = manager.getRepository(RecruitmentCandidate);
      const request = await requestRepository
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id AND request.companyId = :companyId', {
          id,
          companyId,
        })
        .getOne();
      if (!request || request.status !== RecruitmentRequestStatus.POSTED)
        throw new ConflictException('Open posting not found');
      const unsuccessful = await candidateRepository.find({
        where: {
          companyId,
          requestId: id,
          status: In([
            RecruitmentCandidateStatus.APPLIED,
            RecruitmentCandidateStatus.SHORTLISTED,
            RecruitmentCandidateStatus.OFFER_DRAFT,
            RecruitmentCandidateStatus.OFFER_APPROVED,
          ]),
        },
      });
      for (const candidate of unsuccessful) {
        candidate.status = RecruitmentCandidateStatus.REJECTED;
        candidate.offerTokenHash = null;
        candidate.retentionUntil = this.retentionDeadline();
      }
      if (unsuccessful.length) await candidateRepository.save(unsuccessful);
      request.status = RecruitmentRequestStatus.CLOSED;
      await requestRepository.save(request);
      return {
        id: request.id,
        status: request.status,
        unsuccessful_count: unsuccessful.length,
      };
    });
  }

  async createCandidate(
    actor: AuthenticatedUser,
    requestId: number,
    dto: CreateRecruitmentCandidateDto,
  ) {
    this.assertManage(actor);
    const companyId = this.companyId(actor);
    const request = await this.requestOrFail(companyId, requestId);
    if (request.status !== RecruitmentRequestStatus.POSTED)
      throw new ConflictException('Posting is not open');
    if (
      request.closesOn &&
      request.closesOn < new Date().toISOString().slice(0, 10)
    )
      throw new ConflictException('Posting has closed');
    const email = dto.email.trim().toLowerCase();
    const duplicate = await this.candidates.findOneBy({
      companyId,
      requestId,
      email,
    });
    if (duplicate)
      throw new ConflictException('Candidate already applied to this posting');
    const phone = normalizeTanzaniaPhone(dto.phone);
    if (!phone)
      throw new BadRequestException('Valid Tanzanian phone number required');
    return this.candidates.save(
      this.candidates.create({
        companyId,
        requestId,
        firstName: dto.first_name.trim(),
        lastName: dto.last_name.trim(),
        gender: dto.gender,
        email,
        phone,
        status: RecruitmentCandidateStatus.APPLIED,
        checks: {},
        interview: null,
        retentionUntil: null,
      }),
    );
  }

  async listCandidates(actor: AuthenticatedUser, requestId: number) {
    this.assertManage(actor);
    await this.requestOrFail(this.companyId(actor), requestId);
    return this.candidates.find({
      where: { companyId: actor.companyId!, requestId },
      order: { createdAt: 'DESC' },
    });
  }

  async uploadCandidateDocument(
    actor: AuthenticatedUser,
    id: number,
    type: 'CV' | 'OFFER',
    file: Base64FileDto,
  ) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (
      type === 'OFFER' &&
      candidate.status !== RecruitmentCandidateStatus.OFFER_DRAFT
    )
      throw new ConflictException('Draft offer required');
    const allowed =
      type === 'OFFER'
        ? ['application/pdf']
        : [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ];
    if (!allowed.includes(file.mimeType.toLowerCase()))
      throw new BadRequestException(
        `${type} must be a PDF or supported document`,
      );
    const document = await this.documents.upload({
      companyId: candidate.companyId,
      entityType: DocumentEntityTypeEnum.CANDIDATE,
      entityId: candidate.id,
      module: DocumentModuleEnum.RECRUITMENT,
      documentTypeCode: type,
      title: type === 'CV' ? 'Candidate CV' : 'Offer letter',
      file,
      uploadedByCompanyUserId: actor.companyMembershipId!,
      directorySegments: [
        'documents',
        'recruitment',
        `company-${candidate.companyId}`,
      ],
      fileNamePrefix: `candidate-${candidate.id}-${type.toLowerCase()}`,
    });
    if (type === 'CV') candidate.cvDocumentId = document.id;
    else candidate.offerDocumentId = document.id;
    await this.candidates.save(candidate);
    return document;
  }

  async candidateDocument(
    actor: AuthenticatedUser,
    id: number,
    documentId: number,
  ) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    const document = await this.documents.findOneForEntityOrFail(
      candidate.companyId,
      DocumentEntityTypeEnum.CANDIDATE,
      candidate.id,
      documentId,
    );
    const buffer = await this.documents.readFile(document);
    if (!buffer)
      throw new NotFoundException('Candidate document file not found');
    await this.securityEvents.log({
      eventType: SecurityEventType.RECRUITMENT_DOCUMENT_DOWNLOADED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId: candidate.companyId,
      resourceType: 'recruitment_candidate_document',
      resourceId: document.id,
      metadata: {
        candidate_id: candidate.id,
        document_type: document.document_type,
      },
      context: resolveAuditContext(),
    });
    return {
      buffer,
      mimeType: document.mime_type,
      fileName: document.original_file_name,
    };
  }

  async shortlist(actor: AuthenticatedUser, id: number, selected: boolean) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (candidate.status !== RecruitmentCandidateStatus.APPLIED)
      throw new ConflictException('Candidate is not awaiting shortlisting');
    candidate.status = selected
      ? RecruitmentCandidateStatus.SHORTLISTED
      : RecruitmentCandidateStatus.REJECTED;
    if (!selected) candidate.retentionUntil = this.retentionDeadline();
    return this.candidates.save(candidate);
  }

  async rejectCandidate(actor: AuthenticatedUser, id: number) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (
      [
        RecruitmentCandidateStatus.OFFER_ACCEPTED,
        RecruitmentCandidateStatus.INVITED,
      ].includes(candidate.status)
    )
      throw new ConflictException(
        'Accepted candidates cannot be rejected here',
      );
    candidate.status = RecruitmentCandidateStatus.REJECTED;
    candidate.offerTokenHash = null;
    candidate.retentionUntil = this.retentionDeadline();
    return this.candidates.save(candidate);
  }

  async scheduleInterview(
    actor: AuthenticatedUser,
    id: number,
    dto: RecruitmentInterviewDto,
  ) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (candidate.status !== RecruitmentCandidateStatus.SHORTLISTED)
      throw new ConflictException('Shortlisted candidate required');
    if (!dto.panel_company_user_ids.length)
      throw new BadRequestException('Interview panel required');
    candidate.interview = {
      scheduled_at: dto.scheduled_at,
      location: dto.location.trim(),
      panel_company_user_ids: dto.panel_company_user_ids,
      scores: {},
    };
    return this.candidates.save(candidate);
  }

  async scoreInterview(
    actor: AuthenticatedUser,
    id: number,
    dto: RecruitmentScoreDto,
  ) {
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    const interview = candidate.interview;
    if (
      candidate.status !== RecruitmentCandidateStatus.SHORTLISTED ||
      !interview
    )
      throw new ConflictException('Scheduled interview required');
    if (
      !(interview.panel_company_user_ids as number[]).includes(
        actor.companyMembershipId!,
      )
    )
      throw new ForbiddenException('Panel membership required');
    candidate.interview = {
      ...interview,
      scores: {
        ...(interview.scores as Record<string, unknown>),
        [actor.companyMembershipId!]: {
          score: dto.score,
          comments: dto.comments.trim(),
          at: new Date().toISOString(),
        },
      },
    };
    return this.candidates.save(candidate);
  }

  async recordCheck(
    actor: AuthenticatedUser,
    id: number,
    dto: RecruitmentCheckDto,
  ) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (candidate.status !== RecruitmentCandidateStatus.SHORTLISTED)
      throw new ConflictException('Shortlisted candidate required');
    candidate.checks = {
      ...candidate.checks,
      [dto.type]: {
        result: dto.result,
        evidence_note: dto.evidence_note.trim(),
        checked_by: actor.companyMembershipId,
        checked_at: new Date().toISOString(),
      },
    };
    return this.candidates.save(candidate);
  }

  async draftOffer(
    actor: AuthenticatedUser,
    id: number,
    dto: RecruitmentOfferDto,
  ) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (candidate.status !== RecruitmentCandidateStatus.SHORTLISTED)
      throw new ConflictException('Shortlisted candidate required');
    for (const check of ['REFERENCE', 'CERTIFICATE', 'NIDA']) {
      if (
        (candidate.checks?.[check] as { result?: string } | undefined)
          ?.result !== 'PASS'
      )
        throw new BadRequestException(
          `${check} check must pass before an offer`,
        );
    }
    if (
      !Object.keys(
        (candidate.interview?.scores as Record<string, unknown> | undefined) ??
          {},
      ).length
    )
      throw new BadRequestException('Interview score sheet required');
    const request = await this.requestOrFail(
      candidate.companyId,
      candidate.requestId,
    );
    if (
      Number(dto.salary) <= 0 ||
      Number(dto.salary) > Number(request.budgetAmount)
    )
      throw new BadRequestException('Offer salary exceeds approved budget');
    candidate.offerSalary = dto.salary;
    candidate.offerStartDate = dto.start_date;
    candidate.offerCreatedByCompanyUserId = actor.companyMembershipId!;
    candidate.status = RecruitmentCandidateStatus.OFFER_DRAFT;
    return this.candidates.save(candidate);
  }

  async approveOffer(actor: AuthenticatedUser, id: number) {
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (!actor.permissions.includes('payroll:config'))
      throw new ForbiddenException('Finance offer approval required');
    if (
      candidate.status !== RecruitmentCandidateStatus.OFFER_DRAFT ||
      !candidate.offerDocumentId
    )
      throw new ConflictException('Draft offer letter required');
    if (candidate.offerCreatedByCompanyUserId === actor.companyMembershipId)
      throw new ForbiddenException('Offer approver must be independent');
    candidate.offerApprovedByCompanyUserId = actor.companyMembershipId!;
    candidate.status = RecruitmentCandidateStatus.OFFER_APPROVED;
    return this.candidates.save(candidate);
  }

  async sendOffer(actor: AuthenticatedUser, id: number) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (
      candidate.status !== RecruitmentCandidateStatus.OFFER_APPROVED ||
      !candidate.email
    )
      throw new ConflictException('Approved offer required');
    const token = randomBytes(32).toString('base64url');
    candidate.offerTokenHash = createHash('sha256').update(token).digest('hex');
    candidate.offerExpiresAt = new Date(Date.now() + 7 * 86400000);
    await this.candidates.save(candidate);
    const frontend = (
      this.config.get<string>('APP_FRONTEND_URL') ?? ''
    ).replace(/\/$/, '');
    await this.mail.sendGenericNotificationEmail(
      candidate.email,
      'Employment offer',
      `Your employment offer is ready. Please review and accept before ${candidate.offerExpiresAt.toISOString()}.`,
      `${frontend}/recruitment/offer?token=${encodeURIComponent(token)}`,
    );
    return {
      id: candidate.id,
      status: candidate.status,
      offer_expires_at: candidate.offerExpiresAt,
    };
  }

  async acceptOffer(rawToken: string) {
    const tokenHash = createHash('sha256')
      .update(rawToken.trim())
      .digest('hex');
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RecruitmentCandidate);
      const candidate = await repository
        .createQueryBuilder('candidate')
        .setLock('pessimistic_write')
        .where('candidate.offerTokenHash = :tokenHash', { tokenHash })
        .getOne();
      if (
        !candidate ||
        candidate.status !== RecruitmentCandidateStatus.OFFER_APPROVED ||
        !candidate.offerExpiresAt ||
        candidate.offerExpiresAt < new Date()
      ) {
        throw new ConflictException('Offer is unavailable or expired');
      }
      candidate.offerAcceptedAt = new Date();
      candidate.offerTokenHash = null;
      candidate.status = RecruitmentCandidateStatus.OFFER_ACCEPTED;
      await repository.save(candidate);
      return { status: candidate.status, candidate_id: candidate.id };
    });
  }

  async previewOffer(rawToken: string) {
    const tokenHash = createHash('sha256')
      .update(rawToken.trim())
      .digest('hex');
    const candidate = await this.candidates.findOneBy({
      offerTokenHash: tokenHash,
      status: RecruitmentCandidateStatus.OFFER_APPROVED,
    });
    if (
      !candidate ||
      !candidate.offerExpiresAt ||
      candidate.offerExpiresAt < new Date()
    )
      throw new NotFoundException('Offer not found or expired');
    const request = await this.requestOrFail(
      candidate.companyId,
      candidate.requestId,
    );
    return {
      candidate_name: `${candidate.firstName} ${candidate.lastName}`,
      job_title: request.jobTitle,
      salary: candidate.offerSalary,
      start_date: candidate.offerStartDate,
      offer_expires_at: candidate.offerExpiresAt,
      has_letter: Boolean(candidate.offerDocumentId),
    };
  }

  async offerLetter(rawToken: string) {
    const tokenHash = createHash('sha256')
      .update(rawToken.trim())
      .digest('hex');
    const candidate = await this.candidates.findOneBy({
      offerTokenHash: tokenHash,
      status: RecruitmentCandidateStatus.OFFER_APPROVED,
    });
    if (
      !candidate ||
      !candidate.offerDocumentId ||
      !candidate.offerExpiresAt ||
      candidate.offerExpiresAt < new Date()
    )
      throw new NotFoundException('Offer letter not found');
    const document = await this.documents.findOneForEntityOrFail(
      candidate.companyId,
      DocumentEntityTypeEnum.CANDIDATE,
      candidate.id,
      candidate.offerDocumentId,
    );
    const buffer = await this.documents.readFile(document);
    if (!buffer) throw new NotFoundException('Offer letter file not found');
    await this.securityEvents.log({
      eventType: SecurityEventType.RECRUITMENT_DOCUMENT_DOWNLOADED,
      outcome: SecurityEventOutcome.SUCCESS,
      companyId: candidate.companyId,
      resourceType: 'recruitment_offer_document',
      resourceId: document.id,
      metadata: { candidate_id: candidate.id, public_offer_access: true },
      context: resolveAuditContext(),
    });
    return {
      buffer,
      mimeType: document.mime_type,
      fileName: document.original_file_name,
    };
  }

  async convertToInvitation(
    actor: AuthenticatedUser,
    id: number,
    workflowId: number,
  ) {
    this.assertManage(actor);
    const candidate = await this.candidateOrFail(this.companyId(actor), id);
    if (
      candidate.status !== RecruitmentCandidateStatus.OFFER_ACCEPTED ||
      !candidate.firstName ||
      !candidate.lastName ||
      !candidate.email ||
      !candidate.phone ||
      !candidate.gender
    )
      throw new ConflictException('Accepted offer required');
    const request = await this.requestOrFail(
      candidate.companyId,
      candidate.requestId,
    );
    const position = await this.positions.findOneByOrFail({
      id: request.positionId,
      company_id: candidate.companyId,
    });
    if (!position.branch_id || !position.department_id)
      throw new BadRequestException('Position assignment is incomplete');
    if ((await this.availableHeadcount(request)) < 1)
      throw new ConflictException('Position headcount is full');
    let invitation = candidate.invitationId
      ? await this.invitationRepository.findOneBy({
          id: candidate.invitationId,
          companyId: candidate.companyId,
        })
      : null;
    if (!invitation)
      invitation = await this.invitationRepository.findOneBy({
        companyId: candidate.companyId,
        sourceCandidateId: candidate.id,
      });
    if (!invitation) {
      const created = await this.invitations.create(
        candidate.companyId,
        {
          first_name: candidate.firstName,
          last_name: candidate.lastName,
          gender: candidate.gender,
          email: candidate.email,
          phone: candidate.phone,
          primary_branch_id: position.branch_id,
          primary_department_id: position.department_id,
          primary_position_id: position.id,
          employment_type: EmploymentTypeEnum.FULL_TIME,
          reports_to: request.managerEmployeeId,
          hire_date: candidate.offerStartDate ?? undefined,
          onboarding_workflow_id: workflowId,
          channels: [
            EmployeeInvitationChannel.EMAIL,
            EmployeeInvitationChannel.SMS,
          ],
        },
        actor,
        candidate.id,
      );
      invitation = await this.invitationRepository.findOneByOrFail({
        id: created.id,
        companyId: candidate.companyId,
      });
    }
    candidate.invitationId = invitation.id;
    candidate.status = RecruitmentCandidateStatus.INVITED;
    await this.candidates.save(candidate);
    return {
      candidate_id: candidate.id,
      invitation_id: invitation.id,
      status: candidate.status,
    };
  }

  private retentionDeadline(): Date {
    const days =
      this.config.get<number>('RECRUITMENT_UNSUCCESSFUL_RETENTION_DAYS') ?? 180;
    return new Date(Date.now() + days * 86400000);
  }

  @Cron('0 0 3 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async purgeExpiredCandidates() {
    const candidates = await this.candidates.find({
      where: {
        status: RecruitmentCandidateStatus.REJECTED,
        retentionUntil: LessThanOrEqual(new Date()),
      },
      take: 100,
    });
    for (const candidate of candidates) {
      await this.documents.purgeForEntity(
        candidate.companyId,
        DocumentEntityTypeEnum.CANDIDATE,
        candidate.id,
      );
      candidate.firstName = null;
      candidate.lastName = null;
      candidate.gender = null;
      candidate.email = null;
      candidate.phone = null;
      candidate.cvDocumentId = null;
      candidate.interview = null;
      candidate.checks = null;
      candidate.offerSalary = null;
      candidate.offerStartDate = null;
      candidate.offerDocumentId = null;
      candidate.offerTokenHash = null;
      candidate.status = RecruitmentCandidateStatus.PURGED;
      candidate.purgedAt = new Date();
      await this.candidates.save(candidate);
    }
    return candidates.length;
  }
}
