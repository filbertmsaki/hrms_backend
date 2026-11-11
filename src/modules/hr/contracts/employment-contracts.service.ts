import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import { HrDocumentsService } from '../documents/hr-documents.service';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeAddress } from '../employees/entities/employee-address.entity';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../employee-movements/entities/employee-compensation-version.entity';
import { HrAccessService } from '../shared/hr-access.service';
import {
  CancelEmploymentContractDto,
  CreateEmploymentContractDto,
  ListEmploymentContractsQueryDto,
  PreviewEmploymentContractDto,
  UpdateEmploymentContractDto,
} from './dto/create-employment-contract.dto';
import {
  LIVE_MODE,
  PERSISTENT_PARTICULAR_KEYS,
  REF_KEYS,
  VERSION_BOUND_PARTICULAR_KEYS,
  ageOn,
  diffRecords,
  isLiveMode,
  readRefs,
  readStringMap,
} from './contract-live-values';
import {
  applyValuesToColumns,
  assertLiveDraftRules,
  assertSectionRules,
  carrySectionFlags,
  draftAuditView,
  pruneOverrideReasons,
} from './contract-draft-rules';
import {
  ContractSection,
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractType,
} from './entities/employment-contract.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';
import { ContractSignature } from './entities/contract-signature.entity';
import {
  allowedActions,
  assertTransition,
  ContractAction,
  deriveValidity,
  formatContractReference,
  nextStatus,
} from './contract-lifecycle';
import { ContractSigningChallenge } from './entities/contract-signing-challenge.entity';
import { Document } from '../documents/entities/document.entity';
import { ContractSettingsService } from './contract-settings.service';
import {
  CONTRACT_TOKENS,
  ContractTemplatesService,
} from './contract-templates.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractNotifierService } from './contract-notifier.service';
import { RenewContractDto } from './dto/contract-workflow.dto';
import {
  canSeeSalary,
  maskAuditValues,
  maskContractRow,
  stripSalaryChanges,
} from './salary-visibility';
import { AppNotification } from '../../notifications/entities/app-notification.entity';
import { EmploymentHistoryService } from '../employment-history/employment-history.service';
import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';

const TIME_ZONE = 'Africa/Dar_es_Salaam';

function todayInTanzania(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function trimOrNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Known fields only; empty text clears an override. */
function mergeFieldOverrides(
  previous: unknown,
  incoming: Record<string, string> | undefined,
): Record<string, string> {
  const merged: Record<string, string> = {
    ...(previous && typeof previous === 'object'
      ? (previous as Record<string, string>)
      : {}),
  };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (!(CONTRACT_TOKENS as readonly string[]).includes(key))
      throw new BadRequestException(`Unknown contract field: ${key}`);
    const text = typeof value === 'string' ? value.trim().slice(0, 2000) : '';
    if (text) merged[key] = text;
    else delete merged[key];
  }
  return merged;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type ContractPrefill = {
  employee_id: number;
  employee_name: string;
  employee_no: string | null;
  sex: string | null;
  date_of_birth: string | null;
  employee_age: number | null;
  permanent_address: string | null;
  job_title: string | null;
  department_name: string | null;
  reporting_manager_name: string | null;
  work_location: string | null;
  hire_date: string | null;
  salary_amount: string | null;
  salary_currency: string | null;
  pay_frequency: string | null;
  /** D4: true when the salary is masked for this user. */
  salary_hidden?: boolean;
};

@Injectable()
export class EmploymentContractsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmploymentContract)
    private readonly contracts: Repository<EmploymentContract>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(AppNotification)
    private readonly notifications: Repository<AppNotification>,
    @InjectRepository(ContractSignatory)
    private readonly signatories: Repository<ContractSignatory>,
    @InjectRepository(ContractSignature)
    private readonly signatures: Repository<ContractSignature>,
    private readonly access: HrAccessService,
    private readonly documents: HrDocumentsService,
    private readonly securityEvents: SecurityEventsService,
    private readonly history: EmploymentHistoryService,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly settings: ContractSettingsService,
    private readonly templates: ContractTemplatesService,
    private readonly signing: ContractSigningService,
    private readonly notifier: ContractNotifierService,
  ) {}

  // ───────────────────────────── access ─────────────────────────────

  private canReadAll(actor: AuthenticatedUser) {
    return (
      hasPermission(actor.permissions, 'employment_contracts:read') ||
      hasPermission(actor.permissions, 'employment_contracts:manage')
    );
  }

  private async assertCanReadContractEmployee(
    actor: AuthenticatedUser,
    employee: Employee,
  ): Promise<void> {
    if (!this.canReadAll(actor)) {
      if (!actor.employeeId || actor.employeeId !== employee.id) {
        throw new ForbiddenException(
          'You do not have permission to view this employee contract',
        );
      }
      return;
    }
    await this.access.assertCanAccessEmployee(actor, employee);
  }

  /** Employees never see drafts or contracts cancelled before sending. */
  private assertVisibleToOwner(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
  ) {
    if (this.canReadAll(actor) || actor.employeeId !== contract.employeeId)
      return;
    if (
      contract.status === EmploymentContractStatus.DRAFT ||
      (contract.status === EmploymentContractStatus.CANCELLED &&
        !contract.sentAt)
    ) {
      throw new NotFoundException('Contract not found');
    }
  }

  private async loadForManage(
    actor: AuthenticatedUser,
    id: number,
    manager?: EntityManager,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const repository = (manager ?? this.dataSource.manager).getRepository(
      EmploymentContract,
    );
    const contract = manager
      ? await repository
          .createQueryBuilder('contract')
          .setLock('pessimistic_write')
          .where('contract.id = :id AND contract.companyId = :companyId', {
            id,
            companyId,
          })
          .getOne()
      : await repository.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException('Contract not found');
    const employee = await (manager ?? this.dataSource.manager)
      .getRepository(Employee)
      .findOneByOrFail({ id: contract.employeeId, company_id: companyId });
    await this.access.assertCanAccessEmployee(actor, employee);
    return { companyId, contract, employee };
  }

  private async assertActiveSignatory(
    companyId: number,
    signatoryId: number,
    employeeId: number,
    manager: EntityManager,
  ) {
    const signatory = await manager
      .getRepository(ContractSignatory)
      .findOneBy({ id: signatoryId, companyId });
    if (!signatory || !signatory.isActive)
      throw new BadRequestException(
        'Select an active authorized company signatory',
      );
    if (signatory.employeeId === employeeId)
      throw new BadRequestException(
        'An employee cannot sign their own contract on behalf of the company',
      );
    return signatory;
  }

  // ───────────────────────────── prefill ─────────────────────────────

  async prefill(
    actor: AuthenticatedUser,
    employeeId: number,
  ): Promise<ContractPrefill> {
    const companyId = this.access.ensureActorCompanyId(actor);
    const employee = await this.employees.findOne({
      where: { id: employeeId, company_id: companyId },
      relations: {
        primary_position: true,
        primary_department: true,
        primary_branch: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.access.assertCanAccessEmployee(actor, employee);
    const prefill = await this.buildPrefill(
      this.dataSource.manager,
      companyId,
      employee,
    );
    return canSeeSalary(actor, employee.id)
      ? prefill
      : { ...prefill, salary_amount: null, salary_hidden: true };
  }

  private async buildPrefill(
    manager: EntityManager,
    companyId: number,
    employee: Employee,
  ): Promise<ContractPrefill> {
    const [managerEmployee, address, compensation] = await Promise.all([
      employee.reports_to
        ? manager.getRepository(Employee).findOneBy({
            id: employee.reports_to,
            company_id: companyId,
          })
        : Promise.resolve(null),
      manager.getRepository(EmployeeAddress).findOne({
        where: { employee_id: employee.id },
        order: { is_primary: 'DESC', updated_at: 'DESC' },
      }),
      manager.getRepository(EmployeeCompensationVersion).findOne({
        where: {
          companyId,
          employeeId: employee.id,
          status: EmployeeCompensationVersionStatusEnum.ACTIVE,
        },
        order: { effectiveFrom: 'DESC' },
      }),
    ]);
    const addressText = address
      ? [
          address.address_line_1,
          address.address_line_2,
          address.city,
          address.state,
          address.country,
        ]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(', ')
      : '';
    return {
      employee_id: employee.id,
      employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
      employee_no: employee.employee_no ?? null,
      sex: employee.gender ?? null,
      date_of_birth: employee.date_of_birth ?? null,
      employee_age: ageOn(employee.date_of_birth, todayInTanzania()),
      permanent_address: addressText || null,
      job_title: employee.primary_position?.name ?? null,
      department_name: employee.primary_department?.name ?? null,
      reporting_manager_name: managerEmployee
        ? `${managerEmployee.first_name} ${managerEmployee.last_name}`.trim()
        : null,
      work_location: employee.primary_branch?.name ?? null,
      hire_date: employee.hire_date ?? null,
      salary_amount: compensation?.baseSalary ?? null,
      salary_currency: compensation?.currency ?? null,
      pay_frequency: compensation?.payFrequency ?? null,
    };
  }

  // ───────────────────────────── drafts ─────────────────────────────

  private validateDates(
    contractType: EmploymentContractType,
    startDate: string,
    endDate: string | null,
  ) {
    if (contractType === EmploymentContractType.FIXED_TERM && !endDate)
      throw new BadRequestException('Fixed-term contracts require an end date');
    if (endDate && endDate < startDate)
      throw new BadRequestException('Contract end date precedes start date');
  }

  private buildParticulars(
    prefill: ContractPrefill,
    contract: EmploymentContract,
    dto: Partial<CreateEmploymentContractDto>,
    previous: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const pick = (key: string, fallback: unknown) =>
      (dto as Record<string, unknown>)[key] !== undefined
        ? typeof (dto as Record<string, unknown>)[key] === 'string'
          ? String((dto as Record<string, unknown>)[key]).trim()
          : (dto as Record<string, unknown>)[key]
        : (previous[key] ?? fallback);
    const salary =
      contract.salaryAmount && contract.salaryCurrency
        ? `${contract.salaryCurrency} ${contract.salaryAmount}${contract.payFrequency ? ` (${contract.payFrequency.toLowerCase()})` : ''}`
        : null;
    // Keys added by the redesign (live mode, references, reasons, part-time,
    // frozen snapshot/certificate) survive every save of the same contract.
    const carried = Object.fromEntries(
      PERSISTENT_PARTICULAR_KEYS.filter(
        (key) => previous[key] !== undefined,
      ).map((key) => [key, previous[key]]),
    );
    const refs = { ...readRefs(previous) } as Record<string, number>;
    for (const key of REF_KEYS) {
      const value = dto.refs?.[key];
      if (value === undefined) continue;
      if (value === null) delete refs[key];
      else refs[key] = value;
    }
    const reasons = readStringMap(previous.override_reasons);
    for (const [key, value] of Object.entries(dto.override_reasons ?? {})) {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text) reasons[key] = text;
      else delete reasons[key];
    }
    return {
      ...carried,
      ...(Object.keys(refs).length ? { refs } : { refs: undefined }),
      override_reasons: reasons,
      part_time:
        dto.part_time !== undefined
          ? dto.part_time
          : previous.part_time === true,
      employee_name: prefill.employee_name,
      employee_age: pick(
        'employee_age',
        ageOn(prefill.date_of_birth, contract.startDate),
      ),
      sex: prefill.sex,
      permanent_address: pick('permanent_address', prefill.permanent_address),
      place_of_recruitment: pick('place_of_recruitment', null),
      job_description: pick('job_description', contract.jobTitle),
      place_of_work: pick('place_of_work', contract.workLocation),
      hours_of_work: contract.hoursOfWork,
      remuneration: pick('remuneration', salary),
      remuneration_method: pick('remuneration_method', null),
      benefits: contract.benefits,
      field_overrides: mergeFieldOverrides(
        previous.field_overrides,
        dto.field_overrides,
      ),
    };
  }

  async createDraft(
    actor: AuthenticatedUser,
    dto: CreateEmploymentContractDto,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const employee = await this.employees.findOne({
      where: { id: dto.employee_id, company_id: companyId },
      relations: {
        primary_position: true,
        primary_department: true,
        primary_branch: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.access.assertCanAccessEmployee(actor, employee);
    this.validateDates(dto.contract_type, dto.start_date, dto.end_date ?? null);

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        companyId,
        employee.id,
      ]);
      const repository = manager.getRepository(EmploymentContract);
      const source = dto.from_contract_id
        ? await repository.findOneBy({
            id: dto.from_contract_id,
            companyId,
            employeeId: employee.id,
          })
        : null;
      if (dto.from_contract_id && !source)
        throw new NotFoundException('Source contract not found');
      if (dto.assigned_signatory_id)
        await this.assertActiveSignatory(
          companyId,
          dto.assigned_signatory_id,
          employee.id,
          manager,
        );

      const prefill = await this.buildPrefill(manager, companyId, employee);
      const live = dto.mode === LIVE_MODE || isLiveMode(source?.particulars);
      if (live)
        assertLiveDraftRules({
          dto: dto as unknown as Record<string, unknown>,
          particulars: {},
          previousSections: [],
          nextSections: [],
        });
      // A sent contract's clauses hold frozen, filled-in text; a live draft
      // starts again from the template so its fields stay live.
      const reuseSourceSections = !!source && !(live && source.sentAt);
      const template =
        dto.sections || reuseSourceSections
          ? null
          : await this.templates.sectionsFor(
              companyId,
              dto.contract_type,
              manager,
              live ? 'particulars' : 'classic',
            );
      const signatoryId =
        dto.assigned_signatory_id ??
        source?.assignedSignatoryId ??
        (await this.settings.resolveSignatory(companyId, employee, manager))
          ?.signatory.id ??
        null;
      const latest = await repository.findOne({
        where: { companyId, employeeId: employee.id },
        order: { version: 'DESC' },
      });
      // Previous versions are NOT superseded here; that happens only when
      // this version is fully signed.
      const draft = repository.create({
        companyId,
        employeeId: employee.id,
        version: (latest?.version ?? 0) + 1,
        title:
          trimOrNull(dto.title) ??
          source?.title ??
          template?.title ??
          'Contract of Employment',
        contractType: dto.contract_type,
        startDate: dto.start_date,
        endDate: dto.end_date ?? null,
        jobTitle:
          trimOrNull(dto.job_title) ?? source?.jobTitle ?? prefill.job_title,
        departmentName: prefill.department_name,
        reportingManagerName: prefill.reporting_manager_name,
        workLocation:
          trimOrNull(dto.work_location) ??
          trimOrNull(dto.place_of_work) ??
          source?.workLocation ??
          prefill.work_location,
        probationMonths:
          dto.probation_months ?? source?.probationMonths ?? null,
        hoursOfWork:
          trimOrNull(dto.hours_of_work) ?? source?.hoursOfWork ?? null,
        salaryAmount:
          dto.salary_amount ?? source?.salaryAmount ?? prefill.salary_amount,
        salaryCurrency:
          dto.salary_currency?.toUpperCase() ??
          source?.salaryCurrency ??
          prefill.salary_currency,
        payFrequency:
          dto.pay_frequency ?? source?.payFrequency ?? prefill.pay_frequency,
        benefits: trimOrNull(dto.benefits) ?? source?.benefits ?? null,
        sections:
          dto.sections ??
          (reuseSourceSections ? source?.sections : undefined) ??
          template?.sections ??
          [],
        templateId: source?.templateId ?? template?.templateId ?? null,
        templateVersion:
          source?.templateVersion ?? template?.templateVersion ?? null,
        assignedSignatoryId: signatoryId,
        status: EmploymentContractStatus.DRAFT,
        documentId: null,
        issuedByCompanyUserId: actor.companyMembershipId!,
      });
      // Frozen snapshot and certificate belong to the source version only.
      const inherited = Object.fromEntries(
        Object.entries(source?.particulars ?? {}).filter(
          ([key]) =>
            !(VERSION_BOUND_PARTICULAR_KEYS as readonly string[]).includes(key),
        ),
      );
      await this.assertRefsInCompany(manager, companyId, dto.refs);
      draft.particulars = this.buildParticulars(prefill, draft, dto, {
        ...inherited,
        ...(live ? { mode: LIVE_MODE } : {}),
      });
      if (live) {
        assertLiveDraftRules({
          dto: {},
          particulars: draft.particulars,
          previousSections: [],
          nextSections: draft.sections ?? [],
        });
        await this.finishLiveDraft(draft, manager);
      }
      const saved = await repository.save(draft);
      saved.referenceNo = formatContractReference(saved.createdAt, saved.id);
      await repository.update(saved.id, { referenceNo: saved.referenceNo });
      await this.auditDraft(actor, saved, 'draft_create', null, manager);
      return saved;
    });
  }

  async updateDraft(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateEmploymentContractDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const { companyId, contract, employee } = await this.loadForManage(
        actor,
        id,
        manager,
      );
      assertTransition(contract.status, ContractAction.UPDATE_DRAFT);
      if (
        new Date(dto.expected_updated_at).getTime() !==
        contract.updatedAt.getTime()
      ) {
        throw new ConflictException(
          'This draft was changed by someone else. Reload it before saving.',
        );
      }
      const before = draftAuditView(contract);
      const changes: PreviewEmploymentContractDto = canSeeSalary(actor)
        ? { ...dto }
        : stripSalaryChanges(dto);
      delete (changes as Partial<UpdateEmploymentContractDto>)
        .expected_updated_at;
      await this.applyDraftChanges(
        manager,
        companyId,
        contract,
        employee,
        changes,
      );
      const saved = await manager
        .getRepository(EmploymentContract)
        .save(contract);
      await this.auditDraft(actor, saved, 'draft_update', before, manager);
      return saved;
    });
  }

  /**
   * Renders the editor's unsaved state (live preview). Changes are applied to
   * an in-memory copy only; nothing is saved.
   */
  async previewDraft(
    actor: AuthenticatedUser,
    id: number,
    dto: PreviewEmploymentContractDto,
  ) {
    const { companyId, contract, employee } = await this.loadForManage(
      actor,
      id,
    );
    const unsaved =
      contract.status === EmploymentContractStatus.DRAFT &&
      Object.keys(dto ?? {}).length > 0;
    if (unsaved)
      await this.applyDraftChanges(
        this.dataSource.manager,
        companyId,
        contract,
        employee,
        canSeeSalary(actor) ? dto : stripSalaryChanges(dto),
      );
    return this.signing.previewContract(actor, contract, { audit: !unsaved });
  }

  /** Applies editor changes to a draft in memory (shared by save and preview). */
  /** Every chosen department, position, grade, branch and manager must belong to this company. */
  private async assertRefsInCompany(
    manager: EntityManager,
    companyId: number,
    refs: object | undefined,
  ) {
    const tables: Record<string, string> = {
      department_id: 'departments',
      position_id: 'positions',
      grade_id: 'employee_grades',
      branch_id: 'branches',
      reports_to_id: 'employees',
    };
    const errors: Record<string, string> = {};
    for (const [key, table] of Object.entries(tables)) {
      const id = (
        refs as Record<string, number | null | undefined> | undefined
      )?.[key];
      if (id === undefined || id === null) continue;
      const rows: unknown[] = await manager.query(
        `SELECT 1 FROM "${table}" WHERE "id" = $1 AND "company_id" = $2 LIMIT 1`,
        [id, companyId],
      );
      if (!rows.length)
        errors[`refs.${key}`] = 'Choose a value from this company.';
    }
    if (Object.keys(errors).length)
      throw new BadRequestException({
        message: 'Some selections do not belong to this company',
        field_errors: errors,
      });
  }

  private async applyDraftChanges(
    manager: EntityManager,
    companyId: number,
    contract: EmploymentContract,
    employee: Employee,
    dto: PreviewEmploymentContractDto,
  ) {
    const live = isLiveMode(contract.particulars);
    const previousSections = [...(contract.sections ?? [])];
    await this.assertRefsInCompany(manager, companyId, dto.refs);
    if (live)
      // Checked first so a rejected request never half-applies.
      assertLiveDraftRules({
        dto: dto as Record<string, unknown>,
        particulars: {},
        previousSections: [],
        nextSections: [],
      });
    if (dto.assigned_signatory_id)
      await this.assertActiveSignatory(
        companyId,
        dto.assigned_signatory_id,
        employee.id,
        manager,
      );

    if (dto.contract_type !== undefined)
      contract.contractType = dto.contract_type;
    if (dto.start_date !== undefined) contract.startDate = dto.start_date;
    if (dto.end_date !== undefined) contract.endDate = dto.end_date || null;
    if (dto.title !== undefined)
      contract.title = trimOrNull(dto.title) ?? 'Contract of Employment';
    if (dto.probation_months !== undefined)
      contract.probationMonths = dto.probation_months;
    if (dto.job_title !== undefined)
      contract.jobTitle = trimOrNull(dto.job_title);
    if (dto.work_location !== undefined)
      contract.workLocation = trimOrNull(dto.work_location);
    if (dto.hours_of_work !== undefined)
      contract.hoursOfWork = trimOrNull(dto.hours_of_work);
    if (dto.salary_amount !== undefined)
      contract.salaryAmount = dto.salary_amount || null;
    if (dto.salary_currency !== undefined)
      contract.salaryCurrency = dto.salary_currency?.toUpperCase() || null;
    if (dto.pay_frequency !== undefined)
      contract.payFrequency = dto.pay_frequency || null;
    if (dto.benefits !== undefined)
      contract.benefits = trimOrNull(dto.benefits);
    if (dto.sections !== undefined) {
      // Template flags come from the stored clauses, for every draft; a
      // client cannot unlock a clause by resending it.
      contract.sections = carrySectionFlags(
        previousSections,
        dto.sections as ContractSection[],
      );
      if (!live) assertSectionRules(previousSections, contract.sections);
    }
    if (dto.assigned_signatory_id !== undefined)
      contract.assignedSignatoryId = dto.assigned_signatory_id ?? null;
    this.validateDates(
      contract.contractType,
      contract.startDate,
      contract.endDate,
    );

    const full = await manager.getRepository(Employee).findOneOrFail({
      where: { id: employee.id, company_id: companyId },
      relations: {
        primary_position: true,
        primary_department: true,
        primary_branch: true,
      },
    });
    const prefill = await this.buildPrefill(manager, companyId, full);
    contract.particulars = this.buildParticulars(
      prefill,
      contract,
      dto,
      contract.particulars,
    );
    if (live) {
      assertLiveDraftRules({
        dto: {},
        particulars: contract.particulars,
        previousSections,
        nextSections: contract.sections ?? [],
      });
      await this.finishLiveDraft(contract, manager);
    }
  }

  /**
   * Live drafts: drop reasons for removed overrides and keep the flat columns
   * (read by lists, renewals and reports) equal to what the contract says.
   */
  private async finishLiveDraft(
    contract: EmploymentContract,
    manager: EntityManager,
  ) {
    contract.particulars = {
      ...contract.particulars,
      override_reasons: pruneOverrideReasons(contract.particulars),
    };
    const { values } = await this.templates.buildContext(contract, manager);
    applyValuesToColumns(contract, values);
  }

  /** Field-level audit of a draft change: who, when, old → new, reasons. */
  private async auditDraft(
    actor: AuthenticatedUser,
    contract: EmploymentContract,
    action: 'draft_create' | 'draft_update',
    before: Record<string, unknown> | null,
    manager: EntityManager,
  ) {
    const { changed, oldValues, newValues } = diffRecords(
      before ?? {},
      draftAuditView(contract),
    );
    if (!changed.length) return;
    await this.securityEvents.log(
      {
        eventType: SecurityEventType.EMPLOYEE_UPDATED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        companyId: contract.companyId,
        resourceType: 'employment_contract',
        resourceId: contract.id,
        oldValues: before ? oldValues : null,
        newValues,
        metadata: {
          action,
          reference_no: contract.referenceNo,
          version: contract.version,
          employee_id: contract.employeeId,
          mode: isLiveMode(contract.particulars) ? 'live' : 'legacy',
          changed_fields: changed,
          override_reasons: readStringMap(
            contract.particulars?.override_reasons,
          ),
        },
        context: resolveAuditContext(),
      },
      manager,
    );
  }

  async cancel(
    actor: AuthenticatedUser,
    id: number,
    dto: CancelEmploymentContractDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const { companyId, contract } = await this.loadForManage(
        actor,
        id,
        manager,
      );
      contract.status = assertTransition(
        contract.status,
        ContractAction.CANCEL,
      );
      contract.cancelledAt = new Date();
      contract.cancelledByCompanyUserId = actor.companyMembershipId ?? null;
      contract.cancelReason = dto.reason.trim();
      const saved = await manager
        .getRepository(EmploymentContract)
        .save(contract);
      if (contract.sentAt) {
        await this.history.record(
          {
            companyId,
            employeeId: contract.employeeId,
            eventType: EmploymentEventTypeEnum.CONTRACT_ENDED,
            title: 'Contract cancelled before completion',
            effectiveDate: todayInTanzania(),
            sourceModule: 'contracts',
            sourceEntityType: 'EMPLOYMENT_CONTRACT',
            sourceEntityId: contract.id,
            newValues: {
              version: contract.version,
              reference_no: contract.referenceNo,
              reason: contract.cancelReason,
            },
            dedupeKey: `contract:cancelled:${contract.id}`,
            actorCompanyUserId: actor.companyMembershipId,
          },
          manager,
        );
      }
      await this.securityEvents.log({
        eventType: SecurityEventType.EMPLOYEE_UPDATED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        companyId,
        resourceType: 'employment_contract',
        resourceId: contract.id,
        metadata: { action: 'cancel', reason: contract.cancelReason },
        context: resolveAuditContext(),
      });
      return saved;
    });
  }

  // ───────────────────────────── reads ─────────────────────────────

  private toListRow(
    contract: EmploymentContract,
    extras: {
      employeeName?: string;
      employeeNo?: string | null;
      signatoryName?: string | null;
    },
    today: string,
    actor?: AuthenticatedUser,
  ) {
    const visible =
      !actor || canSeeSalary(actor, contract.employeeId)
        ? contract
        : maskContractRow(contract);
    return {
      ...visible,
      employeeName: extras.employeeName ?? null,
      employeeNo: extras.employeeNo ?? null,
      signatoryName: extras.signatoryName ?? null,
      validity: deriveValidity(contract, today),
    };
  }

  async listAll(
    actor: AuthenticatedUser,
    query: ListEmploymentContractsQueryDto,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const accessibleEmployeeIds =
      await this.access.getAccessibleEmployeeIds(actor);
    if (accessibleEmployeeIds?.length === 0)
      return { data: [], total: 0, page, limit };

    const today = todayInTanzania();
    const qb = this.contracts
      .createQueryBuilder('contract')
      .innerJoin(
        Employee,
        'employee',
        'employee.id = contract.employeeId AND employee.company_id = contract.companyId',
      )
      .leftJoin(
        ContractSignatory,
        'signatory',
        'signatory.id = contract.assignedSignatoryId',
      )
      .addSelect([
        'employee.first_name',
        'employee.last_name',
        'employee.employee_no',
        'signatory.displayName',
      ])
      .where('contract.companyId = :companyId', { companyId });
    if (accessibleEmployeeIds)
      qb.andWhere('contract.employeeId IN (:...accessibleEmployeeIds)', {
        accessibleEmployeeIds,
      });
    if (query.status)
      qb.andWhere('contract.status = :status', { status: query.status });
    if (query.employee_id)
      qb.andWhere('contract.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    if (query.signatory_id)
      qb.andWhere('contract.assignedSignatoryId = :signatoryId', {
        signatoryId: query.signatory_id,
      });
    if (query.q?.trim()) {
      qb.andWhere(
        `(contract.referenceNo ILIKE :q ESCAPE '\\' OR employee.employee_no ILIKE :q ESCAPE '\\'
          OR (employee.first_name || ' ' || employee.last_name) ILIKE :q ESCAPE '\\')`,
        { q: `%${escapeLike(query.q.trim())}%` },
      );
    }
    if (query.validity) this.applyValidityFilter(qb, query.validity, today);

    qb.orderBy('contract.updatedAt', 'DESC')
      .addOrderBy('contract.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [{ entities, raw }, total] = await Promise.all([
      qb.getRawAndEntities(),
      qb.getCount(),
    ]);
    type ListRaw = {
      contract_id: number;
      employee_first_name: string | null;
      employee_last_name: string | null;
      employee_employee_no: string | null;
      signatory_display_name: string | null;
    };
    const rawById = new Map(
      (raw as ListRaw[]).map((row) => [Number(row.contract_id), row]),
    );
    return {
      data: entities.map((contract) => {
        const row = rawById.get(contract.id);
        return this.toListRow(
          contract,
          {
            employeeName:
              `${row?.employee_first_name ?? ''} ${row?.employee_last_name ?? ''}`.trim(),
            employeeNo: row?.employee_employee_no ?? null,
            signatoryName: row?.signatory_display_name ?? null,
          },
          today,
          actor,
        );
      }),
      total,
      page,
      limit,
    };
  }

  private applyValidityFilter(
    qb: ReturnType<Repository<EmploymentContract>['createQueryBuilder']>,
    validity: string,
    today: string,
  ) {
    const expiring = new Date(`${today}T00:00:00Z`);
    expiring.setUTCDate(expiring.getUTCDate() + 30);
    const through = expiring.toISOString().slice(0, 10);
    const signed = `contract.status = '${EmploymentContractStatus.SIGNED}'`;
    switch (validity) {
      case 'SUPERSEDED':
        qb.andWhere(
          `contract.status = '${EmploymentContractStatus.SUPERSEDED}'`,
        );
        break;
      case 'NOT_EFFECTIVE':
        qb.andWhere('contract.status NOT IN (:...effective)', {
          effective: [
            EmploymentContractStatus.SIGNED,
            EmploymentContractStatus.SUPERSEDED,
            EmploymentContractStatus.TERMINATED,
          ],
        });
        break;
      case 'TERMINATED':
        qb.andWhere(
          `contract.status = '${EmploymentContractStatus.TERMINATED}'`,
        );
        break;
      case 'NOT_STARTED':
        qb.andWhere(`${signed} AND contract.startDate > :today`, { today });
        break;
      case 'EXPIRED':
        qb.andWhere(
          `${signed} AND contract.startDate <= :today AND contract.endDate < :today`,
          { today },
        );
        break;
      case 'EXPIRING':
        qb.andWhere(
          `${signed} AND contract.startDate <= :today AND contract.endDate BETWEEN :today AND :through`,
          { today, through },
        );
        break;
      case 'ACTIVE':
        qb.andWhere(
          `${signed} AND contract.startDate <= :today AND (contract.endDate IS NULL OR contract.endDate > :through)`,
          { today, through },
        );
        break;
    }
  }

  /**
   * Activity & audit for one contract, newest first: employment-history
   * events plus security events (edits with changed fields, sends,
   * signatures, downloads). HR within scope only.
   */
  async activity(actor: AuthenticatedUser, id: number) {
    const ACTIVITY_LIMIT = 300;
    const salaryVisible = canSeeSalary(actor);
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!this.canReadAll(actor))
      throw new ForbiddenException('You cannot view contract activity');
    const contract = await this.contracts.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException('Contract not found');
    const employee = await this.employees.findOneByOrFail({
      id: contract.employeeId,
      company_id: companyId,
    });
    await this.access.assertCanAccessEmployee(actor, employee);

    type HistoryRow = {
      id: number;
      event_type: string;
      title: string;
      description: string | null;
      created_at: Date;
      actor_name: string | null;
      new_values: Record<string, unknown> | null;
    };
    type SecurityRow = {
      id: number;
      event_type: string;
      outcome: string;
      resource_type: string;
      occurred_at: Date;
      ip_address: string | null;
      actor_name: string | null;
      metadata: Record<string, unknown> | null;
      old_values: Record<string, unknown> | null;
      new_values: Record<string, unknown> | null;
    };
    const actorName = (alias: string) =>
      `(SELECT NULLIF(TRIM(u.first_name || ' ' || u.last_name), '') FROM "company_users" cu JOIN "users" u ON u.id = cu.user_id WHERE cu.id = ${alias})`;
    const [history, security] = await Promise.all([
      this.dataSource.query<HistoryRow[]>(
        `SELECT e.id, e.event_type, e.title, e.description, e.created_at, e.new_values,
                  ${actorName('e.created_by_company_user_id')} AS actor_name
             FROM "employee_employment_events" e
            WHERE e.company_id = $1 AND e.source_entity_type = 'EMPLOYMENT_CONTRACT'
              AND e.source_entity_id = $2
            ORDER BY e.created_at DESC
            LIMIT ${ACTIVITY_LIMIT}`,
        [companyId, id],
      ),
      this.dataSource.query<SecurityRow[]>(
        `SELECT s.id, s.event_type, s.outcome, s.resource_type, s.occurred_at, s.ip_address,
                  s.metadata, s.old_values, s.new_values,
                  ${actorName('s.actor_company_user_id')} AS actor_name
             FROM "security_events" s
            WHERE s.company_id = $1
              AND ((s.resource_type = 'employment_contract' AND s.resource_id = $2)
                OR (s.resource_type = 'employment_contract_document'
                    AND s.metadata->>'contract_id' = $2))
            ORDER BY s.occurred_at DESC
            LIMIT ${ACTIVITY_LIMIT}`,
        [companyId, String(id)],
      ),
    ]);
    const items = [
      ...history.map((row) => ({
        id: `h${row.id}`,
        kind: 'history' as const,
        at: new Date(row.created_at).toISOString(),
        action: row.event_type,
        title: row.title,
        detail: row.description,
        actor_name: row.actor_name,
        outcome: 'SUCCESS',
        changed_fields: [] as string[],
        old_values: null as Record<string, unknown> | null,
        new_values: row.new_values,
      })),
      ...security.map((row) => {
        const metadata = row.metadata ?? {};
        const action =
          typeof metadata.action === 'string'
            ? metadata.action
            : row.resource_type === 'employment_contract_document'
              ? 'download'
              : row.event_type.toLowerCase();
        return {
          id: `s${row.id}`,
          kind: 'security' as const,
          at: new Date(row.occurred_at).toISOString(),
          action,
          title: null as string | null,
          detail:
            typeof metadata.reason === 'string'
              ? metadata.reason
              : row.ip_address
                ? `IP ${row.ip_address}`
                : null,
          actor_name: row.actor_name,
          outcome: row.outcome,
          changed_fields: Array.isArray(metadata.changed_fields)
            ? metadata.changed_fields.map(String)
            : [],
          old_values: salaryVisible
            ? row.old_values
            : maskAuditValues(row.old_values),
          new_values: salaryVisible
            ? row.new_values
            : maskAuditValues(row.new_values),
        };
      }),
    ].sort((a, b) => b.at.localeCompare(a.at));
    // Each source returns its newest ACTIVITY_LIMIT rows; say when older ones were left out.
    const truncated =
      history.length >= ACTIVITY_LIMIT || security.length >= ACTIVITY_LIMIT;
    return { contract_id: id, items, truncated };
  }

  async detail(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    // HR in scope, the employee (once sent), or the assigned/backup signatory.
    const contract = await this.signing.loadReadableForDetail(actor, id);
    const employee = await this.employees.findOneByOrFail({
      id: contract.employeeId,
      company_id: companyId,
    });
    const [signatory, signatures, signing, files] = await Promise.all([
      contract.assignedSignatoryId
        ? this.signatories.findOneBy({
            id: contract.assignedSignatoryId,
            companyId,
          })
        : Promise.resolve(null),
      this.signatures.find({
        where: { contractId: contract.id, companyId },
        order: { signedAt: 'ASC', id: 'ASC' },
      }),
      this.signing.signingState(actor, contract),
      this.signing.files(actor, contract.id),
    ]);
    const isManager = hasPermission(
      actor.permissions,
      'employment_contracts:manage',
    );
    return {
      ...this.toListRow(
        contract,
        {
          employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
          employeeNo: employee.employee_no,
          signatoryName: signatory?.displayName ?? null,
        },
        todayInTanzania(),
        actor,
      ),
      signatory: signatory
        ? {
            id: signatory.id,
            displayName: signatory.displayName,
            jobTitle: signatory.jobTitle,
            isActive: signatory.isActive,
          }
        : null,
      signatures: signatures.map((signature) => ({
        id: signature.id,
        party: signature.party,
        method: signature.method,
        verificationMethod: signature.verificationMethod,
        signerName: signature.signerName,
        signerTitle: signature.signerTitle,
        signedAt: signature.signedAt,
        verificationOutcome: signature.verificationOutcome,
        rejectionReason: signature.rejectionReason,
      })),
      allowedActions: isManager ? allowedActions(contract.status) : [],
      signing,
      files,
      canManage: isManager,
    };
  }

  /**
   * Renewal or amendment: a new draft copied from a signed contract, linked
   * by reason (and the triggering movement). The current contract stays
   * valid until the new version is signed by both parties.
   */
  async renewOrAmend(
    actor: AuthenticatedUser,
    id: number,
    dto: RenewContractDto,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const source = await this.contracts.findOneBy({ id, companyId });
    if (!source) throw new NotFoundException('Contract not found');
    if (
      ![
        EmploymentContractStatus.SIGNED,
        EmploymentContractStatus.SUPERSEDED,
      ].includes(source.status)
    )
      throw new ConflictException(
        'Only a signed contract can be renewed or amended',
      );
    const startDate =
      dto.start_date ??
      (dto.kind === 'RENEWAL' && source.endDate
        ? new Date(Date.parse(`${source.endDate}T00:00:00Z`) + 86_400_000)
            .toISOString()
            .slice(0, 10)
        : todayInTanzania());
    if (dto.source_movement_id) {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        `SELECT id FROM "employee_movements" WHERE id = $1 AND company_id = $2 AND employee_id = $3`,
        [dto.source_movement_id, companyId, source.employeeId],
      );
      if (!rows.length)
        throw new BadRequestException(
          'The movement does not belong to this employee',
        );
    }
    const draft = await this.createDraft(actor, {
      employee_id: source.employeeId,
      contract_type: dto.contract_type ?? source.contractType,
      start_date: startDate,
      end_date: dto.end_date,
      from_contract_id: source.id,
    } as CreateEmploymentContractDto);
    const reason = `${dto.kind === 'RENEWAL' ? 'Renewal' : 'Amendment'}: ${dto.reason.trim()}`;
    await this.contracts.update(draft.id, {
      amendmentReason: reason.slice(0, 300),
      sourceMovementId: dto.source_movement_id ?? null,
    });
    await this.history.record({
      companyId,
      employeeId: source.employeeId,
      eventType:
        dto.kind === 'RENEWAL'
          ? EmploymentEventTypeEnum.CONTRACT_RENEWED
          : EmploymentEventTypeEnum.CONTRACT_AMENDED,
      title:
        dto.kind === 'RENEWAL'
          ? 'Contract renewal prepared'
          : 'Contract amendment prepared',
      effectiveDate: startDate,
      sourceModule: 'contracts',
      sourceEntityType: 'EMPLOYMENT_CONTRACT',
      sourceEntityId: draft.id,
      oldValues: { contract_id: source.id, reference_no: source.referenceNo },
      newValues: {
        contract_id: draft.id,
        reference_no: draft.referenceNo,
        reason,
        source_movement_id: dto.source_movement_id ?? null,
      },
      dedupeKey: `contract:prepared:${draft.id}`,
      actorCompanyUserId: actor.companyMembershipId,
    });
    return this.contracts.findOneByOrFail({ id: draft.id });
  }

  private async notifySignatoryOf(
    contract: EmploymentContract,
    actor: AuthenticatedUser,
  ) {
    if (!contract.assignedSignatoryId) return;
    const signatory = await this.signatories.findOneBy({
      id: contract.assignedSignatoryId,
      companyId: contract.companyId,
    });
    if (!signatory?.isActive) return;
    const employee = await this.employees.findOneBy({
      id: signatory.employeeId,
    });
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

  /** Contracts for one employee (HR scope or the employee themself). */
  async list(actor: AuthenticatedUser, employeeId: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const employee = await this.employees.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.assertCanReadContractEmployee(actor, employee);
    const rows = await this.contracts.find({
      where: { companyId, employeeId },
      order: { version: 'DESC' },
    });
    const isOwnerOnly =
      !this.canReadAll(actor) && actor.employeeId === employee.id;
    const visible = isOwnerOnly
      ? rows.filter((row) => this.isOwnerVisible(row))
      : rows;
    return canSeeSalary(actor, employee.id)
      ? visible
      : visible.map((row) => maskContractRow(row));
  }

  async listMine(actor: AuthenticatedUser) {
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!actor.employeeId) return [];
    const rows = await this.contracts.find({
      where: { companyId, employeeId: actor.employeeId },
      order: { version: 'DESC' },
    });
    const today = todayInTanzania();
    return rows
      .filter((row) => this.isOwnerVisible(row))
      .map((row) => ({ ...row, validity: deriveValidity(row, today) }));
  }

  private isOwnerVisible(contract: EmploymentContract) {
    return !(
      contract.status === EmploymentContractStatus.DRAFT ||
      (contract.status === EmploymentContractStatus.CANCELLED &&
        !contract.sentAt)
    );
  }

  async summary(actor: AuthenticatedUser) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const accessibleEmployeeIds =
      await this.access.getAccessibleEmployeeIds(actor);
    if (accessibleEmployeeIds?.length === 0) return [];

    const query = this.contracts
      .createQueryBuilder('contract')
      .select('contract.employeeId', 'employeeId')
      .addSelect('COUNT(contract.id)', 'contractCount')
      .where('contract.companyId = :companyId', { companyId })
      .andWhere('contract.status <> :cancelled', {
        cancelled: EmploymentContractStatus.CANCELLED,
      })
      .groupBy('contract.employeeId');
    if (accessibleEmployeeIds) {
      query.andWhere('contract.employeeId IN (:...accessibleEmployeeIds)', {
        accessibleEmployeeIds,
      });
    }
    const rows = await query.getRawMany<{
      employeeId: string;
      contractCount: string;
    }>();

    return rows.map((row) => ({
      employeeId: Number(row.employeeId),
      contractCount: Number(row.contractCount),
    }));
  }

  // ─────────────── legacy attach + typed sign (until phases 3–6) ───────────────

  /**
   * Pre-workflow path: HR uploads a prepared PDF. Treated as a company-signed
   * manual upload, moving the contract to PENDING_EMPLOYEE_SIGNATURE.
   */
  async attachDocument(
    actor: AuthenticatedUser,
    id: number,
    file: Base64FileDto,
  ) {
    const { contract, employee } = await this.loadForManage(actor, id);
    // Once sent, the file is locked: a different PDF means a new version.
    const replacing = nextStatus(contract.status, ContractAction.LEGACY_ATTACH)
      ? false
      : !!assertTransition(contract.status, ContractAction.REPLACE_DOCUMENT);
    const sha256 = createHash('sha256')
      .update(
        Buffer.from(
          file.fileString.replace(/^data:[^;]+;base64,/, ''),
          'base64',
        ),
      )
      .digest('hex');
    const document = await this.documents.upload({
      companyId: contract.companyId,
      entityType: DocumentEntityTypeEnum.CONTRACT,
      entityId: contract.id,
      module: DocumentModuleEnum.CONTRACT,
      documentTypeCode: 'EMPLOYMENT_CONTRACT',
      title: `Employment contract ${contract.referenceNo} v${contract.version}`,
      file,
      uploadedByCompanyUserId: actor.companyMembershipId ?? null,
      directorySegments: [
        'documents',
        'contracts',
        `company-${contract.companyId}`,
      ],
      fileNamePrefix: `contract-${contract.id}`,
    });
    await this.documentRepository.update(document.id, {
      metadata: { sha256, stampable: false, uploaded_base: true },
    });
    // The company signs first: an attached PDF needs a company signatory.
    let signatoryId = contract.assignedSignatoryId;
    if (!signatoryId) {
      const resolved = await this.settings.resolveSignatory(
        contract.companyId,
        employee,
      );
      signatoryId = resolved?.signatory.id ?? null;
    }
    if (!signatoryId)
      throw new UnprocessableEntityException({
        message:
          'Add an authorized company signatory (Contracts → Signatories) before sending this contract',
        field_errors: {
          assigned_signatory_id: 'No active company signatory is available',
        },
      });
    const previousStatus = contract.status;
    const target = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmploymentContract);
      if (replacing)
        await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
          contract.companyId,
          contract.employeeId,
        ]);
      const current = await repository
        .createQueryBuilder('contract')
        .setLock('pessimistic_write')
        .where('contract.id = :id', { id: contract.id })
        .getOneOrFail();
      if (!replacing) {
        // Re-check under lock: the contract may have been sent meanwhile.
        current.status = assertTransition(
          current.status,
          ContractAction.LEGACY_ATTACH,
        );
        current.documentId = document.id;
        current.baseDocumentId = document.id;
        current.baseDocumentSha256 = sha256;
        current.assignedSignatoryId =
          current.assignedSignatoryId ?? signatoryId;
        current.sentAt = current.sentAt ?? new Date();
        return repository.save(current);
      }
      return this.replaceSentDocument(
        manager,
        actor,
        current,
        document.id,
        sha256,
        signatoryId,
      );
    });
    await this.notifySignatoryOf(target, actor);
    // The employee hears only once the company has signed, except that a
    // version they were about to sign has been withdrawn.
    if (
      replacing &&
      previousStatus !== EmploymentContractStatus.PENDING_HR_SIGNATURE &&
      employee.company_user_id
    ) {
      await this.notifications.save(
        this.notifications.create({
          company_id: contract.companyId,
          sender_company_user_id: actor.companyMembershipId ?? null,
          receiver_company_user_id: employee.company_user_id,
          title: 'Your employment contract was updated',
          message: `Employment contract ${contract.referenceNo} was replaced by ${target.referenceNo}. The earlier version can no longer be signed; you will be asked to review and sign the new one after the company signs it.`,
          related_module: 'contracts',
          entity_type: 'EMPLOYMENT_CONTRACT',
          entity_id: String(target.id),
          action_url: '/dashboard/me/contracts',
          dedupe_key: `contract:signature-required:${target.id}:${document.id}`,
          metadata: {
            contract_id: target.id,
            replaced_contract_id: replacing ? contract.id : null,
            document_id: document.id,
            employee_id: contract.employeeId,
          },
        }),
      );
    }
    return {
      ...document,
      contract_id: target.id,
      replaced_contract_id: replacing ? contract.id : null,
    };
  }

  /**
   * A sent contract's file is locked. Replacing it cancels this version
   * (and any pending signing challenge) and issues the file as a new version
   * that the employee must review and sign again.
   */
  private async replaceSentDocument(
    manager: EntityManager,
    actor: AuthenticatedUser,
    current: EmploymentContract,
    documentId: number,
    sha256: string,
    signatoryId: number,
  ) {
    const repository = manager.getRepository(EmploymentContract);
    current.status = assertTransition(
      current.status,
      ContractAction.REPLACE_DOCUMENT,
    );
    const latest = await repository.findOne({
      where: { companyId: current.companyId, employeeId: current.employeeId },
      order: { version: 'DESC' },
    });
    const now = new Date();
    const nextVersion = (latest?.version ?? current.version) + 1;
    current.cancelledAt = now;
    current.cancelledByCompanyUserId = actor.companyMembershipId ?? null;
    current.cancelReason = `Contract document replaced; reissued as version ${nextVersion}`;
    await repository.save(current);
    await manager
      .getRepository(ContractSigningChallenge)
      .createQueryBuilder()
      .update()
      .set({ consumedAt: now })
      .where('contract_id = :id AND consumed_at IS NULL', { id: current.id })
      .execute();

    const replacement = await repository.save(
      repository.create({
        companyId: current.companyId,
        employeeId: current.employeeId,
        version: nextVersion,
        title: current.title,
        contractType: current.contractType,
        startDate: current.startDate,
        endDate: current.endDate,
        particulars: current.particulars,
        jobTitle: current.jobTitle,
        departmentName: current.departmentName,
        workLocation: current.workLocation,
        reportingManagerName: current.reportingManagerName,
        probationMonths: current.probationMonths,
        hoursOfWork: current.hoursOfWork,
        salaryAmount: current.salaryAmount,
        salaryCurrency: current.salaryCurrency,
        payFrequency: current.payFrequency,
        benefits: current.benefits,
        templateId: current.templateId,
        templateVersion: current.templateVersion,
        sections: current.sections,
        assignedSignatoryId: current.assignedSignatoryId ?? signatoryId,
        status: EmploymentContractStatus.PENDING_HR_SIGNATURE,
        documentId,
        baseDocumentId: documentId,
        baseDocumentSha256: sha256,
        sentAt: now,
        issuedByCompanyUserId:
          actor.companyMembershipId ?? current.issuedByCompanyUserId,
      }),
    );
    replacement.referenceNo = formatContractReference(
      replacement.createdAt,
      replacement.id,
    );
    await repository.update(replacement.id, {
      referenceNo: replacement.referenceNo,
    });
    // The uploaded file belongs to the new version.
    await manager
      .getRepository(Document)
      .update({ id: documentId }, { entity_id: replacement.id });

    await this.history.record(
      {
        companyId: current.companyId,
        employeeId: current.employeeId,
        eventType: EmploymentEventTypeEnum.CONTRACT_AMENDED,
        title: 'Contract document replaced; signature required again',
        effectiveDate: todayInTanzania(),
        sourceModule: 'contracts',
        sourceEntityType: 'EMPLOYMENT_CONTRACT',
        sourceEntityId: replacement.id,
        oldValues: {
          contract_id: current.id,
          reference_no: current.referenceNo,
          version: current.version,
          document_id: current.documentId,
          document_sha256: current.companySignedSha256,
        },
        newValues: {
          contract_id: replacement.id,
          reference_no: replacement.referenceNo,
          version: replacement.version,
          document_id: documentId,
          document_sha256: sha256,
          cancelled_contract_status: current.status,
        },
        dedupeKey: `contract:replaced:${current.id}`,
        actorCompanyUserId: actor.companyMembershipId,
      },
      manager,
    );
    await this.securityEvents.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId: current.companyId,
      resourceType: 'employment_contract',
      resourceId: replacement.id,
      metadata: {
        action: 'replace_document',
        cancelled_contract_id: current.id,
        document_id: documentId,
        document_sha256: sha256,
      },
      context: resolveAuditContext(),
    });
    return replacement;
  }

  async listDocuments(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const contract = await this.contracts.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException('Contract not found');
    const employee = await this.employees.findOneByOrFail({
      id: contract.employeeId,
      company_id: companyId,
    });
    await this.assertCanReadContractEmployee(actor, employee);
    this.assertVisibleToOwner(actor, contract);
    return this.documents.findForEntity(
      companyId,
      DocumentEntityTypeEnum.CONTRACT,
      contract.id,
    );
  }

  // ───────────────────────────── files ─────────────────────────────

  private async logDownload(
    actor: AuthenticatedUser,
    companyId: number,
    contract: EmploymentContract,
    documentId: number,
  ) {
    await this.securityEvents.log({
      eventType: SecurityEventType.EMPLOYEE_DOCUMENT_DOWNLOADED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      resourceType: 'employment_contract_document',
      resourceId: documentId,
      metadata: { contract_id: contract.id, employee_id: contract.employeeId },
      context: resolveAuditContext(),
    });
  }

  private async loadReadable(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const contract = await this.contracts.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException('Contract not found');
    if (actor.employeeId !== contract.employeeId) {
      const employee = await this.employees.findOneByOrFail({
        id: contract.employeeId,
        company_id: companyId,
      });
      await this.assertCanReadContractEmployee(actor, employee);
    }
    this.assertVisibleToOwner(actor, contract);
    return { companyId, contract };
  }

  async readDocument(actor: AuthenticatedUser, id: number) {
    const { companyId, contract } = await this.loadReadable(actor, id);
    const documentId = contract.finalDocumentId ?? contract.documentId;
    if (!documentId) throw new NotFoundException('Contract document not found');
    return this.readContractFile(actor, companyId, contract, documentId);
  }

  async readDocumentVersion(
    actor: AuthenticatedUser,
    id: number,
    documentId: number,
  ) {
    const { companyId, contract } = await this.loadReadable(actor, id);
    return this.readContractFile(actor, companyId, contract, documentId);
  }

  private async readContractFile(
    actor: AuthenticatedUser,
    companyId: number,
    contract: EmploymentContract,
    documentId: number,
  ) {
    const document = await this.documents.findOneForEntityOrFail(
      companyId,
      DocumentEntityTypeEnum.CONTRACT,
      contract.id,
      documentId,
    );
    const buffer = await this.documents.readFile(document);
    if (!buffer) throw new NotFoundException('Contract file not found');
    await this.logDownload(actor, companyId, contract, document.id);
    return {
      buffer,
      mimeType: document.mime_type,
      fileName: document.original_file_name,
    };
  }
}
