import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { FilesService } from '../../files/files.service';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../notifications/enums/notification-priority.enum';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Employee } from '../employees/entities/employee.entity';
import {
  RecruitmentCandidate,
  RecruitmentCandidateStatus,
} from '../recruitment/entities/recruitment-candidate.entity';
import { RecruitmentRequest } from '../recruitment/entities/recruitment-request.entity';
import { canSeeSalary } from '../contracts/salary-visibility';
import { HrAccessService } from '../shared/hr-access.service';
import {
  CreateEmployeeLetterDto,
  LetterPreviewDto,
  LetterQueryDto,
  RecipientSearchDto,
  UpdateEmployeeLetterDto,
} from './dto/letters.dto';
import { EmployeeLetter } from './entities/employee-letter.entity';
import { EmployeeLetterEvent } from './entities/employee-letter-event.entity';
import { LetterTemplate } from './entities/letter-template.entity';
import {
  EXTRA_FIELD_KEYS,
  LetterEventActionEnum,
  LetterStatusEnum,
  LetterTypeEnum,
  PLACEHOLDERS,
  buildCatalogue,
  letterTypeLabel,
  missingPlaceholders,
  renderPlaceholders,
} from './letter-catalogue';
import { companyUserNames } from './letter-names';
import { LetterPdfInput, LetterPdfService } from './letter-pdf.service';
import {
  CompanyLetterContext,
  LetterPlaceholdersService,
  LetterRecipientRef,
  ResolvedRecipient,
} from './letter-placeholders.service';
import {
  allocateLetterReference,
  assertLetterTransition,
  assertNotSubmitter,
  computeLetterCan,
  formatLetterDate,
  isoDateInTimezone,
} from './letter-rules';
import {
  LetterTemplatesService,
  assertKnownPlaceholders,
} from './letter-templates.service';
import {
  LetterVerificationService,
  generateLetterVerificationToken,
} from './letter-verification.service';

const CANDIDATE_OFFER_STATUSES = [
  RecruitmentCandidateStatus.SHORTLISTED,
  RecruitmentCandidateStatus.OFFER_DRAFT,
  RecruitmentCandidateStatus.OFFER_APPROVED,
  RecruitmentCandidateStatus.OFFER_ACCEPTED,
];

export type SystemLetterDocumentOptions = {
  entityType: DocumentEntityTypeEnum;
  entityId: number;
  module: DocumentModuleEnum;
  documentType: string;
  title?: string;
  description?: string;
};

export type PdfFile = { buffer: Buffer; fileName: string; mimeType: string };

@Injectable()
export class EmployeeLettersService {
  private readonly logger = new Logger(EmployeeLettersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly hrAccess: HrAccessService,
    private readonly templates: LetterTemplatesService,
    private readonly placeholders: LetterPlaceholdersService,
    private readonly pdf: LetterPdfService,
    private readonly verification: LetterVerificationService,
    private readonly filesService: FilesService,
    private readonly securityEvents: SecurityEventsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly mail?: MailService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Catalogue & recipients                                              */
  /* ------------------------------------------------------------------ */

  catalogue() {
    return buildCatalogue();
  }

  async searchRecipients(actor: AuthenticatedUser, query: RecipientSearchDto) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const kind = query.kind ?? 'any';
    const limit = query.limit ?? 10;
    const q = (query.q ?? '').trim();
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const results: Array<{
      kind: 'employee' | 'candidate';
      id: number;
      name: string;
      employee_no: string | null;
      department: string | null;
      position: string | null;
      email: string | null;
      status: string;
    }> = [];

    if (kind !== 'candidate') {
      const qb = this.dataSource
        .getRepository(Employee)
        .createQueryBuilder('e')
        .leftJoinAndSelect('e.primary_department', 'd')
        .leftJoinAndSelect('e.primary_position', 'p')
        .leftJoinAndSelect('e.company_user', 'cu')
        .leftJoinAndSelect('cu.user', 'u')
        .where('e.company_id = :companyId', { companyId })
        .orderBy('e.first_name', 'ASC')
        .addOrderBy('e.last_name', 'ASC')
        .take(limit);
      const scope = await this.hrAccess.getAccessibleEmployeeIds(actor);
      if (scope) {
        if (!scope.length) qb.andWhere('1 = 0');
        else qb.andWhere('e.id IN (:...scope)', { scope });
      }
      if (q) {
        qb.andWhere(
          `(CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) ILIKE :like
            OR CONCAT_WS(' ', e.first_name, e.last_name) ILIKE :like
            OR e.employee_no ILIKE :like OR d.name ILIKE :like OR p.name ILIKE :like)`,
          { like },
        );
      }
      for (const e of await qb.getMany()) {
        results.push({
          kind: 'employee',
          id: e.id,
          name: [e.first_name, e.middle_name, e.last_name]
            .filter((part) => part && String(part).trim())
            .join(' '),
          employee_no: e.employee_no,
          department: e.primary_department?.name ?? null,
          position: e.primary_position?.name ?? null,
          email: e.company_user?.user?.email ?? null,
          status: String(e.employment_status),
        });
      }
    }

    if (kind !== 'employee') {
      const qb = this.dataSource
        .getRepository(RecruitmentCandidate)
        .createQueryBuilder('c')
        .leftJoin(RecruitmentRequest, 'r', 'r.id = c.requestId')
        .addSelect('r.jobTitle', 'job_title')
        .where('c.companyId = :companyId', { companyId })
        .andWhere('c.status IN (:...statuses)', {
          statuses: CANDIDATE_OFFER_STATUSES,
        })
        .orderBy('c.firstName', 'ASC')
        .limit(limit);
      if (q) {
        qb.andWhere(
          `(CONCAT_WS(' ', c.firstName, c.lastName) ILIKE :like OR c.email ILIKE :like OR r.jobTitle ILIKE :like)`,
          { like },
        );
      }
      const { entities, raw } = await qb.getRawAndEntities();
      entities.forEach((c, i) => {
        results.push({
          kind: 'candidate',
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(' '),
          employee_no: null,
          department: null,
          position:
            ((raw[i] as Record<string, unknown> | undefined)?.job_title as
              | string
              | undefined) ?? null,
          email: c.email,
          status: c.status,
        });
      });
    }
    return results.slice(0, kind === 'any' ? limit : results.length);
  }

  async recipientValues(
    actor: AuthenticatedUser,
    kind: string,
    id: number,
  ): Promise<{ values: Record<string, string>; missing: string[] }> {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const ref = this.recipientRef(kind, id);
    const context = await this.placeholders.companyContext(companyId);
    const recipient = await this.loadRecipient(actor, companyId, ref, context);
    let values = this.placeholders.composeValues({
      context,
      recipient,
      extraValues: {},
      signatoryName: null,
      signatoryTitle: null,
      issueDate: new Date(),
    });
    delete values.signatory_name;
    delete values.signatory_title;
    if (!canSeeSalary(actor, ref.kind === 'employee' ? ref.id : null)) {
      values = this.placeholders.maskConfidential(values);
    }
    const extras = new Set(EXTRA_FIELD_KEYS);
    const missing = PLACEHOLDERS.filter(
      (item) =>
        !extras.has(item.key) &&
        item.key in values &&
        !String(values[item.key] ?? '').trim(),
    ).map((item) => item.key);
    for (const key of Object.keys(values)) {
      if (!String(values[key]).trim()) delete values[key];
    }
    return { values, missing };
  }

  /* ------------------------------------------------------------------ */
  /* Queries                                                             */
  /* ------------------------------------------------------------------ */

  async list(actor: AuthenticatedUser, query: LetterQueryDto) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.dataSource
      .getRepository(EmployeeLetter)
      .createQueryBuilder('l')
      .where('l.company_id = :companyId', { companyId })
      .orderBy('l.created_at', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.status)
      qb.andWhere('l.status = :status', { status: query.status });
    if (query.letter_type)
      qb.andWhere('l.letter_type = :type', { type: query.letter_type });
    if (query.employee_id)
      qb.andWhere('l.employee_id = :employeeId', {
        employeeId: query.employee_id,
      });
    if (query.candidate_id)
      qb.andWhere('l.candidate_id = :candidateId', {
        candidateId: query.candidate_id,
      });
    if (query.search) {
      const like = `%${query.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        '(l.reference_no ILIKE :like OR l.recipient_name ILIKE :like)',
        {
          like,
        },
      );
    }
    const scope = await this.hrAccess.getAccessibleEmployeeIds(actor);
    if (scope) {
      qb.andWhere(
        `(${scope.length ? 'l.employee_id IN (:...scope)' : '1 = 0'}
          OR (l.candidate_id IS NOT NULL AND l.created_by_company_user_id = :me))`,
        { scope, me: actor.companyMembershipId },
      );
    }
    const [rows, total] = await qb.getManyAndCount();
    return {
      data: await this.toJson(rows, actor),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async get(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const letter = await this.findAccessible(actor, companyId, id);
    return this.detail(actor, letter);
  }

  /* ------------------------------------------------------------------ */
  /* Mutations                                                           */
  /* ------------------------------------------------------------------ */

  async create(actor: AuthenticatedUser, dto: CreateEmployeeLetterDto) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    const ref = this.refFromBody(dto);
    if (ref.kind === 'candidate' && dto.letter_type !== LetterTypeEnum.OFFER) {
      throw new BadRequestException(
        'Only employment offer letters can be addressed to a candidate.',
      );
    }
    assertKnownPlaceholders(dto.subject, dto.salutation, dto.body, dto.closing);
    const extra = this.placeholders.sanitizeExtraValues(dto.extra_values);
    await this.templates.ensureDefaults(companyId);
    const template = await this.templates.find(companyId, dto.template_id);
    if ((template.letter_type as LetterTypeEnum) !== dto.letter_type)
      throw new BadRequestException(
        'The template does not belong to the selected letter type.',
      );
    if (!template.is_active || template.deleted_at)
      throw new BadRequestException('The template is not active.');
    const context = await this.placeholders.companyContext(companyId);
    const recipient = await this.loadRecipient(actor, companyId, ref, context);

    const letter = await this.dataSource.transaction(async (em) => {
      const reference = await allocateLetterReference(
        em,
        companyId,
        Number(isoDateInTimezone(new Date(), context.timezone).slice(0, 4)),
      );
      const saved = await em.getRepository(EmployeeLetter).save(
        em.getRepository(EmployeeLetter).create({
          company_id: companyId,
          reference_no: reference,
          letter_type: dto.letter_type,
          template_id: template.id,
          template_version: template.current_version,
          employee_id: ref.kind === 'employee' ? ref.id : null,
          candidate_id: ref.kind === 'candidate' ? ref.id : null,
          recipient_name: recipient.name.slice(0, 200) || 'Recipient',
          recipient_address:
            dto.recipient_address?.trim() || recipient.address || null,
          subject: dto.subject ?? template.subject,
          salutation: dto.salutation ?? template.salutation,
          body: dto.body ?? template.body,
          closing: dto.closing ?? template.closing,
          extra_values: extra,
          values: null,
          signatory_name: template.signatory_name,
          signatory_title: template.signatory_title,
          requires_approval: template.requires_approval,
          include_acknowledgement: template.include_acknowledgement,
          status: LetterStatusEnum.DRAFT,
          created_by_company_user_id: membershipId,
        }),
      );
      await this.event(
        em,
        saved.id,
        LetterEventActionEnum.CREATED,
        membershipId,
      );
      return saved;
    });
    await this.audit(actor, SecurityEventType.EMPLOYEE_LETTER_CREATED, letter);
    return this.detail(actor, letter);
  }

  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateEmployeeLetterDto,
  ) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    await this.findAccessible(actor, companyId, id);
    assertKnownPlaceholders(dto.subject, dto.salutation, dto.body, dto.closing);
    const extra =
      dto.extra_values !== undefined
        ? this.placeholders.sanitizeExtraValues(dto.extra_values)
        : undefined;
    const letter = await this.dataSource.transaction(async (em) => {
      const row = await this.lock(em, companyId, id);
      assertLetterTransition(row.status, 'edit');
      if (dto.subject !== undefined) row.subject = dto.subject;
      if (dto.salutation !== undefined) row.salutation = dto.salutation;
      if (dto.body !== undefined) row.body = dto.body;
      if (dto.closing !== undefined) row.closing = dto.closing;
      if (dto.recipient_address !== undefined)
        row.recipient_address = dto.recipient_address?.trim() || null;
      if (extra !== undefined) row.extra_values = extra;
      // Values are re-snapshotted on the next submit.
      row.values = null;
      const saved = await em.getRepository(EmployeeLetter).save(row);
      await this.event(em, row.id, LetterEventActionEnum.UPDATED, membershipId);
      return saved;
    });
    await this.audit(actor, SecurityEventType.EMPLOYEE_LETTER_UPDATED, letter);
    return this.detail(actor, letter);
  }

  async submit(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    const current = await this.findAccessible(actor, companyId, id);
    assertLetterTransition(current.status, 'submit');
    const context = await this.placeholders.companyContext(companyId);
    const recipient = await this.loadRecipient(
      actor,
      companyId,
      this.letterRef(current),
      context,
    );
    const letter = await this.dataSource.transaction(async (em) => {
      const row = await this.lock(em, companyId, id);
      assertLetterTransition(row.status, 'submit');
      const values = this.composeLetterValues(
        row,
        recipient,
        context,
        new Date(),
      );
      this.assertComplete(row, values);
      const now = new Date();
      row.values = values;
      row.submitted_by_company_user_id = membershipId;
      row.submitted_at = now;
      row.rejected_at = null;
      row.rejected_by_company_user_id = null;
      row.rejection_reason = null;
      if (row.requires_approval) {
        row.status = LetterStatusEnum.PENDING_APPROVAL;
      } else {
        row.status = LetterStatusEnum.APPROVED;
        row.approved_at = now;
        row.approved_by_company_user_id = null;
      }
      const saved = await em.getRepository(EmployeeLetter).save(row);
      await this.event(
        em,
        row.id,
        LetterEventActionEnum.SUBMITTED,
        membershipId,
      );
      if (!row.requires_approval) {
        await this.event(
          em,
          row.id,
          LetterEventActionEnum.APPROVED,
          null,
          'No approval required by the template',
        );
      }
      return saved;
    });
    await this.audit(
      actor,
      SecurityEventType.EMPLOYEE_LETTER_SUBMITTED,
      letter,
    );
    if (letter.status === LetterStatusEnum.PENDING_APPROVAL) {
      await this.notifyApprovers(letter, membershipId);
    }
    return this.detail(actor, letter);
  }

  async approve(actor: AuthenticatedUser, id: number, note?: string) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    await this.findAccessible(actor, companyId, id);
    const letter = await this.dataSource.transaction(async (em) => {
      const row = await this.lock(em, companyId, id);
      assertLetterTransition(row.status, 'approve');
      assertNotSubmitter(actor, row.submitted_by_company_user_id);
      row.status = LetterStatusEnum.APPROVED;
      row.approved_at = new Date();
      row.approved_by_company_user_id = membershipId;
      const saved = await em.getRepository(EmployeeLetter).save(row);
      await this.event(
        em,
        row.id,
        LetterEventActionEnum.APPROVED,
        membershipId,
        note?.trim() || null,
      );
      return saved;
    });
    await this.audit(actor, SecurityEventType.EMPLOYEE_LETTER_APPROVED, letter);
    await this.notifyUser(
      letter,
      letter.submitted_by_company_user_id,
      membershipId,
      {
        title: `Letter ${letter.reference_no} approved`,
        message: `${letterTypeLabel(letter.letter_type)} for ${letter.recipient_name} was approved and can now be issued.`,
      },
    );
    return this.detail(actor, letter);
  }

  async reject(actor: AuthenticatedUser, id: number, reason: string) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    await this.findAccessible(actor, companyId, id);
    const letter = await this.dataSource.transaction(async (em) => {
      const row = await this.lock(em, companyId, id);
      assertLetterTransition(row.status, 'reject');
      assertNotSubmitter(actor, row.submitted_by_company_user_id);
      row.status = LetterStatusEnum.REJECTED;
      row.rejected_at = new Date();
      row.rejected_by_company_user_id = membershipId;
      row.rejection_reason = reason.trim();
      const saved = await em.getRepository(EmployeeLetter).save(row);
      await this.event(
        em,
        row.id,
        LetterEventActionEnum.REJECTED,
        membershipId,
        reason.trim(),
      );
      return saved;
    });
    await this.audit(
      actor,
      SecurityEventType.EMPLOYEE_LETTER_REJECTED,
      letter,
      reason,
    );
    await this.notifyUser(
      letter,
      letter.submitted_by_company_user_id,
      membershipId,
      {
        title: `Letter ${letter.reference_no} returned`,
        message: `${letterTypeLabel(letter.letter_type)} for ${letter.recipient_name} was rejected: ${reason.trim()}`,
      },
    );
    return this.detail(actor, letter);
  }

  async issue(actor: AuthenticatedUser, id: number, sendEmail = true) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    const current = await this.findAccessible(actor, companyId, id);
    assertLetterTransition(current.status, 'issue');
    const context = await this.placeholders.companyContext(companyId);
    const recipient = await this.placeholders.resolveRecipient(
      companyId,
      this.letterRef(current),
      context,
    );
    const { letter, pdf } = await this.dataSource.transaction((em) =>
      this.issueInTransaction(em, {
        companyId,
        letterId: id,
        actorMembershipId: membershipId,
        context,
        recipient,
      }),
    );
    await this.audit(actor, SecurityEventType.EMPLOYEE_LETTER_ISSUED, letter);
    if (letter.revision_of_letter_id) {
      await this.securityEvents.logBestEffort({
        eventType: SecurityEventType.EMPLOYEE_LETTER_SUPERSEDED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        companyId,
        resourceType: 'EMPLOYEE_LETTER',
        resourceId: letter.revision_of_letter_id,
        metadata: { superseded_by_letter_id: letter.id },
      });
    }
    await this.notifyRecipient(letter, recipient, membershipId);
    if (sendEmail && recipient.email) {
      await this.emailLetter(letter, recipient, context, pdf, actor);
    }
    return this.detail(actor, letter);
  }

  async cancel(actor: AuthenticatedUser, id: number, reason: string) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    await this.findAccessible(actor, companyId, id);
    const letter = await this.dataSource.transaction(async (em) => {
      const row = await this.lock(em, companyId, id);
      assertLetterTransition(row.status, 'cancel');
      const wasIssued = row.status === LetterStatusEnum.ISSUED;
      row.status = LetterStatusEnum.CANCELLED;
      row.cancelled_at = new Date();
      row.cancelled_by_company_user_id = membershipId;
      row.cancellation_reason = reason.trim();
      if (wasIssued) row.verification_revoked_at = row.cancelled_at;
      const saved = await em.getRepository(EmployeeLetter).save(row);
      await this.event(
        em,
        row.id,
        LetterEventActionEnum.CANCELLED,
        membershipId,
        reason.trim(),
      );
      if (wasIssued) {
        await this.event(
          em,
          row.id,
          LetterEventActionEnum.VERIFICATION_REVOKED,
          membershipId,
        );
      }
      return saved;
    });
    await this.audit(
      actor,
      SecurityEventType.EMPLOYEE_LETTER_CANCELLED,
      letter,
      reason,
    );
    return this.detail(actor, letter);
  }

  async revise(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    const current = await this.findAccessible(actor, companyId, id);
    const context = await this.placeholders.companyContext(companyId);
    const letter = await this.dataSource.transaction(async (em) => {
      const source = await this.lock(em, companyId, current.id);
      assertLetterTransition(source.status, 'revise');
      const open = await em.getRepository(EmployeeLetter).findOne({
        where: {
          company_id: companyId,
          revision_of_letter_id: source.id,
          status: In([
            LetterStatusEnum.DRAFT,
            LetterStatusEnum.PENDING_APPROVAL,
            LetterStatusEnum.APPROVED,
            LetterStatusEnum.REJECTED,
          ]),
        },
      });
      if (open)
        throw new ConflictException(
          `This letter already has an open revision (${open.reference_no}).`,
        );
      const reference = await allocateLetterReference(
        em,
        companyId,
        Number(isoDateInTimezone(new Date(), context.timezone).slice(0, 4)),
      );
      const saved = await em.getRepository(EmployeeLetter).save(
        em.getRepository(EmployeeLetter).create({
          company_id: companyId,
          reference_no: reference,
          letter_type: source.letter_type,
          template_id: source.template_id,
          template_version: source.template_version,
          employee_id: source.employee_id,
          candidate_id: source.candidate_id,
          recipient_name: source.recipient_name,
          recipient_address: source.recipient_address,
          subject: source.subject,
          salutation: source.salutation,
          body: source.body,
          closing: source.closing,
          extra_values: { ...(source.extra_values ?? {}) },
          values: null,
          signatory_name: source.signatory_name,
          signatory_title: source.signatory_title,
          requires_approval: source.requires_approval,
          include_acknowledgement: source.include_acknowledgement,
          status: LetterStatusEnum.DRAFT,
          revision_of_letter_id: source.id,
          created_by_company_user_id: membershipId,
        }),
      );
      await this.event(
        em,
        saved.id,
        LetterEventActionEnum.CREATED,
        membershipId,
        `Revision of ${source.reference_no}`,
      );
      await this.event(
        em,
        source.id,
        LetterEventActionEnum.REVISED,
        membershipId,
        `Revision drafted as ${reference}`,
      );
      return saved;
    });
    await this.audit(actor, SecurityEventType.EMPLOYEE_LETTER_REVISED, letter);
    return this.detail(actor, letter);
  }

  /* ------------------------------------------------------------------ */
  /* PDFs                                                                */
  /* ------------------------------------------------------------------ */

  async preview(actor: AuthenticatedUser, id: number): Promise<PdfFile> {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const letter = await this.findAccessible(actor, companyId, id);
    if (letter.status === LetterStatusEnum.ISSUED && letter.document_id) {
      const stored = await this.readStored(companyId, letter);
      if (stored) return stored;
    }
    const context = await this.placeholders.companyContext(companyId);
    let values = letter.values;
    let employeeNo: string | null = null;
    if (!values) {
      const recipient = await this.placeholders.resolveRecipient(
        companyId,
        this.letterRef(letter),
        context,
      );
      values = this.composeLetterValues(letter, recipient, context, new Date());
      employeeNo = recipient.employeeNo;
    } else if (letter.employee_id) {
      employeeNo = values.employee_number || null;
    }
    const note =
      letter.status === LetterStatusEnum.CANCELLED
        ? 'CANCELLED – not valid'
        : letter.status === LetterStatusEnum.SUPERSEDED
          ? 'SUPERSEDED – not valid'
          : 'DRAFT – not valid';
    const buffer = await this.pdf.render(
      this.pdfInput(
        letter,
        values,
        context,
        employeeNo,
        null,
        new Date(),
        note,
      ),
    );
    return {
      buffer,
      fileName: `${letter.reference_no}-preview.pdf`,
      mimeType: 'application/pdf',
    };
  }

  async download(actor: AuthenticatedUser, id: number): Promise<PdfFile> {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    const letter = await this.findAccessible(actor, companyId, id);
    assertLetterTransition(letter.status, 'download');
    const stored = await this.readStored(companyId, letter);
    if (!stored) throw new NotFoundException('The letter file was not found.');
    await this.event(
      this.dataSource.manager,
      letter.id,
      LetterEventActionEnum.DOWNLOADED,
      membershipId,
    );
    await this.audit(
      actor,
      SecurityEventType.EMPLOYEE_LETTER_DOWNLOADED,
      letter,
    );
    return stored;
  }

  async previewTemplate(
    actor: AuthenticatedUser,
    templateId: number,
    dto: LetterPreviewDto,
  ): Promise<PdfFile> {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const template = await this.templates.find(companyId, templateId);
    const context = await this.placeholders.companyContext(companyId);
    const extra = this.placeholders.sanitizeExtraValues(dto.extra_values);
    let values: Record<string, string>;
    let recipientName = 'Asha Juma Mwinyi';
    let employeeNo: string | null = 'EMP-0042';
    let address: string | null = 'P.O. Box 1234, Dar es Salaam';
    if (dto.employee_id || dto.candidate_id) {
      const ref = this.refFromBody(dto);
      const recipient = await this.loadRecipient(
        actor,
        companyId,
        ref,
        context,
      );
      values = this.placeholders.composeValues({
        context,
        recipient,
        extraValues: extra,
        signatoryName: template.signatory_name,
        signatoryTitle: template.signatory_title,
        issueDate: new Date(),
      });
      if (!canSeeSalary(actor, ref.kind === 'employee' ? ref.id : null)) {
        values = this.placeholders.maskConfidential(values);
      }
      recipientName = recipient.name;
      employeeNo = recipient.employeeNo;
      address = recipient.address;
    } else {
      values = {
        ...this.placeholders.sampleValues(),
        ...this.placeholders.companyValues(context),
        issue_date: formatLetterDate(
          isoDateInTimezone(new Date(), context.timezone),
          context.timezone,
        ),
        today: formatLetterDate(
          isoDateInTimezone(new Date(), context.timezone),
          context.timezone,
        ),
        signatory_name: template.signatory_name ?? '',
        signatory_title: template.signatory_title ?? '',
        ...this.placeholders.formatExtraValues(extra, context.timezone, 'TZS'),
      };
    }
    const pseudo = {
      reference_no: 'LTR-PREVIEW',
      letter_type: template.letter_type,
      recipient_name: recipientName,
      recipient_address: address,
      subject: template.subject,
      salutation: template.salutation,
      body: template.body,
      closing: template.closing,
      signatory_name: template.signatory_name,
      signatory_title: template.signatory_title,
      include_acknowledgement: template.include_acknowledgement,
    } as EmployeeLetter;
    const buffer = await this.pdf.render(
      this.pdfInput(
        pseudo,
        values,
        context,
        employeeNo,
        null,
        new Date(),
        'PREVIEW – not valid',
      ),
    );
    return {
      buffer,
      fileName: `template-${template.id}-preview.pdf`,
      mimeType: 'application/pdf',
    };
  }

  /* ------------------------------------------------------------------ */
  /* System letters (probation)                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Creates and issues a letter directly from the company default template
   * (no approval step) and returns its Document. Used by probation.
   */
  async issueSystemLetter(
    companyId: number,
    employeeId: number,
    letterType: LetterTypeEnum,
    extraValues: Record<string, string>,
    actor: AuthenticatedUser | null,
    options: {
      manager?: EntityManager;
      valueOverrides?: Record<string, string>;
      document?: SystemLetterDocumentOptions;
    } = {},
  ): Promise<Document> {
    const run = async (em: EntityManager) => {
      await this.templates.ensureDefaults(companyId, em);
      const template = await this.templates.defaultFor(
        companyId,
        letterType,
        em,
      );
      if (!template)
        throw new BadRequestException(
          `Configure an active ${letterTypeLabel(letterType).toLowerCase()} template first`,
        );
      const context = await this.placeholders.companyContext(companyId, em);
      const recipient = await this.placeholders.resolveRecipient(
        companyId,
        { kind: 'employee', id: employeeId },
        context,
        em,
      );
      const membershipId = actor?.companyMembershipId ?? null;
      const reference = await allocateLetterReference(
        em,
        companyId,
        Number(isoDateInTimezone(new Date(), context.timezone).slice(0, 4)),
      );
      const extra = this.placeholders.sanitizeExtraValues(extraValues);
      const now = new Date();
      const draft = await em.getRepository(EmployeeLetter).save(
        em.getRepository(EmployeeLetter).create({
          company_id: companyId,
          reference_no: reference,
          letter_type: letterType,
          template_id: template.id,
          template_version: template.current_version,
          employee_id: employeeId,
          candidate_id: null,
          recipient_name: recipient.name.slice(0, 200) || 'Employee',
          recipient_address: recipient.address,
          subject: template.subject,
          salutation: template.salutation,
          body: template.body,
          closing: template.closing,
          extra_values: extra,
          signatory_name: template.signatory_name,
          signatory_title: template.signatory_title,
          requires_approval: false,
          include_acknowledgement: template.include_acknowledgement,
          status: LetterStatusEnum.APPROVED,
          submitted_by_company_user_id: membershipId,
          submitted_at: now,
          approved_at: now,
          created_by_company_user_id: membershipId,
        }),
      );
      draft.values = this.composeLetterValues(
        draft,
        recipient,
        context,
        now,
        options.valueOverrides,
      );
      this.assertComplete(draft, draft.values);
      await em.getRepository(EmployeeLetter).save(draft);
      await this.event(
        em,
        draft.id,
        LetterEventActionEnum.CREATED,
        membershipId,
        'System letter',
      );
      const { letter, document } = await this.issueInTransaction(em, {
        companyId,
        letterId: draft.id,
        actorMembershipId: membershipId,
        context,
        recipient,
        documentOptions: options.document,
      });
      return { letter, document, recipient };
    };
    const result = options.manager
      ? await run(options.manager)
      : await this.dataSource.transaction(run);
    await this.securityEvents.logBestEffort({
      eventType: SecurityEventType.EMPLOYEE_LETTER_ISSUED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      resourceType: 'EMPLOYEE_LETTER',
      resourceId: result.letter.id,
      metadata: {
        reference_no: result.letter.reference_no,
        letter_type: result.letter.letter_type,
        system: true,
      },
    });
    await this.notifyRecipient(
      result.letter,
      result.recipient,
      actor?.companyMembershipId ?? null,
    );
    return result.document;
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private async issueInTransaction(
    em: EntityManager,
    input: {
      companyId: number;
      letterId: number;
      actorMembershipId: number | null;
      context: CompanyLetterContext;
      recipient: ResolvedRecipient;
      documentOptions?: SystemLetterDocumentOptions;
    },
  ): Promise<{ letter: EmployeeLetter; document: Document; pdf: Buffer }> {
    const row = await this.lock(em, input.companyId, input.letterId);
    assertLetterTransition(row.status, 'issue');
    const now = new Date();
    // All placeholder values, including dates, are frozen at submission.
    if (!row.values) {
      throw new ConflictException('Letter has no submitted value snapshot.');
    }
    const values = row.values;
    this.assertComplete(row, values);
    const token = generateLetterVerificationToken();
    const url = this.verification.buildVerificationUrl(token);
    const pdf = await this.pdf.render(
      this.pdfInput(
        row,
        values,
        input.context,
        row.employee_id ? input.recipient.employeeNo : null,
        url,
        now,
      ),
    );
    const label = letterTypeLabel(row.letter_type);
    const file = await this.filesService.savePrivateBufferFile({
      buffer: pdf,
      fileName: `${row.reference_no}.pdf`,
      mimeType: 'application/pdf',
      directorySegments: ['documents', 'letters', `company-${input.companyId}`],
      fileNamePrefix: row.reference_no.toLowerCase(),
      allowedMimeTypes: ['application/pdf'],
    });
    try {
      const docOpts = input.documentOptions;
      const document = await em.getRepository(Document).save(
        em.getRepository(Document).create({
          company_id: input.companyId,
          entity_type:
            docOpts?.entityType ??
            (row.employee_id
              ? DocumentEntityTypeEnum.EMPLOYEE
              : DocumentEntityTypeEnum.CANDIDATE),
          entity_id:
            docOpts?.entityId ?? (row.employee_id ?? row.candidate_id)!,
          module: docOpts?.module ?? DocumentModuleEnum.EMPLOYEE,
          document_type: docOpts?.documentType ?? `${row.letter_type}_LETTER`,
          title: (docOpts?.title ?? `${label} – ${row.reference_no}`).slice(
            0,
            255,
          ),
          description:
            docOpts?.description ?? `${label} issued to ${row.recipient_name}`,
          file_name: file.storedFileName,
          original_file_name: file.originalFileName,
          mime_type: file.mimeType,
          file_extension: file.fileExtension,
          file_size: String(file.fileSize),
          file_path: file.publicPath,
          uploaded_by_company_user_id: input.actorMembershipId,
          metadata: {
            letter_id: row.id,
            reference_no: row.reference_no,
            letter_type: row.letter_type,
            template_id: row.template_id,
            template_version: row.template_version,
          },
        }),
      );
      row.status = LetterStatusEnum.ISSUED;
      row.issued_at = now;
      row.issued_by_company_user_id = input.actorMembershipId;
      row.document_id = document.id;
      row.values = values;
      await em.getRepository(EmployeeLetter).save(row);
      await em
        .getRepository(EmployeeLetter)
        .update({ id: row.id }, { verification_token: token });
      await this.event(
        em,
        row.id,
        LetterEventActionEnum.ISSUED,
        input.actorMembershipId,
      );

      if (row.revision_of_letter_id) {
        const source = await em.getRepository(EmployeeLetter).findOneBy({
          id: row.revision_of_letter_id,
          company_id: input.companyId,
        });
        if (
          source &&
          [LetterStatusEnum.ISSUED, LetterStatusEnum.APPROVED].includes(
            source.status,
          )
        ) {
          await em.getRepository(EmployeeLetter).update(
            { id: source.id },
            {
              status: LetterStatusEnum.SUPERSEDED,
              superseded_by_letter_id: row.id,
            },
          );
          await this.event(
            em,
            source.id,
            LetterEventActionEnum.SUPERSEDED,
            input.actorMembershipId,
            `Superseded by ${row.reference_no}`,
          );
        }
      }
      if (
        row.candidate_id &&
        (row.letter_type as LetterTypeEnum) === LetterTypeEnum.OFFER
      ) {
        await em
          .getRepository(RecruitmentCandidate)
          .update(
            { id: row.candidate_id, companyId: input.companyId },
            { offerDocumentId: document.id },
          );
      }
      return { letter: row, document, pdf };
    } catch (error) {
      await this.filesService
        .removeManagedFile(file.publicPath)
        .catch(() => undefined);
      throw error;
    }
  }

  private composeLetterValues(
    letter: Pick<
      EmployeeLetter,
      'extra_values' | 'signatory_name' | 'signatory_title'
    >,
    recipient: ResolvedRecipient,
    context: CompanyLetterContext,
    now: Date,
    overrides?: Record<string, string>,
  ): Record<string, string> {
    return this.placeholders.composeValues({
      context,
      recipient,
      extraValues: letter.extra_values,
      signatoryName: letter.signatory_name,
      signatoryTitle: letter.signatory_title,
      issueDate: now,
      overrides,
    });
  }

  private missingFor(
    letter: Pick<
      EmployeeLetter,
      'subject' | 'salutation' | 'body' | 'closing' | 'letter_type'
    >,
    values: Record<string, string>,
  ) {
    return missingPlaceholders(
      [letter.subject, letter.salutation, letter.body, letter.closing],
      values,
      letter.letter_type,
    );
  }

  private assertComplete(
    letter: Pick<
      EmployeeLetter,
      'subject' | 'salutation' | 'body' | 'closing' | 'letter_type'
    >,
    values: Record<string, string>,
  ) {
    const missing = this.missingFor(letter, values);
    if (missing.length) {
      throw new BadRequestException({
        message: `Fill in the missing letter values: ${missing.join(', ')}`,
        missing_placeholders: missing,
      });
    }
  }

  pdfInput(
    letter: Pick<
      EmployeeLetter,
      | 'reference_no'
      | 'letter_type'
      | 'recipient_name'
      | 'recipient_address'
      | 'subject'
      | 'salutation'
      | 'body'
      | 'closing'
      | 'signatory_name'
      | 'signatory_title'
      | 'include_acknowledgement'
    > & { issued_at?: Date | null },
    values: Record<string, string>,
    context: CompanyLetterContext,
    employeeNo: string | null,
    verificationUrl: string | null,
    now: Date,
    draftNote?: string,
  ): LetterPdfInput {
    const tz = context.timezone;
    return {
      branding: {
        companyName: context.companyName,
        address: context.address,
        phone: context.phone,
        email: context.email,
        website: context.website,
      },
      logoUrl: context.logoUrl,
      timezone: tz,
      referenceNo: letter.reference_no,
      dateLabel: formatLetterDate(
        isoDateInTimezone(letter.issued_at ?? now, tz),
        tz,
      ),
      letterTypeLabel: letterTypeLabel(letter.letter_type),
      recipient: {
        name: letter.recipient_name,
        employeeNo,
        addressLines: (letter.recipient_address ?? '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
      salutation: renderPlaceholders(letter.salutation, values),
      subject: renderPlaceholders(letter.subject, values),
      body: renderPlaceholders(letter.body, values),
      closing: renderPlaceholders(letter.closing, values),
      signatoryName: renderPlaceholders(letter.signatory_name ?? '', values),
      signatoryTitle: renderPlaceholders(letter.signatory_title ?? '', values),
      includeAcknowledgement: letter.include_acknowledgement,
      verificationUrl,
      draftNote,
      generatedAt: now,
    };
  }

  private async readStored(
    companyId: number,
    letter: EmployeeLetter,
  ): Promise<PdfFile | null> {
    if (!letter.document_id) return null;
    const document = await this.dataSource
      .getRepository(Document)
      .findOneBy({ id: letter.document_id, company_id: companyId });
    if (!document) return null;
    const buffer = await this.filesService.readManagedFile(document.file_path);
    if (!buffer) return null;
    return {
      buffer,
      fileName: `${letter.reference_no}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  private recipientRef(kind: string, id: number): LetterRecipientRef {
    if (kind === 'employee') return { kind: 'employee', id };
    if (kind === 'candidate') return { kind: 'candidate', id };
    throw new BadRequestException(
      'Recipient kind must be employee or candidate',
    );
  }

  private refFromBody(dto: {
    employee_id?: number;
    candidate_id?: number;
  }): LetterRecipientRef {
    if (!!dto.employee_id === !!dto.candidate_id) {
      throw new BadRequestException(
        'Choose exactly one recipient: an employee or a candidate.',
      );
    }
    return dto.employee_id
      ? { kind: 'employee', id: dto.employee_id }
      : { kind: 'candidate', id: dto.candidate_id! };
  }

  private letterRef(letter: EmployeeLetter): LetterRecipientRef {
    return letter.employee_id
      ? { kind: 'employee', id: letter.employee_id }
      : { kind: 'candidate', id: letter.candidate_id! };
  }

  private async loadRecipient(
    actor: AuthenticatedUser,
    companyId: number,
    ref: LetterRecipientRef,
    context: CompanyLetterContext,
  ) {
    const recipient = await this.placeholders.resolveRecipient(
      companyId,
      ref,
      context,
    );
    if (recipient.employee) {
      await this.hrAccess.assertCanAccessEmployee(actor, recipient.employee);
    }
    return recipient;
  }

  private async findAccessible(
    actor: AuthenticatedUser,
    companyId: number,
    id: number,
  ): Promise<EmployeeLetter> {
    const letter = await this.dataSource
      .getRepository(EmployeeLetter)
      .findOneBy({ id, company_id: companyId });
    if (!letter) throw new NotFoundException('Letter not found');
    const scope = await this.hrAccess.getAccessibleEmployeeIds(actor);
    if (scope) {
      const allowed = letter.employee_id
        ? scope.includes(letter.employee_id)
        : letter.created_by_company_user_id === actor.companyMembershipId;
      if (!allowed) throw new NotFoundException('Letter not found');
    }
    return letter;
  }

  private async lock(
    em: EntityManager,
    companyId: number,
    id: number,
  ): Promise<EmployeeLetter> {
    const row = await em
      .getRepository(EmployeeLetter)
      .createQueryBuilder('l')
      .where('l.id = :id AND l.company_id = :companyId', { id, companyId })
      .setLock('pessimistic_write')
      .getOne();
    if (!row) throw new NotFoundException('Letter not found');
    return row;
  }

  private async event(
    em: EntityManager,
    letterId: number,
    action: LetterEventActionEnum,
    actorCompanyUserId: number | null,
    note: string | null = null,
  ) {
    await em.getRepository(EmployeeLetterEvent).insert({
      letter_id: letterId,
      action,
      actor_company_user_id: actorCompanyUserId,
      note,
    });
  }

  private async detail(actor: AuthenticatedUser, letter: EmployeeLetter) {
    const [json] = await this.toJson([letter], actor);
    let missing: string[] = [];
    if (
      [LetterStatusEnum.DRAFT, LetterStatusEnum.REJECTED].includes(
        letter.status,
      )
    ) {
      try {
        const context = await this.placeholders.companyContext(
          letter.company_id,
        );
        const recipient = await this.placeholders.resolveRecipient(
          letter.company_id,
          this.letterRef(letter),
          context,
        );
        missing = this.missingFor(
          letter,
          this.composeLetterValues(letter, recipient, context, new Date()),
        );
      } catch (error) {
        this.logger.warn(
          `Could not compute missing values for letter ${letter.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    const events = await this.dataSource
      .getRepository(EmployeeLetterEvent)
      .find({
        where: { letter_id: letter.id },
        order: { created_at: 'ASC', id: 'ASC' },
      });
    const names = await companyUserNames(
      this.dataSource.manager,
      events.map((event) => event.actor_company_user_id),
    );
    return {
      ...json,
      missing_placeholders: missing,
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        note: event.note,
        actor_name: event.actor_company_user_id
          ? (names.get(event.actor_company_user_id) ?? null)
          : null,
        created_at: event.created_at,
      })),
    };
  }

  async toJson(letters: EmployeeLetter[], actor: AuthenticatedUser) {
    if (!letters.length) return [];
    const employeeIds = [
      ...new Set(
        letters.map((l) => l.employee_id).filter((id): id is number => !!id),
      ),
    ];
    const templateIds = [
      ...new Set(
        letters.map((l) => l.template_id).filter((id): id is number => !!id),
      ),
    ];
    const [employees, templates, names] = await Promise.all([
      employeeIds.length
        ? this.dataSource.getRepository(Employee).find({
            where: { id: In(employeeIds) },
            select: { id: true, employee_no: true },
          })
        : Promise.resolve([] as Employee[]),
      templateIds.length
        ? this.dataSource.getRepository(LetterTemplate).find({
            where: { id: In(templateIds) },
            select: { id: true, name: true },
            withDeleted: true,
          })
        : Promise.resolve([] as LetterTemplate[]),
      companyUserNames(
        this.dataSource.manager,
        letters.flatMap((l) => [
          l.submitted_by_company_user_id,
          l.approved_by_company_user_id,
          l.issued_by_company_user_id,
        ]),
      ),
    ]);
    const employeeNo = new Map(employees.map((e) => [e.id, e.employee_no]));
    const templateName = new Map(templates.map((t) => [t.id, t.name]));
    const name = (id: number | null) => (id ? (names.get(id) ?? null) : null);
    return letters.map((l) => ({
      id: l.id,
      reference_no: l.reference_no,
      letter_type: l.letter_type,
      letter_type_label: letterTypeLabel(l.letter_type),
      status: l.status,
      template_id: l.template_id,
      template_version: l.template_version,
      template_name: l.template_id
        ? (templateName.get(l.template_id) ?? null)
        : null,
      employee_id: l.employee_id,
      candidate_id: l.candidate_id,
      recipient_kind: l.employee_id ? 'employee' : 'candidate',
      recipient_name: l.recipient_name,
      recipient_address: l.recipient_address,
      employee_no: l.employee_id
        ? (employeeNo.get(l.employee_id) ?? null)
        : null,
      subject: l.subject,
      salutation: l.salutation,
      body: l.body,
      closing: l.closing,
      extra_values: l.extra_values ?? {},
      signatory_name: l.signatory_name,
      signatory_title: l.signatory_title,
      requires_approval: l.requires_approval,
      include_acknowledgement: l.include_acknowledgement,
      missing_placeholders: [] as string[],
      submitted_at: l.submitted_at,
      submitted_by_name: name(l.submitted_by_company_user_id),
      approved_at: l.approved_at,
      approved_by_name: name(l.approved_by_company_user_id),
      rejected_at: l.rejected_at,
      rejection_reason: l.rejection_reason,
      issued_at: l.issued_at,
      issued_by_name: name(l.issued_by_company_user_id),
      cancelled_at: l.cancelled_at,
      cancellation_reason: l.cancellation_reason,
      revision_of_letter_id: l.revision_of_letter_id,
      superseded_by_letter_id: l.superseded_by_letter_id,
      document_id: l.document_id,
      emailed_at: l.emailed_at,
      created_at: l.created_at,
      updated_at: l.updated_at,
      can: computeLetterCan(l, actor),
    }));
  }

  private async emailLetter(
    letter: EmployeeLetter,
    recipient: ResolvedRecipient,
    context: CompanyLetterContext,
    pdf: Buffer,
    actor: AuthenticatedUser,
  ) {
    if (!this.mail || !recipient.email) return;
    try {
      await this.mail.sendEmployeeLetterEmail(
        recipient.email,
        recipient.name,
        context.companyName,
        letter.reference_no,
        letterTypeLabel(letter.letter_type),
        pdf,
      );
      letter.emailed_at = new Date();
      await this.dataSource
        .getRepository(EmployeeLetter)
        .update({ id: letter.id }, { emailed_at: letter.emailed_at });
      await this.event(
        this.dataSource.manager,
        letter.id,
        LetterEventActionEnum.EMAILED,
        actor.companyMembershipId ?? null,
        `Sent to ${recipient.email.replace(/(.).*@/, '$1***@')}`,
      );
      await this.audit(
        actor,
        SecurityEventType.EMPLOYEE_LETTER_EMAILED,
        letter,
      );
    } catch (error) {
      // Email is best effort; the issued letter stays downloadable.
      this.logger.warn(
        `Letter ${letter.reference_no} email failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async notifyRecipient(
    letter: EmployeeLetter,
    recipient: ResolvedRecipient,
    senderId: number | null,
  ) {
    if (!recipient.companyUserId) return;
    await this.notifyUser(letter, recipient.companyUserId, senderId, {
      title: `${letterTypeLabel(letter.letter_type)} issued`,
      message: `Your ${letterTypeLabel(letter.letter_type).toLowerCase()} (${letter.reference_no}) has been issued. You can download it from your documents.`,
      actionUrl: '/dashboard/profile?tab=documents',
    });
  }

  private async notifyApprovers(letter: EmployeeLetter, senderId: number) {
    if (!this.notifications) return;
    try {
      const approvers = await this.dataSource
        .getRepository(CompanyUser)
        .createQueryBuilder('companyUser')
        .leftJoin('companyUser.permission_assignments', 'directAssignment')
        .leftJoin('directAssignment.permission', 'directPermission')
        .leftJoin('companyUser.role_assignments', 'roleAssignment')
        .leftJoin('roleAssignment.role', 'role')
        .leftJoin('role.permissions', 'rolePermission')
        .where('companyUser.company_id = :companyId', {
          companyId: letter.company_id,
        })
        .andWhere('companyUser.status = :status', { status: 'active' })
        .andWhere(
          '(directPermission.name = :permission OR rolePermission.name = :permission)',
          { permission: 'employee_letters:approve' },
        )
        .select('companyUser.id', 'id')
        .distinct(true)
        .getRawMany<{ id: number }>();
      for (const approver of approvers) {
        if (Number(approver.id) === senderId) continue;
        await this.notifyUser(letter, Number(approver.id), senderId, {
          title: `Letter ${letter.reference_no} awaits approval`,
          message: `${letterTypeLabel(letter.letter_type)} for ${letter.recipient_name} was submitted for approval.`,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Could not notify letter approvers: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async notifyUser(
    letter: EmployeeLetter,
    receiverId: number | null,
    senderId: number | null,
    notice: { title: string; message: string; actionUrl?: string },
  ) {
    if (!this.notifications || !receiverId) return;
    try {
      await this.notifications.createAndPush({
        company_id: letter.company_id,
        sender_company_user_id: senderId,
        receiver_company_user_id: receiverId,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: notice.title,
        message: notice.message,
        related_module: 'employee-letters',
        entity_type: 'EMPLOYEE_LETTER',
        entity_id: letter.id,
        action_url:
          notice.actionUrl ??
          `/dashboard/employees/letters?letter=${letter.id}`,
        dedupe_key: `employee-letter:${letter.id}:${letter.status}:${new Date(
          letter.updated_at ?? Date.now(),
        ).getTime()}:${receiverId}`,
        metadata: { letter_id: letter.id, reference_no: letter.reference_no },
      });
    } catch (error) {
      this.logger.warn(
        `Letter notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async audit(
    actor: AuthenticatedUser,
    eventType: SecurityEventType,
    letter: EmployeeLetter,
    reason?: string,
  ) {
    await this.securityEvents.logBestEffort({
      eventType,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId: letter.company_id,
      resourceType: 'EMPLOYEE_LETTER',
      resourceId: letter.id,
      reason: reason?.trim() || null,
      metadata: {
        reference_no: letter.reference_no,
        letter_type: letter.letter_type,
        status: letter.status,
        employee_id: letter.employee_id,
        candidate_id: letter.candidate_id,
      },
    });
  }

  /** Guard used by the controller for actions needing a second permission. */
  assertPermission(actor: AuthenticatedUser, permission: string) {
    if (!hasPermission(actor.permissions, permission)) {
      throw new ForbiddenException(
        'You do not have permission for this action',
      );
    }
  }
}
