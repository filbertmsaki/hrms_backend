import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import { TwoFaService } from '../../auth/2fa/2fa.service';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { HrDocumentsService } from '../documents/hr-documents.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmploymentHistoryService } from '../employment-history/employment-history.service';
import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';
import { HrAccessService } from '../shared/hr-access.service';
import { assertTransition, ContractAction } from './contract-lifecycle';
import {
  CertificateEntry,
  ContractDocumentService,
  sha256,
  SignatureLayout,
} from './contract-document.service';
import { ContractNotifierService } from './contract-notifier.service';
import {
  ContractSettingsService,
  readContractSettings,
  readLogo,
  readBranding,
} from './contract-settings.service';
import {
  CONTRACT_TOKENS,
  CONTRACT_TYPE_LABELS,
  ContractTemplatesService,
  invalidContractTokens,
  readSnapshot,
  renderSections,
  snapshotFromContext,
  tokensIn,
} from './contract-templates.service';
import { displayValues, fixPlurals } from './contract-format';
import { isLiveMode, readStringMap, sha256Json } from './contract-live-values';
import { canSeeSalary } from './salary-visibility';
import {
  applyValuesToColumns,
  assertLiveDraftRules,
} from './contract-draft-rules';
import {
  CONTRACT_FIELD_METADATA,
  addressOverrideWarning,
  taskDescriptionError,
} from './contract-field-metadata';
import {
  ReassignSignatoryDto,
  SendContractDto,
  SignContractDto,
  SignedUploadDto,
  VerifyUploadDto,
} from './dto/contract-workflow.dto';
import { ContractSignatory } from './entities/contract-signatory.entity';
import {
  ContractSignature,
  ContractSignatureMethod,
  ContractSignatureParty,
  ContractSignatureVerification,
} from './entities/contract-signature.entity';
import { ContractSigningChallenge } from './entities/contract-signing-challenge.entity';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAX_SIGNATURE_PNG_BYTES = 200 * 1024;

type Party = 'COMPANY' | 'EMPLOYEE';

function todayInTanzania(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}***@${domain ?? ''}`;
}

function stripDataUrl(value: string): string {
  return value.replace(/^data:[^;]+;base64,/, '');
}

@Injectable()
export class ContractSigningService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmploymentContract)
    private readonly contracts: Repository<EmploymentContract>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly access: HrAccessService,
    private readonly documents: HrDocumentsService,
    private readonly renderer: ContractDocumentService,
    private readonly templates: ContractTemplatesService,
    private readonly settings: ContractSettingsService,
    private readonly notifier: ContractNotifierService,
    private readonly history: EmploymentHistoryService,
    private readonly securityEvents: SecurityEventsService,
    @Optional() private readonly twoFa?: TwoFaService,
  ) {}

  // ─────────────────────────── preparation ───────────────────────────

  /** Every template field with its automatic value and HR override. */
  async fields(actor: AuthenticatedUser, id: number) {
    const contract = await this.loadForManage(actor, id);
    return this.fieldsForContract(actor, contract);
  }

  async fieldsForContract(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
  ) {
    const context = await this.templates.buildContext(contract);
    const raw = contract.sections?.length
      ? contract.sections
      : (
          await this.templates.sectionsFor(
            contract.companyId,
            contract.contractType,
            undefined,
            isLiveMode(contract.particulars) ? 'particulars' : 'classic',
          )
        ).sections;
    const used = new Set(
      raw.flatMap((section) => tokensIn(`${section.heading} ${section.body}`)),
    );
    const reasons = readStringMap(contract.particulars?.override_reasons);
    const salaryVisible = canSeeSalary(actor, contract.employeeId);
    const addressWarning = addressOverrideWarning(
      context.overrides.employee_address,
      context.values.company_address,
    );
    return CONTRACT_TOKENS.map((token) =>
      !salaryVisible && token === 'salary'
        ? {
            key: token,
            automatic: '',
            override: null,
            value: '',
            used: used.has(token),
            source: 'Set by payroll',
            warning: null,
            override_reason: null,
            frozen: context.frozen,
            reference_id: null,
            automatic_reference_id: null,
            automatic_reference_label: null,
            hidden: true,
            // Lets the editor tell "hidden" from "missing".
            has_value: !!context.values[token]?.trim(),
          }
        : {
            key: token,
            automatic: context.automatic[token] ?? '',
            override: context.overrides[token] ?? null,
            value: context.values[token] ?? '',
            used: used.has(token),
            // Live drafts and frozen contracts: provenance and HR's reason.
            source: context.sources[token] ?? null,
            warning:
              context.warnings[token] ??
              (token === 'employee_address' ? addressWarning : null),
            override_reason: reasons[token] ?? null,
            frozen: context.frozen,
            reference_id: CONTRACT_FIELD_METADATA[token].referenceKey
              ? (context.liveRefs[
                  CONTRACT_FIELD_METADATA[token]
                    .referenceKey as keyof typeof context.liveRefs
                ] ?? null)
              : null,
            automatic_reference_id: CONTRACT_FIELD_METADATA[token].referenceKey
              ? (context.automaticRefs?.[
                  CONTRACT_FIELD_METADATA[token]
                    .referenceKey as keyof NonNullable<
                    typeof context.automaticRefs
                  >
                ]?.id ?? null)
              : null,
            automatic_reference_label: CONTRACT_FIELD_METADATA[token]
              .referenceKey
              ? (context.automaticRefs?.[
                  CONTRACT_FIELD_METADATA[token]
                    .referenceKey as keyof NonNullable<
                    typeof context.automaticRefs
                  >
                ]?.label ?? null)
              : null,
          },
    );
  }

  /** DRAFT-watermarked PDF of the current draft; never stored. */
  async preview(actor: AuthenticatedUser, id: number) {
    const contract = await this.loadForManage(actor, id);
    return this.previewContract(actor, contract);
  }

  /**
   * Preview of a contract object that may hold unsaved editor changes
   * (caller has already checked access). Never stored.
   */
  async previewContract(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
    options: { audit?: boolean } = {},
  ) {
    // PDFs may contain salary in clauses and cannot be reliably redacted after
    // rendering. Do not return one to an actor whose salary view is masked.
    if (!canSeeSalary(actor, contract.employeeId))
      throw new ForbiddenException({
        code: 'CONTRACT_PREVIEW_SALARY_ACCESS_REQUIRED',
        message:
          'Payroll salary access is required to preview this contract PDF',
      });
    const { buffer, missing, context, sections } = await this.render(
      contract,
      true,
    );
    // Live previews refresh while HR types; only explicit previews are logged.
    if (options.audit !== false)
      await this.audit(actor, contract, 'preview', {});
    return {
      content_base64: buffer.toString('base64'),
      file_name: `${contract.referenceNo}-draft.pdf`,
      missing_fields: missing,
      warnings: context.warnings,
      preview_hash: sha256Json({
        sections,
        context,
        title: contract.title,
        reference: contract.referenceNo,
        version: contract.version,
        type: contract.contractType,
        start: contract.startDate,
        end: contract.endDate,
        draft: true,
      }),
      page_count: (await PDFDocument.load(buffer)).getPageCount(),
    };
  }

  /**
   * Freezes the draft: validates, renders the base PDF, stores its SHA-256,
   * locks content and asks the company signatory to sign first.
   */
  private async prepareForSend(
    draft: EmploymentContract,
    dto: SendContractDto,
  ) {
    const companyId = draft.companyId;
    const employee = await this.dataSource
      .getRepository(Employee)
      .findOneByOrFail({ id: draft.employeeId, company_id: companyId });
    const errors: Record<string, string> = {};
    if (isLiveMode(draft.particulars)) {
      try {
        assertLiveDraftRules({
          dto: {},
          particulars: draft.particulars ?? {},
          previousSections: draft.sections ?? [],
          nextSections: draft.sections ?? [],
        });
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        const response = error.getResponse();
        if (
          typeof response === 'object' &&
          response !== null &&
          'field_errors' in response
        )
          Object.assign(
            errors,
            (response as { field_errors: Record<string, string> }).field_errors,
          );
        else errors.draft = 'Some contract values need attention';
      }
    }
    const taskError = isLiveMode(draft.particulars)
      ? taskDescriptionError(
          draft.contractType,
          draft.particulars?.task_description,
        )
      : null;
    if (taskError) errors.task_description = taskError;
    const tokenSections = draft.sections?.length
      ? draft.sections
      : (
          await this.templates.sectionsFor(
            companyId,
            draft.contractType,
            undefined,
            isLiveMode(draft.particulars) ? 'particulars' : 'classic',
          )
        ).sections;
    const invalidTokens = invalidContractTokens(tokenSections);
    if (invalidTokens.length)
      errors.sections = 'The clauses contain unknown or malformed fields';
    if (
      ![EmploymentStatusEnum.ACTIVE, EmploymentStatusEnum.ONBOARDING].includes(
        employee.employment_status,
      )
    )
      errors.employee_id =
        'Contracts can be sent only to active or onboarding employees';

    // Company signatory: explicit choice, else the configured rules.
    let signatoryId = dto.assigned_signatory_id ?? draft.assignedSignatoryId;
    if (!signatoryId) {
      const resolved = await this.settings.resolveSignatory(
        companyId,
        employee,
      );
      signatoryId = resolved?.signatory.id ?? null;
    }
    const signatory = signatoryId
      ? await this.dataSource
          .getRepository(ContractSignatory)
          .findOneBy({ id: signatoryId, companyId })
      : null;
    if (!signatory || !signatory.isActive)
      errors.assigned_signatory_id =
        'Assign an active authorized company signatory before sending';
    else if (signatory.employeeId === employee.id)
      errors.assigned_signatory_id =
        'An employee cannot sign their own contract for the company';
    if (signatory && !errors.assigned_signatory_id)
      draft.assignedSignatoryId = signatory.id;
    const { buffer, missing, layout, sections, context } = await this.render(
      draft,
      false,
    );
    // Live drafts: a value HR must decide (e.g. probation not in whole
    // months, D3) blocks sending until it is set as an override.
    for (const [token, warning] of Object.entries(context.warnings))
      if (warning && !context.overrides[token] && !missing.includes(token))
        missing.push(token);
    if (missing.length)
      errors.sections = [errors.sections, `Missing: ${missing.join(', ')}`]
        .filter(Boolean)
        .join('; ');

    return { errors, missing, signatory, buffer, layout, sections, context };
  }

  async readinessForContract(
    draft: EmploymentContract,
    dto: SendContractDto = {},
  ) {
    if (draft.status !== EmploymentContractStatus.DRAFT)
      return {
        ready: false,
        field_errors: { status: 'Only drafts can be sent' },
        missing_fields: [],
        warnings: {},
        signatory_id: null,
      };
    const result = await this.prepareForSend(draft, dto);
    const addressWarning = addressOverrideWarning(
      result.context.overrides.employee_address,
      result.context.values.company_address,
    );
    return {
      ready: Object.keys(result.errors).length === 0,
      field_errors: result.errors,
      missing_fields: result.missing,
      warnings: {
        ...result.context.warnings,
        ...(addressWarning ? { employee_address: addressWarning } : {}),
      },
      signatory_id: result.errors.assigned_signatory_id
        ? null
        : (result.signatory?.id ?? null),
    };
  }

  async send(actor: AuthenticatedUser, id: number, dto: SendContractDto) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const draft = await this.loadForManage(actor, id);
    assertTransition(draft.status, ContractAction.SEND);
    const { errors, missing, signatory, buffer, layout, sections, context } =
      await this.prepareForSend(draft, dto);
    if (Object.keys(errors).length)
      throw new UnprocessableEntityException({
        message: 'The contract cannot be sent yet',
        field_errors: errors,
        missing_fields: missing,
      });
    if (!signatory) throw new ConflictException('Signatory is unavailable');

    const hash = sha256(buffer);
    const document = await this.storePdf(draft, buffer, {
      type: 'CONTRACT_BASE',
      title: `Employment contract ${draft.referenceNo} v${draft.version}`,
      actor,
      metadata: { sha256: hash, signature_layout: layout, stampable: true },
    });

    const sent = await this.dataSource.transaction(async (manager) => {
      const current = await this.lock(manager, companyId, id);
      current.status = assertTransition(current.status, ContractAction.SEND);
      current.assignedSignatoryId = signatory.id;
      current.sections = sections; // frozen, fully resolved text
      // Freeze every value the PDF was rendered from. From now on the
      // contract (and its completion certificate) is never rebuilt from
      // current HR data.
      const snapshot = snapshotFromContext(
        context,
        readStringMap(current.particulars?.override_reasons),
        new Date(),
      );
      current.particulars = {
        ...current.particulars,
        snapshot,
        snapshot_sha256: sha256Json(snapshot),
      };
      if (isLiveMode(current.particulars))
        applyValuesToColumns(current, context.values);
      current.baseDocumentId = document.id;
      current.baseDocumentSha256 = hash;
      current.documentId = document.id;
      current.sentAt = new Date();
      const saved = await manager
        .getRepository(EmploymentContract)
        .save(current);
      await this.history.record(
        {
          companyId,
          employeeId: current.employeeId,
          eventType: EmploymentEventTypeEnum.CONTRACT_ISSUED,
          title: 'Contract sent for signature',
          effectiveDate: todayInTanzania(),
          sourceModule: 'contracts',
          sourceEntityType: 'EMPLOYMENT_CONTRACT',
          sourceEntityId: current.id,
          newValues: {
            reference_no: current.referenceNo,
            version: current.version,
            base_document_sha256: hash,
            signatory_id: signatory.id,
          },
          dedupeKey: `contract:sent:${current.id}`,
          actorCompanyUserId: actor.companyMembershipId,
        },
        manager,
      );
      return saved;
    });
    await this.audit(actor, sent, 'send', { sha256: hash });
    await this.notifySignatory(sent, signatory, actor);
    return sent;
  }

  async reassignSignatory(
    actor: AuthenticatedUser,
    id: number,
    dto: ReassignSignatoryDto,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const contract = await this.loadForManage(actor, id);
    assertTransition(contract.status, ContractAction.REASSIGN_SIGNATORY);
    const signatory = await this.dataSource
      .getRepository(ContractSignatory)
      .findOneBy({ id: dto.signatory_id, companyId });
    if (!signatory?.isActive)
      throw new BadRequestException('Select an active authorized signatory');
    if (signatory.employeeId === contract.employeeId)
      throw new BadRequestException(
        'An employee cannot sign their own contract for the company',
      );
    const before = contract.assignedSignatoryId;
    contract.assignedSignatoryId = signatory.id;
    const saved = await this.contracts.save(contract);
    await this.audit(actor, saved, 'reassign_signatory', {
      from: before,
      to: signatory.id,
    });
    if (saved.status === EmploymentContractStatus.PENDING_HR_SIGNATURE)
      await this.notifySignatory(saved, signatory, actor);
    return saved;
  }

  // ─────────────────────────── signing ───────────────────────────

  /** Starts a digital signature: TOTP if 2FA is set up, else an email code. */
  async challenge(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const contract = await this.loadAny(companyId, id);
    const party = await this.partyFor(actor, contract);
    await this.assertMethodEnabled(companyId, 'digital');
    const file = await this.currentFile(contract);
    const status = this.twoFa
      ? await this.twoFa.getTwoFactorStatus(actor.id)
      : { fullyConfigured: false };
    if (status.fullyConfigured) {
      await this.audit(actor, contract, 'sign_challenge', {
        method: 'TOTP',
        party,
      });
      return { method: 'TOTP' as const, party, document_sha256: file.sha256 };
    }
    const recipient = actor.companyMembershipId
      ? await this.notifier.recipient(actor.companyMembershipId)
      : null;
    if (!recipient?.email)
      throw new BadRequestException(
        'No email address is on file for you. Sign on paper instead, or ask HR to add your email.',
      );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ContractSigningChallenge);
      // One live challenge per contract and user.
      await repository.update(
        { contractId: contract.id, userId: actor.id, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      await repository.save(
        repository.create({
          companyId,
          contractId: contract.id,
          userId: actor.id,
          party: party as ContractSignatureParty,
          codeHash: this.hashCode(code),
          documentSha256: file.sha256,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
          attempts: 0,
        }),
      );
    });
    await this.notifier.sendEmail(recipient.email, {
      subject: `Your contract signing code (${contract.referenceNo})`,
      heading: 'Contract signing code',
      recipientName: recipient.name,
      lines: [
        `Use this code to sign employment contract ${contract.referenceNo}.`,
      ],
      code,
    });
    await this.audit(actor, contract, 'sign_challenge', {
      method: 'EMAIL_OTP',
      party,
    });
    return {
      method: 'EMAIL_OTP' as const,
      party,
      masked_email: maskEmail(recipient.email),
      document_sha256: file.sha256,
    };
  }

  async sign(actor: AuthenticatedUser, id: number, dto: SignContractDto) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const initial = await this.loadAny(companyId, id);
    const party = await this.partyFor(actor, initial);
    await this.assertMethodEnabled(companyId, 'digital');
    const file = await this.currentFile(initial);
    if (file.sha256 !== dto.document_sha256) {
      await this.audit(
        actor,
        initial,
        'sign',
        { party, reason: 'hash_mismatch' },
        false,
      );
      throw new ConflictException(
        'The contract document changed since you opened it. Reload and review it again.',
      );
    }
    const verification = await this.verifyCode(actor, initial, party, dto);

    let png: Buffer | undefined;
    if (dto.signature.kind === 'DRAWN') {
      png = Buffer.from(stripDataUrl(dto.signature.png_base64 ?? ''), 'base64');
      if (
        png.length < 100 ||
        png.length > MAX_SIGNATURE_PNG_BYTES ||
        !png.subarray(0, 4).equals(PNG_MAGIC)
      )
        throw new BadRequestException(
          'The drawn signature is not a valid image',
        );
    }
    const signer = await this.signerIdentity(actor, initial, party);
    const signedAt = new Date();
    const context = resolveAuditContext();
    const source = await this.readBuffer(file.document);
    const layout = this.layoutOf(file.document);
    const stamped = layout
      ? await this.renderer.stampSignature(source, layout, {
          party,
          kind: dto.signature.kind,
          text: dto.signature.text,
          png,
          name: signer.name,
          title: signer.title,
          signedAt,
        })
      : source; // scanned/legacy file: never draw on it; certificate records it

    const imageDocument = png
      ? await this.storeFile(initial, png, {
          type: 'CONTRACT_SIGNATURE_IMAGE',
          title: `Signature image ${initial.referenceNo}`,
          actor,
          mimeType: 'image/png',
          fileName: 'signature.png',
          metadata: { party },
        })
      : null;

    const method =
      dto.signature.kind === 'DRAWN'
        ? ContractSignatureMethod.DIGITAL_DRAWN
        : ContractSignatureMethod.DIGITAL_TYPED;

    if (party === 'COMPANY') {
      const hash = sha256(stamped);
      const result = await this.storePdf(initial, stamped, {
        type: 'CONTRACT_COMPANY_SIGNED',
        title: `Company-signed contract ${initial.referenceNo}`,
        actor,
        metadata: {
          sha256: hash,
          signature_layout: layout,
          stampable: !!layout,
        },
      });
      const saved = await this.dataSource.transaction(async (manager) => {
        const current = await this.lock(manager, companyId, id);
        if (current.status !== EmploymentContractStatus.PENDING_HR_SIGNATURE)
          throw new ConflictException(
            'This contract is no longer awaiting the company signature',
          );
        current.status = assertTransition(
          current.status,
          ContractAction.COMPANY_SIGN,
        );
        current.companySignedDocumentId = result.id;
        current.companySignedSha256 = hash;
        current.documentId = result.id;
        await manager.getRepository(ContractSignature).save(
          manager.getRepository(ContractSignature).create({
            companyId,
            contractId: current.id,
            contractVersion: current.version,
            party: ContractSignatureParty.COMPANY,
            method,
            verificationMethod: verification,
            signerUserId: actor.id,
            signerCompanyUserId: actor.companyMembershipId ?? null,
            signerEmployeeId: actor.employeeId ?? null,
            signatoryId: signer.signatoryId,
            signerName: signer.name,
            signerTitle: signer.title,
            signatureImageDocumentId: imageDocument?.id ?? null,
            signedDocumentSha256: file.sha256,
            resultDocumentId: result.id,
            resultSha256: hash,
            ip: context.ipAddress?.slice(0, 64) ?? null,
            userAgent: context.userAgent?.slice(0, 300) ?? null,
            signedAt,
          }),
        );
        await this.recordCompanySigned(manager, current, actor, signer.name);
        return manager.getRepository(EmploymentContract).save(current);
      });
      await this.audit(actor, saved, 'sign', { party, method, verification });
      await this.notifyEmployeeToSign(saved, actor);
      return saved;
    }

    // Employee: completes the contract (final file = signed + certificate).
    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        companyId,
        initial.employeeId,
      ]);
      const current = await this.lock(manager, companyId, id);
      const to = assertTransition(current.status, ContractAction.EMPLOYEE_SIGN);
      const signature = await manager.getRepository(ContractSignature).save(
        manager.getRepository(ContractSignature).create({
          companyId,
          contractId: current.id,
          contractVersion: current.version,
          party: ContractSignatureParty.EMPLOYEE,
          method,
          verificationMethod: verification,
          signerUserId: actor.id,
          signerCompanyUserId: actor.companyMembershipId ?? null,
          signerEmployeeId: current.employeeId,
          signerName: signer.name,
          signatureImageDocumentId: imageDocument?.id ?? null,
          signedDocumentSha256: file.sha256,
          ip: context.ipAddress?.slice(0, 64) ?? null,
          userAgent: context.userAgent?.slice(0, 300) ?? null,
          signedAt,
        }),
      );
      return this.complete(manager, current, to, stamped, actor, signature, {
        signedName: signer.name,
        ip: context.ipAddress ?? null,
        signedAt,
      });
    });
    await this.audit(actor, saved, 'sign', { party, method, verification });
    return saved;
  }

  /** Paper signing: upload the scanned signed copy. */
  async signedUpload(
    actor: AuthenticatedUser,
    id: number,
    dto: SignedUploadDto,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const initial = await this.loadAny(companyId, id);
    await this.assertMethodEnabled(companyId, 'paper');
    const onBehalf =
      !!dto.attest_on_behalf &&
      initial.status === EmploymentContractStatus.PENDING_HR_SIGNATURE &&
      hasPermission(actor.permissions, 'employment_contracts:manage');
    const party: Party = onBehalf
      ? 'COMPANY'
      : await this.partyFor(actor, initial);
    if (onBehalf) await this.loadForManage(actor, id);
    const file = await this.currentFile(initial);
    if (file.sha256 !== dto.document_sha256)
      throw new ConflictException(
        'This upload was printed from an older version of the contract. Download the current version and sign that.',
      );
    if (dto.file.mimeType !== 'application/pdf')
      throw new BadRequestException('Upload the signed contract as a PDF');
    const buffer = Buffer.from(stripDataUrl(dto.file.fileString), 'base64');
    const hash = sha256(buffer);
    const upload = await this.storeFile(initial, buffer, {
      type:
        party === 'COMPANY'
          ? 'CONTRACT_COMPANY_SIGNED'
          : 'CONTRACT_EMPLOYEE_UPLOAD',
      title: `${party === 'COMPANY' ? 'Company' : 'Employee'}-signed scan ${initial.referenceNo}`,
      actor,
      mimeType: 'application/pdf',
      fileName: dto.file.fileName,
      metadata: {
        sha256: hash,
        stampable: false,
        printed_from_sha256: file.sha256,
      },
    });
    const context = resolveAuditContext();
    const signer = onBehalf
      ? await this.assignedSignatoryIdentity(initial)
      : await this.signerIdentity(actor, initial, party);

    const saved = await this.dataSource.transaction(async (manager) => {
      const current = await this.lock(manager, companyId, id);
      const signatures = manager.getRepository(ContractSignature);
      if (party === 'COMPANY') {
        current.status = assertTransition(
          current.status,
          ContractAction.COMPANY_SIGN,
        );
        current.companySignedDocumentId = upload.id;
        current.companySignedSha256 = hash;
        current.documentId = upload.id;
        await signatures.save(
          signatures.create({
            companyId,
            contractId: current.id,
            contractVersion: current.version,
            party: ContractSignatureParty.COMPANY,
            method: ContractSignatureMethod.MANUAL_UPLOAD,
            verificationMethod: ContractSignatureVerification.HR_VERIFIED,
            signerUserId: onBehalf ? null : actor.id,
            signerCompanyUserId: onBehalf
              ? null
              : (actor.companyMembershipId ?? null),
            signerEmployeeId: onBehalf ? null : (actor.employeeId ?? null),
            signatoryId: signer.signatoryId,
            signerName: signer.name,
            signerTitle: signer.title,
            attestedByCompanyUserId: onBehalf
              ? (actor.companyMembershipId ?? null)
              : null,
            signedDocumentSha256: file.sha256,
            resultDocumentId: upload.id,
            resultSha256: hash,
            ip: context.ipAddress?.slice(0, 64) ?? null,
            userAgent: context.userAgent?.slice(0, 300) ?? null,
            signedAt: new Date(),
          }),
        );
        await this.recordCompanySigned(manager, current, actor, signer.name);
      } else {
        current.status = assertTransition(
          current.status,
          ContractAction.EMPLOYEE_UPLOAD,
        );
        current.pendingUploadDocumentId = upload.id;
        current.lastRejectionReason = null;
        await signatures.save(
          signatures.create({
            companyId,
            contractId: current.id,
            contractVersion: current.version,
            party: ContractSignatureParty.EMPLOYEE,
            method: ContractSignatureMethod.MANUAL_UPLOAD,
            verificationMethod: ContractSignatureVerification.PENDING,
            signerUserId: actor.id,
            signerCompanyUserId: actor.companyMembershipId ?? null,
            signerEmployeeId: current.employeeId,
            signerName: signer.name,
            signedDocumentSha256: file.sha256,
            resultDocumentId: upload.id,
            resultSha256: hash,
            ip: context.ipAddress?.slice(0, 64) ?? null,
            userAgent: context.userAgent?.slice(0, 300) ?? null,
            signedAt: new Date(),
          }),
        );
      }
      return manager.getRepository(EmploymentContract).save(current);
    });
    await this.audit(actor, saved, 'signed_upload', {
      party,
      on_behalf: onBehalf,
      sha256: hash,
    });
    if (party === 'COMPANY') await this.notifyEmployeeToSign(saved, actor);
    else
      await this.notifyHr(
        saved,
        'Signed contract uploaded for verification',
        `The employee uploaded a signed copy of ${saved.referenceNo}. Verify it against the company-signed version.`,
        `contract:verify:${saved.id}:${upload.id}`,
        actor,
      );
    return saved;
  }

  /** HR checks the employee's scanned upload. */
  async verify(actor: AuthenticatedUser, id: number, dto: VerifyUploadDto) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const contract = await this.loadForManage(actor, id);
    await this.assertCanViewDocument(actor, contract);
    if (
      contract.status !== EmploymentContractStatus.PENDING_VERIFICATION ||
      !contract.pendingUploadDocumentId
    )
      throw new ConflictException(
        'There is no signed upload waiting for verification',
      );
    const pendingRow = await this.dataSource
      .getRepository(ContractSignature)
      .findOne({
        where: {
          contractId: contract.id,
          party: ContractSignatureParty.EMPLOYEE,
          resultDocumentId: contract.pendingUploadDocumentId,
        },
        order: { id: 'DESC' },
      });
    if (!pendingRow) throw new NotFoundException('Upload record not found');
    if (pendingRow.signerUserId === actor.id)
      throw new ForbiddenException('You cannot verify your own signed upload');

    if (dto.outcome === 'REJECT') {
      const saved = await this.dataSource.transaction(async (manager) => {
        const current = await this.lock(manager, companyId, id);
        current.status = assertTransition(
          current.status,
          ContractAction.VERIFY_REJECT,
        );
        current.lastRejectionReason = dto.reason!.trim();
        current.pendingUploadDocumentId = null;
        await manager.getRepository(ContractSignature).update(pendingRow.id, {
          verificationOutcome: 'REJECTED',
          rejectionReason: dto.reason!.trim(),
          verifiedByCompanyUserId: actor.companyMembershipId ?? null,
          verifiedAt: new Date(),
        });
        return manager.getRepository(EmploymentContract).save(current);
      });
      await this.audit(actor, saved, 'verify_reject', { reason: dto.reason });
      const employee = await this.dataSource
        .getRepository(Employee)
        .findOneBy({ id: saved.employeeId });
      if (employee?.company_user_id)
        await this.notifier.notify({
          companyId,
          receiverCompanyUserId: employee.company_user_id,
          senderCompanyUserId: actor.companyMembershipId,
          contractId: saved.id,
          title: 'Signed contract upload rejected',
          message: `Your signed copy of ${saved.referenceNo} was not accepted: ${dto.reason}. Please upload it again.`,
          actionUrl: `/dashboard/me/contracts/${saved.id}`,
          dedupeKey: `contract:rejected:${pendingRow.id}`,
        });
      return saved;
    }

    const uploadDocument = await this.documentRepository.findOneByOrFail({
      id: contract.pendingUploadDocumentId,
    });
    const scan = await this.readBuffer(uploadDocument);
    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        companyId,
        contract.employeeId,
      ]);
      const current = await this.lock(manager, companyId, id);
      const to = assertTransition(current.status, ContractAction.VERIFY_ACCEPT);
      await manager.getRepository(ContractSignature).update(pendingRow.id, {
        verificationMethod: ContractSignatureVerification.HR_VERIFIED,
        verificationOutcome: 'ACCEPTED',
        verifiedByCompanyUserId: actor.companyMembershipId ?? null,
        verifiedAt: new Date(),
      });
      current.pendingUploadDocumentId = null;
      return this.complete(manager, current, to, scan, actor, pendingRow, {
        signedName: pendingRow.signerName,
        ip: pendingRow.ip,
        signedAt: pendingRow.signedAt,
        signedByUserId: pendingRow.signerUserId ?? undefined,
      });
    });
    await this.audit(actor, saved, 'verify_accept', {});
    return saved;
  }

  // ─────────────────────────── files ───────────────────────────

  async files(actor: AuthenticatedUser, id: number) {
    const contract = await this.loadReadable(actor, id);
    const rows = await this.documentRepository.find({
      where: {
        company_id: contract.companyId,
        entity_type: DocumentEntityTypeEnum.CONTRACT,
        entity_id: contract.id,
      },
      order: { created_at: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      document_type: row.document_type,
      title: row.title,
      file_name: row.original_file_name,
      mime_type: row.mime_type,
      sha256: row.metadata?.sha256 ?? null,
      created_at: row.created_at,
      current: row.id === (contract.finalDocumentId ?? contract.documentId),
    }));
  }

  /** Streams a contract file after re-checking its fingerprint. */
  async readFile(
    actor: AuthenticatedUser,
    id: number,
    documentId: number | null,
  ) {
    let contract: EmploymentContract;
    try {
      contract = await this.loadReadable(actor, id);
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        const companyId = this.access.ensureActorCompanyId(actor);
        await this.securityEvents.logBestEffort({
          eventType: SecurityEventType.ACCESS_DENIED,
          outcome: SecurityEventOutcome.DENIED,
          actor,
          companyId,
          resourceType: 'employment_contract',
          resourceId: id,
          metadata: { action: 'file_access_denied', document_id: documentId },
          context: resolveAuditContext(),
        });
      }
      throw error;
    }
    await this.assertCanViewDocument(actor, contract, documentId);
    const targetId =
      documentId ?? contract.finalDocumentId ?? contract.documentId;
    if (!targetId) throw new NotFoundException('Contract document not found');
    const document = await this.documents.findOneForEntityOrFail(
      contract.companyId,
      DocumentEntityTypeEnum.CONTRACT,
      contract.id,
      targetId,
    );
    const buffer = await this.readBuffer(document);
    const expected = document.metadata?.sha256;
    const actual = sha256(buffer);
    if (typeof expected === 'string' && expected !== actual) {
      await this.audit(
        actor,
        contract,
        'tamper_detected',
        { document_id: document.id, expected, actual },
        false,
      );
      throw new ConflictException(
        'This contract file failed its integrity check and cannot be served. HR has been alerted.',
      );
    }
    if (typeof expected !== 'string')
      await this.documentRepository.update(document.id, {
        metadata: { ...(document.metadata ?? {}), sha256: actual },
      });
    await this.securityEvents.log({
      eventType: SecurityEventType.EMPLOYEE_DOCUMENT_DOWNLOADED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId: contract.companyId,
      resourceType: 'employment_contract_document',
      resourceId: document.id,
      metadata: {
        contract_id: contract.id,
        employee_id: contract.employeeId,
        sha256: actual,
      },
      context: resolveAuditContext(),
    });
    return {
      buffer,
      mimeType: document.mime_type ?? 'application/pdf',
      fileName: document.original_file_name,
      sha256: actual,
    };
  }

  /** What the caller may do now, used by the detail screen. */
  async signingState(actor: AuthenticatedUser, contract: EmploymentContract) {
    const companyId = contract.companyId;
    const company = await this.dataSource
      .getRepository(Company)
      .findOneByOrFail({ id: companyId });
    const settings = readContractSettings(company.metadata);
    let party: Party | null = null;
    try {
      party = await this.partyFor(actor, contract);
    } catch {
      party = null;
    }
    const file = [
      EmploymentContractStatus.PENDING_HR_SIGNATURE,
      EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
      EmploymentContractStatus.ISSUED,
    ].includes(contract.status)
      ? await this.currentFile(contract).catch(() => null)
      : null;
    return {
      my_party: party,
      digital_signing_enabled: settings.digital_signing_enabled,
      paper_signing_enabled: settings.paper_signing_enabled,
      current_document_id:
        file?.document.id ?? contract.finalDocumentId ?? contract.documentId,
      current_document_sha256: file?.sha256 ?? contract.finalSha256 ?? null,
    };
  }

  // ─────────────────────────── internals ───────────────────────────

  private async render(contract: EmploymentContract, draft: boolean) {
    const context = await this.templates.buildContext(contract);
    const raw = contract.sections?.length
      ? contract.sections
      : (
          await this.templates.sectionsFor(
            contract.companyId,
            contract.contractType,
            undefined,
            isLiveMode(contract.particulars) ? 'particulars' : 'classic',
          )
        ).sections;
    // Display copy: full dates, amounts with words, consistent name casing.
    // The raw values stay in the context (snapshot and columns).
    const v = displayValues(context.values);
    const rendered = renderSections(raw, v);
    const missing = rendered.missing;
    const sections = rendered.sections.map((section) => ({
      ...section,
      heading: fixPlurals(section.heading),
      body: fixPlurals(section.body),
    }));
    const particulars: Array<[string, string]> = [
      [
        'Employee',
        `${v.employee_name ?? ''}${v.employee_number ? ` (${v.employee_number})` : ''}`,
      ],
      ['Job title', v.job_title ?? ''],
      ['Department', v.department ?? ''],
      ['Place of work', v.work_location ?? ''],
      ['Place of recruitment', v.place_of_recruitment ?? ''],
      ['Contract type', v.contract_type ?? ''],
      ['Start date', v.start_date ?? ''],
      ['End date', v.end_date || 'Not applicable'],
      [
        'Probation',
        v.probation_months
          ? fixPlurals(`${v.probation_months} month(s)`)
          : 'None',
      ],
      ['Hours of work', v.hours_of_work ?? ''],
      [
        'Remuneration',
        v.salary
          ? `${v.currency ?? ''} ${v.salary}${v.pay_frequency ? `, payable ${v.pay_frequency}` : ''}`.trim()
          : '',
      ],
    ];
    // Rows added by the redesign appear only on live contracts, so earlier
    // contracts render exactly as before.
    if (isLiveMode(contract.particulars)) {
      if (v.grade) particulars.splice(2, 0, ['Grade', v.grade]);
      particulars.push([
        'Employment basis',
        v.employment_basis === 'part-time' ? 'Part-time' : 'Full-time',
      ]);
    }
    const company = await this.dataSource
      .getRepository(Company)
      .findOneBy({ id: contract.companyId });
    const { buffer, layout } = await this.renderer.renderContract({
      logo: company ? readLogo(company.metadata) : null,
      tagline: company ? readBranding(company.metadata).tagline : null,
      // Redesigned drafts: no repeated company details or contract type.
      compact: isLiveMode(contract.particulars),
      title: contract.title,
      referenceNo: contract.referenceNo ?? `EC-DRAFT-${contract.id}`,
      version: contract.version,
      contractTypeLabel: CONTRACT_TYPE_LABELS[contract.contractType],
      startDate: contract.startDate,
      endDate: contract.endDate,
      particulars,
      sections,
      context,
      draft,
    });
    return { buffer, layout, missing, sections, context };
  }

  private async complete(
    manager: EntityManager,
    current: EmploymentContract,
    to: EmploymentContractStatus,
    signedFile: Buffer,
    actor: AuthenticatedUser,
    signature: ContractSignature,
    legacy: {
      signedName: string;
      ip: string | null;
      signedAt: Date;
      signedByUserId?: number;
    },
  ) {
    const companyId = current.companyId;
    const all = await manager.getRepository(ContractSignature).find({
      where: { contractId: current.id },
      order: { signedAt: 'ASC', id: 'ASC' },
    });
    const entries: CertificateEntry[] = all
      .filter((row) => row.verificationOutcome !== 'REJECTED')
      .map((row) => ({
        party: row.party,
        name: row.signerName,
        title: row.signerTitle,
        method: row.method,
        verification:
          row.id === signature.id &&
          row.method === ContractSignatureMethod.MANUAL_UPLOAD
            ? ContractSignatureVerification.HR_VERIFIED
            : row.verificationMethod,
        signedAt: row.signedAt,
        ip: row.ip,
        documentSha256: row.signedDocumentSha256,
      }));
    // Names come from the snapshot frozen at send (contracts sent before the
    // snapshot existed fall back to the records, as before). Signer names,
    // titles, methods and times come from the immutable signature rows.
    const context = await this.templates.buildContext(current, manager);
    const certificate = {
      referenceNo: current.referenceNo,
      version: current.version,
      title: current.title,
      companyName: context.companyName,
      employeeName: context.employeeName,
      baseSha256: current.baseDocumentSha256,
      entries,
    };
    const frozenCertificate = {
      reference_no: certificate.referenceNo,
      contract_version: certificate.version,
      title: certificate.title,
      company_name: certificate.companyName,
      employee_name: certificate.employeeName,
      employee_no: context.employeeNo,
      base_document_sha256: certificate.baseSha256,
      snapshot_sha256:
        typeof current.particulars?.snapshot_sha256 === 'string'
          ? current.particulars.snapshot_sha256
          : null,
      names_source: readSnapshot(current.particulars) ? 'snapshot' : 'records',
      signatures: entries.map((entry) => ({
        party: entry.party,
        name: entry.name,
        title: entry.title,
        method: entry.method,
        verification: entry.verification,
        signed_at: entry.signedAt.toISOString(),
        ip: entry.ip,
        document_sha256: entry.documentSha256,
      })),
      generated_at: new Date().toISOString(),
    };
    let finalBuffer: Buffer;
    try {
      finalBuffer = await this.renderer.appendCertificate(
        signedFile,
        certificate,
      );
    } catch {
      // A scan that cannot be opened stays untouched as the final file; the
      // certificate is kept beside it as its own document.
      finalBuffer = signedFile;
      const standalone = await this.renderer.renderCertificate(certificate);
      await this.storeFile(current, standalone, {
        type: 'CONTRACT_CERTIFICATE',
        title: `Signature certificate ${current.referenceNo}`,
        actor,
        mimeType: 'application/pdf',
        fileName: `${current.referenceNo}-certificate.pdf`,
        metadata: { sha256: sha256(standalone), stampable: false },
      });
    }
    const finalHash = sha256(finalBuffer);
    const finalDocument = await this.storeFile(current, finalBuffer, {
      type: 'CONTRACT_FINAL',
      title: `Signed employment contract ${current.referenceNo}`,
      actor,
      mimeType: 'application/pdf',
      fileName: `${current.referenceNo}-signed.pdf`,
      metadata: { sha256: finalHash, stampable: false },
    });
    await manager.getRepository(ContractSignature).update(signature.id, {
      resultDocumentId: finalDocument.id,
      resultSha256: finalHash,
    });
    // The certificate is stored once (inside the hashed final PDF, or as its
    // own hashed file) and its data frozen here; it is never regenerated.
    current.particulars = {
      ...current.particulars,
      certificate: { ...frozenCertificate, final_document_sha256: finalHash },
      certificate_sha256: sha256Json({
        ...frozenCertificate,
        final_document_sha256: finalHash,
      }),
    };
    current.status = to;
    current.finalDocumentId = finalDocument.id;
    current.finalSha256 = finalHash;
    current.documentId = finalDocument.id;
    current.completedAt = new Date();
    // Legacy evidence columns read by onboarding activation readiness.
    current.signedByUserId = legacy.signedByUserId ?? actor.id;
    current.signedName = legacy.signedName;
    current.signedIp = legacy.ip?.slice(0, 64) ?? null;
    current.signedAt = legacy.signedAt;
    const saved = await manager.getRepository(EmploymentContract).save(current);
    await this.supersedePrevious(manager, saved);
    await this.history.record(
      {
        companyId,
        employeeId: saved.employeeId,
        eventType: EmploymentEventTypeEnum.CONTRACT_SIGNED,
        title: 'Contract signed by both parties',
        effectiveDate: todayInTanzania(),
        sourceModule: 'contracts',
        sourceEntityType: 'EMPLOYMENT_CONTRACT',
        sourceEntityId: saved.id,
        newValues: {
          reference_no: saved.referenceNo,
          version: saved.version,
          final_sha256: finalHash,
          amendment_reason: saved.amendmentReason,
        },
        dedupeKey: `contract:signed:${saved.id}`,
        actorCompanyUserId: actor.companyMembershipId,
      },
      manager,
    );
    await this.notifyHr(
      saved,
      'Employment contract completed',
      `${context.employeeName}'s contract ${saved.referenceNo} is signed by both parties.`,
      `contract:completed:${saved.id}`,
      actor,
    );
    return saved;
  }

  private async supersedePrevious(
    manager: EntityManager,
    completed: EmploymentContract,
  ) {
    const repository = manager.getRepository(EmploymentContract);
    const older = await repository
      .createQueryBuilder('contract')
      .where(
        'contract.companyId = :companyId AND contract.employeeId = :employeeId',
        {
          companyId: completed.companyId,
          employeeId: completed.employeeId,
        },
      )
      .andWhere('contract.id <> :id AND contract.version < :version', {
        id: completed.id,
        version: completed.version,
      })
      .andWhere('contract.status = :signed', {
        signed: EmploymentContractStatus.SIGNED,
      })
      .getMany();
    for (const previous of older) {
      previous.status = assertTransition(
        previous.status,
        ContractAction.SUPERSEDE,
      );
      await repository.save(previous);
    }
    if (older.length)
      await this.history.record(
        {
          companyId: completed.companyId,
          employeeId: completed.employeeId,
          eventType: completed.amendmentReason?.startsWith('Renewal')
            ? EmploymentEventTypeEnum.CONTRACT_RENEWED
            : EmploymentEventTypeEnum.CONTRACT_AMENDED,
          title: 'Earlier contract superseded',
          effectiveDate: completed.startDate,
          sourceModule: 'contracts',
          sourceEntityType: 'EMPLOYMENT_CONTRACT',
          sourceEntityId: completed.id,
          newValues: {
            reference_no: completed.referenceNo,
            version: completed.version,
            superseded_contract_ids: older.map((row) => row.id),
            reason: completed.amendmentReason,
            source_movement_id: completed.sourceMovementId,
          },
          dedupeKey: `contract:amended:${completed.id}`,
        },
        manager,
      );
  }

  private async recordCompanySigned(
    manager: EntityManager,
    contract: EmploymentContract,
    actor: AuthenticatedUser,
    signerName: string,
  ) {
    await this.history.record(
      {
        companyId: contract.companyId,
        employeeId: contract.employeeId,
        eventType: EmploymentEventTypeEnum.OTHER,
        title: 'Contract signed by the company',
        effectiveDate: todayInTanzania(),
        sourceModule: 'contracts',
        sourceEntityType: 'EMPLOYMENT_CONTRACT',
        sourceEntityId: contract.id,
        newValues: {
          reference_no: contract.referenceNo,
          signed_by: signerName,
        },
        dedupeKey: `contract:company-signed:${contract.id}`,
        actorCompanyUserId: actor.companyMembershipId,
      },
      manager,
    );
  }

  private async verifyCode(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
    party: Party,
    dto: SignContractDto,
  ): Promise<ContractSignatureVerification> {
    const status = this.twoFa
      ? await this.twoFa.getTwoFactorStatus(actor.id)
      : { fullyConfigured: false };
    if (status.fullyConfigured) {
      const valid = await this.twoFa!.verifyPayrollAuthenticatorCode(
        actor.id,
        dto.code,
      );
      if (!valid) {
        await this.audit(
          actor,
          contract,
          'sign',
          { party, reason: 'bad_totp' },
          false,
        );
        throw new BadRequestException('The authenticator code is not valid');
      }
      return ContractSignatureVerification.TOTP;
    }
    // Email code: checked and consumed in its own transaction so failed
    // attempts are counted even though signing is refused.
    const outcome = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ContractSigningChallenge);
      const challenge = await repository
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where(
          'c.contractId = :contractId AND c.userId = :userId AND c.consumedAt IS NULL',
          {
            contractId: contract.id,
            userId: actor.id,
          },
        )
        .orderBy('c.id', 'DESC')
        .getOne();
      if (!challenge || challenge.expiresAt.getTime() < Date.now())
        return 'Request a new signing code; the previous one has expired';
      if (challenge.attempts >= OTP_MAX_ATTEMPTS)
        return 'Too many wrong codes. Request a new signing code';
      if (
        String(challenge.party) !== party ||
        challenge.documentSha256 !== dto.document_sha256
      )
        return 'This code was issued for a different version of the contract. Request a new code';
      if (challenge.codeHash !== this.hashCode(dto.code)) {
        challenge.attempts += 1;
        await repository.save(challenge);
        return challenge.attempts >= OTP_MAX_ATTEMPTS
          ? 'Too many wrong codes. Request a new signing code'
          : 'The signing code is not correct';
      }
      challenge.consumedAt = new Date();
      await repository.save(challenge);
      return null;
    });
    if (outcome) {
      await this.audit(
        actor,
        contract,
        'sign',
        { party, reason: outcome },
        false,
      );
      throw new BadRequestException(outcome);
    }
    return ContractSignatureVerification.EMAIL_OTP;
  }

  private hashCode(code: string): string {
    const pepper =
      process.env.CONTRACT_OTP_PEPPER ??
      process.env.JWT_SECRET ??
      'hrms-contract-otp';
    return createHash('sha256').update(`${pepper}:${code}`).digest('hex');
  }

  /** Which party the caller signs as, or 403. */
  private async partyFor(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
  ): Promise<Party> {
    if (
      actor.employeeId === contract.employeeId &&
      [
        EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
        EmploymentContractStatus.ISSUED,
      ].includes(contract.status)
    )
      return 'EMPLOYEE';
    if (
      contract.status === EmploymentContractStatus.PENDING_HR_SIGNATURE &&
      actor.employeeId
    ) {
      const signatory = await this.actorSignatory(actor, contract);
      if (signatory) return 'COMPANY';
      throw new ForbiddenException(
        'Only the assigned company signatory (or the configured backup) can sign for the company',
      );
    }
    throw new ForbiddenException(
      'This contract is not awaiting your signature',
    );
  }

  private async actorSignatory(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
  ) {
    if (!actor.employeeId || actor.employeeId === contract.employeeId)
      return null;
    const repository = this.dataSource.getRepository(ContractSignatory);
    const candidates = [
      contract.assignedSignatoryId,
      await this.settings.backupSignatoryId(contract.companyId),
    ].filter((value): value is number => !!value);
    for (const id of candidates) {
      const signatory = await repository.findOneBy({
        id,
        companyId: contract.companyId,
      });
      if (signatory?.isActive && signatory.employeeId === actor.employeeId)
        return signatory;
    }
    return null;
  }

  private async signerIdentity(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
    party: Party,
  ) {
    if (party === 'COMPANY') {
      const signatory = await this.actorSignatory(actor, contract);
      if (!signatory)
        throw new ForbiddenException(
          'You are not an authorized signatory for this contract',
        );
      return {
        name: signatory.displayName,
        title: signatory.jobTitle as string | null,
        signatoryId: signatory.id as number | null,
      };
    }
    const employee = await this.dataSource
      .getRepository(Employee)
      .findOneByOrFail({
        id: contract.employeeId,
        company_id: contract.companyId,
      });
    return {
      name: `${employee.first_name} ${employee.last_name}`.trim(),
      title: null,
      signatoryId: null,
    };
  }

  private async assignedSignatoryIdentity(contract: EmploymentContract) {
    const signatory = contract.assignedSignatoryId
      ? await this.dataSource.getRepository(ContractSignatory).findOneBy({
          id: contract.assignedSignatoryId,
          companyId: contract.companyId,
        })
      : null;
    if (!signatory)
      throw new BadRequestException('Assign a company signatory first');
    return {
      name: signatory.displayName,
      title: signatory.jobTitle as string | null,
      signatoryId: signatory.id as number | null,
    };
  }

  private async assertMethodEnabled(
    companyId: number,
    method: 'digital' | 'paper',
  ) {
    const company = await this.dataSource
      .getRepository(Company)
      .findOneByOrFail({ id: companyId });
    const settings = readContractSettings(company.metadata);
    if (method === 'digital' && !settings.digital_signing_enabled)
      throw new ForbiddenException(
        'Digital signing is turned off for this company. Sign on paper instead.',
      );
    if (method === 'paper' && !settings.paper_signing_enabled)
      throw new ForbiddenException(
        'Paper signing is turned off for this company. Sign digitally instead.',
      );
  }

  /** The file the next signer must sign, with its (lazily computed) hash. */
  private async currentFile(contract: EmploymentContract) {
    const awaitingCompany =
      contract.status === EmploymentContractStatus.PENDING_HR_SIGNATURE;
    const documentId = awaitingCompany
      ? (contract.baseDocumentId ?? contract.documentId)
      : (contract.companySignedDocumentId ?? contract.documentId);
    if (!documentId)
      throw new BadRequestException(
        'The contract document is not available yet',
      );
    const document = await this.documentRepository.findOneByOrFail({
      id: documentId,
    });
    const stored = awaitingCompany
      ? contract.baseDocumentSha256
      : contract.companySignedSha256;
    if (stored) return { document, sha256: stored };
    const hash = sha256(await this.readBuffer(document));
    await this.contracts.update(
      contract.id,
      awaitingCompany
        ? { baseDocumentSha256: hash }
        : { companySignedSha256: hash },
    );
    return { document, sha256: hash };
  }

  private layoutOf(document: Document): SignatureLayout | null {
    const metadata = document.metadata ?? {};
    return metadata.stampable && metadata.signature_layout
      ? (metadata.signature_layout as SignatureLayout)
      : null;
  }

  private async readBuffer(document: Document): Promise<Buffer> {
    const buffer = await this.documents.readFile(document);
    if (!buffer) throw new NotFoundException('Contract file not found');
    return buffer;
  }

  private storePdf(
    contract: EmploymentContract,
    buffer: Buffer,
    options: {
      type: string;
      title: string;
      actor: AuthenticatedUser;
      metadata: Record<string, unknown>;
    },
  ) {
    return this.storeFile(contract, buffer, {
      ...options,
      mimeType: 'application/pdf',
      fileName: `${contract.referenceNo}-${options.type.toLowerCase()}.pdf`,
    });
  }

  private async storeFile(
    contract: EmploymentContract,
    buffer: Buffer,
    options: {
      type: string;
      title: string;
      actor: AuthenticatedUser;
      mimeType: string;
      fileName: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const file: Base64FileDto = {
      fileName: options.fileName.replace(/[\\/<>:"|?*\r\n]/g, '-'),
      fileSize: buffer.length,
      mimeType: options.mimeType,
      fileString: buffer.toString('base64'),
    } as Base64FileDto;
    const uploaded = await this.documents.upload({
      companyId: contract.companyId,
      entityType: DocumentEntityTypeEnum.CONTRACT,
      entityId: contract.id,
      module: DocumentModuleEnum.CONTRACT,
      documentTypeCode: options.type,
      title: options.title,
      file,
      uploadedByCompanyUserId: options.actor.companyMembershipId ?? null,
      directorySegments: [
        'documents',
        'contracts',
        `company-${contract.companyId}`,
      ],
      fileNamePrefix: `contract-${contract.id}-${options.type.toLowerCase()}`,
    });
    await this.documentRepository.update(uploaded.id, {
      metadata: {
        ...options.metadata,
        sha256: options.metadata.sha256 ?? sha256(buffer),
      },
    });
    return { id: uploaded.id };
  }

  private async lock(manager: EntityManager, companyId: number, id: number) {
    return manager
      .getRepository(EmploymentContract)
      .createQueryBuilder('contract')
      .setLock('pessimistic_write')
      .where('contract.id = :id AND contract.companyId = :companyId', {
        id,
        companyId,
      })
      .getOneOrFail();
  }

  private async loadAny(companyId: number, id: number) {
    const contract = await this.contracts.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  private canReadAll(actor: AuthenticatedUser) {
    return (
      hasPermission(actor.permissions, 'employment_contracts:read') ||
      hasPermission(actor.permissions, 'employment_contracts:manage')
    );
  }

  async canViewDocument(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
  ): Promise<boolean> {
    if (actor.companyId !== contract.companyId) return false;
    if (actor.employeeId === contract.employeeId || canSeeSalary(actor))
      return true;
    if (!actor.companyMembershipId) return false;
    const [user, membership] = await Promise.all([
      this.dataSource
        .getRepository(User)
        .findOneBy({ id: actor.id, status: 'active' }),
      this.dataSource.getRepository(CompanyUser).findOneBy({
        id: actor.companyMembershipId,
        user_id: actor.id,
        company_id: contract.companyId,
        status: 'active',
      }),
    ]);
    if (!user || !membership) return false;
    if (
      contract.status === EmploymentContractStatus.PENDING_HR_SIGNATURE &&
      (await this.actorSignatory(actor, contract))
    )
      return true;
    const signatures = await this.dataSource
      .getRepository(ContractSignature)
      .find({
        where: {
          companyId: contract.companyId,
          contractId: contract.id,
          contractVersion: contract.version,
          party: ContractSignatureParty.COMPANY,
          signerUserId: actor.id,
          signerCompanyUserId: actor.companyMembershipId,
        },
      });
    return signatures.some(
      (signature) => signature.verificationOutcome !== 'REJECTED',
    );
  }

  async assertCanViewDocument(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
    documentId?: number | null,
  ) {
    if (await this.canViewDocument(actor, contract)) return;
    await this.securityEvents.logBestEffort({
      eventType: SecurityEventType.ACCESS_DENIED,
      outcome: SecurityEventOutcome.DENIED,
      actor,
      companyId: contract.companyId,
      resourceType: 'employment_contract',
      resourceId: contract.id,
      metadata: {
        action: 'file_access_denied',
        document_id: documentId ?? null,
      },
      context: resolveAuditContext(),
    });
    throw new ForbiddenException({
      code: 'CONTRACT_DOCUMENT_SALARY_ACCESS_REQUIRED',
      message:
        'You do not have permission to view this contract file. Ask an authorized reviewer.',
    });
  }

  /** HR in scope, the employee (non-draft), or the assigned/backup signatory. */
  private async loadReadable(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const contract = await this.loadAny(companyId, id);
    const isOwner = actor.employeeId === contract.employeeId;
    const isSignatory =
      !isOwner &&
      (await this.canViewDocument({ ...actor, permissions: [] }, contract));
    if (
      (isOwner || isSignatory) &&
      contract.status !== EmploymentContractStatus.DRAFT &&
      !(
        contract.status === EmploymentContractStatus.CANCELLED &&
        !contract.sentAt
      )
    ) {
      return contract;
    }
    if (this.canReadAll(actor)) {
      const employee = await this.dataSource
        .getRepository(Employee)
        .findOneByOrFail({ id: contract.employeeId, company_id: companyId });
      await this.access.assertCanAccessEmployee(actor, employee);
      return contract;
    }
    if (isOwner || isSignatory)
      throw new NotFoundException('Contract not found');
    throw new ForbiddenException('You cannot view this contract');
  }

  async loadReadableForDetail(actor: AuthenticatedUser, id: number) {
    return this.loadReadable(actor, id);
  }

  private async loadForManage(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!hasPermission(actor.permissions, 'employment_contracts:manage'))
      throw new ForbiddenException('You cannot manage contracts');
    const contract = await this.loadAny(companyId, id);
    const employee = await this.dataSource
      .getRepository(Employee)
      .findOneByOrFail({ id: contract.employeeId, company_id: companyId });
    await this.access.assertCanAccessEmployee(actor, employee);
    return contract;
  }

  private async notifySignatory(
    contract: EmploymentContract,
    signatory: ContractSignatory,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.dataSource
      .getRepository(Employee)
      .findOneBy({ id: signatory.employeeId });
    if (!employee?.company_user_id) return;
    await this.notifier.notify({
      companyId: contract.companyId,
      receiverCompanyUserId: employee.company_user_id,
      senderCompanyUserId: actor.companyMembershipId,
      contractId: contract.id,
      title: 'Contract awaiting your signature (company)',
      message: `Employment contract ${contract.referenceNo} is ready for you to sign on behalf of the company.`,
      actionUrl: `/dashboard/me/contracts/${contract.id}`,
      dedupeKey: `contract:company-sign:${contract.id}:${signatory.id}`,
    });
  }

  private async notifyEmployeeToSign(
    contract: EmploymentContract,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.dataSource
      .getRepository(Employee)
      .findOneBy({ id: contract.employeeId });
    if (!employee?.company_user_id) return;
    await this.notifier.notify({
      companyId: contract.companyId,
      receiverCompanyUserId: employee.company_user_id,
      senderCompanyUserId: actor.companyMembershipId,
      contractId: contract.id,
      title: 'Your employment contract is ready to sign',
      message: `Employment contract ${contract.referenceNo} has been signed by the company. Review it and sign.`,
      actionUrl: `/dashboard/me/contracts/${contract.id}`,
      dedupeKey: `contract:employee-sign:${contract.id}:${contract.companySignedDocumentId ?? contract.documentId}`,
    });
  }

  private async notifyHr(
    contract: EmploymentContract,
    title: string,
    message: string,
    dedupeKey: string,
    actor: AuthenticatedUser,
  ) {
    if (
      !contract.issuedByCompanyUserId ||
      contract.issuedByCompanyUserId === actor.companyMembershipId
    )
      return;
    await this.notifier.notify({
      companyId: contract.companyId,
      receiverCompanyUserId: contract.issuedByCompanyUserId,
      senderCompanyUserId: actor.companyMembershipId,
      contractId: contract.id,
      title,
      message,
      actionUrl: `/dashboard/employees/contracts/${contract.id}`,
      dedupeKey,
    });
  }

  private async audit(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
    action: string,
    metadata: Record<string, unknown>,
    success = true,
  ) {
    await this.securityEvents.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: success
        ? SecurityEventOutcome.SUCCESS
        : SecurityEventOutcome.FAILURE,
      actor,
      companyId: contract.companyId,
      resourceType: 'employment_contract',
      resourceId: contract.id,
      metadata: { action, reference_no: contract.referenceNo, ...metadata },
      context: resolveAuditContext(),
    });
  }
}
