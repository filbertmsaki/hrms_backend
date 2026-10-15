import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { DataSource, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../../common/utils/permission.util';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../../notifications/enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { NotificationsService } from '../../../notifications/notifications.service';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceInstallment,
  EmployeeFinancePayrollInstruction,
} from '../entities/employee-finance-account.entities';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceSanctionLetter,
} from '../entities/employee-finance-application.entities';
import {
  EmployeeFinanceAdjustment,
  EmployeeFinanceApprovalDelegation,
  EmployeeFinanceLetterTemplate,
} from '../entities/employee-finance-servicing.entities';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceAdjustmentTypeEnum,
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceLetterTemplateTypeEnum,
  EmployeeFinancePayrollInstructionStatusEnum,
  EmployeeFinanceProductTypeEnum,
  EmployeeFinanceRequestStatusEnum,
} from '../employee-finance.enums';
import {
  actorMembershipId,
  addDaysString,
  recordValue,
  textValue,
  todayString,
} from '../employee-finance.utils';
import { EmployeeFinanceMoney } from './employee-finance-money.util';

// ---------------------------------------------------------------------------
// Approval routing
// ---------------------------------------------------------------------------

/** Approval stages in the only order they may run. */
export const EMPLOYEE_FINANCE_APPROVAL_STAGE_ORDER = [
  EmployeeFinanceApprovalStageEnum.MANAGER,
  EmployeeFinanceApprovalStageEnum.HR,
  EmployeeFinanceApprovalStageEnum.FINANCE,
  EmployeeFinanceApprovalStageEnum.MANAGEMENT,
] as const;

export type EmployeeFinanceRoutableStage =
  (typeof EMPLOYEE_FINANCE_APPROVAL_STAGE_ORDER)[number];

export const EMPLOYEE_FINANCE_STAGE_STATUS: Record<
  EmployeeFinanceRoutableStage,
  EmployeeFinanceApplicationStatusEnum
> = {
  [EmployeeFinanceApprovalStageEnum.MANAGER]:
    EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
  [EmployeeFinanceApprovalStageEnum.HR]:
    EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
  [EmployeeFinanceApprovalStageEnum.FINANCE]:
    EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
  [EmployeeFinanceApprovalStageEnum.MANAGEMENT]:
    EmployeeFinanceApplicationStatusEnum.PENDING_MANAGEMENT_APPROVAL,
};

export const EMPLOYEE_FINANCE_STAGE_PERMISSION: Record<
  EmployeeFinanceRoutableStage,
  string
> = {
  [EmployeeFinanceApprovalStageEnum.MANAGER]:
    'employee_finance:applications:manager-review',
  [EmployeeFinanceApprovalStageEnum.HR]:
    'employee_finance:applications:hr-approve',
  [EmployeeFinanceApprovalStageEnum.FINANCE]:
    'employee_finance:applications:finance-approve',
  [EmployeeFinanceApprovalStageEnum.MANAGEMENT]:
    'employee_finance:applications:management-approve',
};

export function isRoutableStage(
  value: unknown,
): value is EmployeeFinanceRoutableStage {
  return (EMPLOYEE_FINANCE_APPROVAL_STAGE_ORDER as readonly unknown[]).includes(
    value,
  );
}

export function stageForStatus(
  status: EmployeeFinanceApplicationStatusEnum,
): EmployeeFinanceRoutableStage | null {
  for (const stage of EMPLOYEE_FINANCE_APPROVAL_STAGE_ORDER) {
    if (EMPLOYEE_FINANCE_STAGE_STATUS[stage] === status) return stage;
  }
  return null;
}

export type EmployeeFinanceApprovalTier = {
  minimum_amount: string;
  maximum_amount?: string | null;
  stages: EmployeeFinanceRoutableStage[];
};

function sortStages(stages: EmployeeFinanceRoutableStage[]) {
  return EMPLOYEE_FINANCE_APPROVAL_STAGE_ORDER.filter((stage) =>
    stages.includes(stage),
  );
}

/**
 * Validates and normalises `approval_configuration.approval_tiers`. Tiers
 * must use known stages, have no overlapping amount ranges, and keep stages
 * in the fixed approval order.
 */
export function normalizeApprovalTiers(
  value: unknown,
): EmployeeFinanceApprovalTier[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('approval_tiers must be a list.');
  }
  const tiers = value.map((raw, index) => {
    const tier = recordValue(raw);
    const stagesRaw = Array.isArray(tier.stages) ? tier.stages : [];
    const stages = stagesRaw.map((stage) => String(stage).trim().toUpperCase());
    if (!stages.length || stages.some((stage) => !isRoutableStage(stage))) {
      throw new BadRequestException(
        `Approval tier ${index + 1} must list stages from: ${EMPLOYEE_FINANCE_APPROVAL_STAGE_ORDER.join(', ')}.`,
      );
    }
    if (new Set(stages).size !== stages.length) {
      throw new BadRequestException(
        `Approval tier ${index + 1} repeats a stage.`,
      );
    }
    const minimum = textValue(tier.minimum_amount, '0').trim() || '0';
    const maximumRaw = tier.maximum_amount;
    const maximum =
      maximumRaw === undefined || maximumRaw === null || maximumRaw === ''
        ? null
        : textValue(maximumRaw).trim();
    const minimumCents = EmployeeFinanceMoney.toCents(minimum);
    if (minimumCents < 0n) {
      throw new BadRequestException(
        `Approval tier ${index + 1} minimum amount cannot be negative.`,
      );
    }
    if (
      maximum !== null &&
      EmployeeFinanceMoney.toCents(maximum) < minimumCents
    ) {
      throw new BadRequestException(
        `Approval tier ${index + 1} maximum amount is below its minimum.`,
      );
    }
    return {
      minimum_amount: EmployeeFinanceMoney.fromCents(minimumCents),
      maximum_amount:
        maximum === null
          ? null
          : EmployeeFinanceMoney.fromCents(
              EmployeeFinanceMoney.toCents(maximum),
            ),
      stages: sortStages(stages as EmployeeFinanceRoutableStage[]),
    };
  });
  const sorted = [...tiers].sort((a, b) =>
    EmployeeFinanceMoney.toCents(a.minimum_amount) <
    EmployeeFinanceMoney.toCents(b.minimum_amount)
      ? -1
      : 1,
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    if (
      previous.maximum_amount === null ||
      EmployeeFinanceMoney.toCents(previous.maximum_amount) >=
        EmployeeFinanceMoney.toCents(sorted[i].minimum_amount)
    ) {
      throw new BadRequestException(
        'Approval tiers must not overlap; each tier needs a maximum below the next tier minimum.',
      );
    }
  }
  return sorted;
}

/**
 * Resolves the ordered approval stages for an application. A matching
 * amount tier on the product wins; otherwise the environment defaults apply.
 * Finance is always the default final stage so money is never released
 * without Finance unless a tier explicitly says otherwise.
 */
export function resolveApprovalRoute(
  productSnapshot: Record<string, unknown>,
  amount: string,
  defaults: { manager: boolean; hr: boolean; finance: boolean },
): EmployeeFinanceRoutableStage[] {
  const approval = recordValue(
    productSnapshot.approvalConfiguration ??
      productSnapshot.approval_configuration,
  );
  let tiers: EmployeeFinanceApprovalTier[] = [];
  try {
    tiers = normalizeApprovalTiers(approval.approval_tiers);
  } catch {
    tiers = [];
  }
  const amountCents = EmployeeFinanceMoney.toCents(amount);
  const tier = tiers.find(
    (item) =>
      amountCents >= EmployeeFinanceMoney.toCents(item.minimum_amount) &&
      (item.maximum_amount === null ||
        item.maximum_amount === undefined ||
        amountCents <= EmployeeFinanceMoney.toCents(item.maximum_amount)),
  );
  if (tier) return [...tier.stages];
  const stages: EmployeeFinanceRoutableStage[] = [];
  if (defaults.manager) stages.push(EmployeeFinanceApprovalStageEnum.MANAGER);
  if (defaults.hr) stages.push(EmployeeFinanceApprovalStageEnum.HR);
  if (defaults.finance || !stages.length)
    stages.push(EmployeeFinanceApprovalStageEnum.FINANCE);
  return stages;
}

export function approvalTimingPolicy(
  productSnapshot: Record<string, unknown>,
  configService: ConfigService,
) {
  const approval = recordValue(
    productSnapshot.approvalConfiguration ??
      productSnapshot.approval_configuration,
  );
  const reminderHours = Number(
    approval.reminder_hours ??
      configService.get<number>('EMPLOYEE_FINANCE_APPROVAL_REMINDER_HOURS', 24),
  );
  const escalationHours = Number(
    approval.escalation_hours ??
      configService.get<number>(
        'EMPLOYEE_FINANCE_APPROVAL_ESCALATION_HOURS',
        48,
      ),
  );
  return {
    reminderHours:
      Number.isFinite(reminderHours) && reminderHours > 0 ? reminderHours : 24,
    escalationHours:
      Number.isFinite(escalationHours) && escalationHours > 0
        ? escalationHours
        : 48,
  };
}

// ---------------------------------------------------------------------------
// Permission directory
// ---------------------------------------------------------------------------

@Injectable()
export class EmployeeFinancePermissionDirectoryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Active memberships holding the permission directly or through a role. */
  async membershipIdsWithPermission(
    companyId: number,
    permissionName: string,
  ): Promise<number[]> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `
        SELECT DISTINCT membership."id"
        FROM "company_users" membership
        WHERE membership."company_id" = $1
          AND membership."status" = 'active'
          AND (
            EXISTS (
              SELECT 1 FROM "company_user_permissions" direct_grant
              JOIN "permissions" permission ON permission."id" = direct_grant."permission_id"
              WHERE direct_grant."company_user_id" = membership."id"
                AND permission."name" = $2
            )
            OR EXISTS (
              SELECT 1 FROM "company_user_roles" assignment
              JOIN "permission_role" role_grant ON role_grant."rolesId" = assignment."role_id"
              JOIN "permissions" permission ON permission."id" = role_grant."permissionsId"
              WHERE assignment."company_user_id" = membership."id"
                AND permission."name" = $2
            )
          )
      `,
      [companyId, permissionName],
    );
    return rows.map((row) => Number(row.id));
  }

  async permissionNamesFor(
    companyId: number,
    membershipId: number,
  ): Promise<string[]> {
    const rows: Array<{ name: string }> = await this.dataSource.query(
      `
        SELECT permission."name"
        FROM "company_users" membership
        JOIN "company_user_permissions" direct_grant ON direct_grant."company_user_id" = membership."id"
        JOIN "permissions" permission ON permission."id" = direct_grant."permission_id"
        WHERE membership."id" = $2 AND membership."company_id" = $1 AND membership."status" = 'active'
        UNION
        SELECT permission."name"
        FROM "company_users" membership
        JOIN "company_user_roles" assignment ON assignment."company_user_id" = membership."id"
        JOIN "permission_role" role_grant ON role_grant."rolesId" = assignment."role_id"
        JOIN "permissions" permission ON permission."id" = role_grant."permissionsId"
        WHERE membership."id" = $2 AND membership."company_id" = $1 AND membership."status" = 'active'
      `,
      [companyId, membershipId],
    );
    return rows.map((row) => row.name);
  }

  async membershipSummary(companyId: number, membershipId: number) {
    const rows: Array<{
      id: number;
      user_id: number;
      email: string | null;
      employee_id: number | null;
    }> = await this.dataSource.query(
      `
        SELECT membership."id", membership."user_id", account."email", employee."id" AS employee_id
        FROM "company_users" membership
        LEFT JOIN "users" account ON account."id" = membership."user_id"
        LEFT JOIN "employees" employee ON employee."company_user_id" = membership."id"
        WHERE membership."id" = $2 AND membership."company_id" = $1 AND membership."status" = 'active'
      `,
      [companyId, membershipId],
    );
    return rows[0] ?? null;
  }

  /**
   * Builds the authority of an absent approver so a delegate's decision is
   * checked against the delegator's permissions and data scope, not the
   * delegate's own.
   */
  async actorForMembership(
    companyId: number,
    membershipId: number,
  ): Promise<AuthenticatedUser | null> {
    const summary = await this.membershipSummary(companyId, membershipId);
    if (!summary) return null;
    const permissions = await this.permissionNamesFor(companyId, membershipId);
    return {
      id: Number(summary.user_id),
      email: summary.email ?? '',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId,
      companyMembershipId: Number(summary.id),
      employeeId:
        summary.employee_id === null ? undefined : Number(summary.employee_id),
      roles: [],
      permissions,
    };
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type EmployeeFinanceNotice = {
  title: string;
  message: string;
  entityType: string;
  entityId: number | string;
  actionUrl?: string | null;
  priority?: NotificationPriorityEnum;
  dedupeKey?: string | null;
};

@Injectable()
export class EmployeeFinanceNotifierService {
  private readonly logger = new Logger(EmployeeFinanceNotifierService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly directory: EmployeeFinancePermissionDirectoryService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  /** Never throws: a failed alert must not roll back a finance decision. */
  async notifyMemberships(
    companyId: number,
    membershipIds: number[],
    notice: EmployeeFinanceNotice,
    excludeMembershipIds: Array<number | null | undefined> = [],
  ) {
    const excluded = new Set(
      excludeMembershipIds.filter((id): id is number => typeof id === 'number'),
    );
    const recipients = Array.from(new Set(membershipIds)).filter(
      (id) => !excluded.has(id),
    );
    for (const receiver of recipients) {
      try {
        await this.notificationsService.createAndPush({
          company_id: companyId,
          receiver_company_user_id: receiver,
          category: NotificationCategoryEnum.HR,
          priority: notice.priority ?? NotificationPriorityEnum.MEDIUM,
          title: notice.title,
          message: notice.message,
          related_module: 'employee-finance',
          entity_type: notice.entityType,
          entity_id: notice.entityId,
          action_url: notice.actionUrl ?? null,
          channels: [
            NotificationChannelEnum.IN_APP,
            NotificationChannelEnum.EMAIL,
          ],
          dedupe_key: notice.dedupeKey
            ? `${notice.dedupeKey}:${receiver}`
            : null,
        });
      } catch (error) {
        this.logger.warn(
          `Finance notification to membership ${receiver} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return recipients;
  }

  async notifyEmployee(
    companyId: number,
    employeeId: number,
    notice: EmployeeFinanceNotice,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
      select: ['id', 'company_user_id'],
    });
    if (!employee?.company_user_id) return [];
    return this.notifyMemberships(
      companyId,
      [employee.company_user_id],
      notice,
    );
  }

  /**
   * Manager stage goes to the applicant's line manager (reports_to), falling
   * back to the department manager; other stages go to every active holder
   * of the stage permission. The applicant is never notified as approver.
   */
  async approverMembershipIds(
    application: EmployeeFinanceApplication,
    stage: EmployeeFinanceRoutableStage,
  ) {
    const applicant = await this.employeeRepository.findOne({
      where: { id: application.employeeId, company_id: application.companyId },
    });
    if (stage === EmployeeFinanceApprovalStageEnum.MANAGER && applicant) {
      const managerIds: number[] = [];
      if (applicant.reports_to) {
        const manager = await this.employeeRepository.findOne({
          where: {
            id: applicant.reports_to,
            company_id: application.companyId,
          },
          select: ['id', 'company_user_id'],
        });
        if (manager?.company_user_id) managerIds.push(manager.company_user_id);
      }
      if (!managerIds.length && applicant.primary_department_id) {
        const department = await this.departmentRepository.findOne({
          where: {
            id: applicant.primary_department_id,
            company_id: application.companyId,
          },
        });
        if (
          department?.manager_employee_id &&
          department.manager_employee_id !== applicant.id
        ) {
          const manager = await this.employeeRepository.findOne({
            where: { id: department.manager_employee_id },
            select: ['id', 'company_user_id'],
          });
          if (manager?.company_user_id)
            managerIds.push(manager.company_user_id);
        }
      }
      if (managerIds.length) {
        return managerIds.filter((id) => id !== applicant.company_user_id);
      }
    }
    const holders = await this.directory.membershipIdsWithPermission(
      application.companyId,
      EMPLOYEE_FINANCE_STAGE_PERMISSION[stage],
    );
    return holders.filter((id) => id !== applicant?.company_user_id);
  }

  async notifyStageApprovers(
    application: EmployeeFinanceApplication,
    stage: EmployeeFinanceRoutableStage,
    notice: Omit<EmployeeFinanceNotice, 'entityType' | 'entityId'>,
  ) {
    const recipients = await this.approverMembershipIds(application, stage);
    return this.notifyMemberships(application.companyId, recipients, {
      ...notice,
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      actionUrl: notice.actionUrl ?? '/dashboard/finance/applications',
    });
  }
}

// ---------------------------------------------------------------------------
// Sanction letter templates
// ---------------------------------------------------------------------------

export const DEFAULT_SANCTION_LETTER_BODY = [
  'Dear {{employee_name}} ({{employee_no}}),',
  '',
  'We are pleased to confirm that your application {{application_no}} for a {{product_name}} has been approved on the following terms:',
  '',
  'Approved amount: {{approved_amount}}',
  'Repayment period: {{term_months}} months',
  'Interest: {{interest_rate}}% per annum ({{interest_method}})',
  'Estimated monthly instalment: {{monthly_installment}}',
  'Estimated total repayable: {{total_payable}}',
  '',
  'Instalments will be deducted from your monthly salary through payroll. Any amount outstanding when you leave the company will be recovered from your final settlement.',
  '',
  'This offer is subject to your acceptance in the HRMS portal and to disbursement being confirmed by Finance.',
].join('\n');

export const SANCTION_LETTER_PLACEHOLDERS = [
  'company_name',
  'employee_name',
  'employee_no',
  'application_no',
  'letter_no',
  'product_name',
  'product_type',
  'approved_amount',
  'term_months',
  'interest_rate',
  'interest_method',
  'monthly_installment',
  'total_payable',
  'issue_date',
] as const;

export function fillTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

@Injectable()
export class EmployeeFinanceLetterTemplateService {
  constructor(
    @InjectRepository(EmployeeFinanceLetterTemplate)
    private readonly templateRepository: Repository<EmployeeFinanceLetterTemplate>,
  ) {}

  async getSanctionTemplate(companyId: number) {
    return this.templateRepository.findOne({
      where: {
        companyId,
        templateType: EmployeeFinanceLetterTemplateTypeEnum.SANCTION_LETTER,
        isActive: true,
      },
    });
  }

  async get(actor: AuthenticatedUser) {
    const template = await this.getSanctionTemplate(actor.companyId!);
    return {
      template,
      default_body: DEFAULT_SANCTION_LETTER_BODY,
      placeholders: SANCTION_LETTER_PLACEHOLDERS,
    };
  }

  async upsert(
    actor: AuthenticatedUser,
    dto: {
      name?: string;
      letterhead: string;
      body: string;
      signatory_name: string;
      signatory_title: string;
      is_active?: boolean;
    },
  ) {
    const companyId = actor.companyId!;
    const unknown = Array.from(dto.body.matchAll(/\{\{([a-z_]+)\}\}/g))
      .map((match) => match[1])
      .filter(
        (key) =>
          !(SANCTION_LETTER_PLACEHOLDERS as readonly string[]).includes(key),
      );
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown placeholders: ${Array.from(new Set(unknown)).join(', ')}.`,
      );
    }
    for (const [field, value] of Object.entries({
      letterhead: dto.letterhead,
      body: dto.body,
      signatory_name: dto.signatory_name,
      signatory_title: dto.signatory_title,
    })) {
      if (!value?.trim()) {
        throw new BadRequestException(`${field} is required.`);
      }
    }
    const existing = await this.templateRepository.findOne({
      where: {
        companyId,
        templateType: EmployeeFinanceLetterTemplateTypeEnum.SANCTION_LETTER,
      },
    });
    return this.templateRepository.save(
      this.templateRepository.create({
        ...(existing ?? {}),
        companyId,
        templateType: EmployeeFinanceLetterTemplateTypeEnum.SANCTION_LETTER,
        name: dto.name?.trim() || 'Staff loan sanction letter',
        letterhead: dto.letterhead.trim(),
        body: dto.body.trim(),
        signatoryName: dto.signatory_name.trim(),
        signatoryTitle: dto.signatory_title.trim(),
        isActive: dto.is_active ?? true,
        updatedByCompanyUserId: actorMembershipId(actor),
      }),
    );
  }

  preview(body: string, values?: Record<string, string>) {
    const sample: Record<string, string> = {
      company_name: 'Alliance Insurance Corporation Limited',
      employee_name: 'Jane Doe',
      employee_no: 'EMP-0001',
      application_no: 'EFAPP-1-000001',
      letter_no: 'EFS-1-000001',
      product_name: 'Staff loan',
      product_type: 'STAFF_LOAN',
      approved_amount: '1,000,000.00',
      term_months: '12',
      interest_rate: '10',
      interest_method: 'Flat rate',
      monthly_installment: '91,666.67',
      total_payable: '1,100,000.00',
      issue_date: todayString(),
      ...(values ?? {}),
    };
    return { content: fillTemplate(body, sample) };
  }

  /**
   * Renders a stored sanction letter. The letter content and signatory were
   * frozen at approval time, so later template edits never change an issued
   * letter.
   */
  renderSanctionPdf(letter: EmployeeFinanceSanctionLetter): Promise<Buffer> {
    const snapshot = recordValue(letter.snapshot);
    const template = recordValue(snapshot.template);
    const letterhead =
      typeof template.letterhead === 'string' && template.letterhead.trim()
        ? template.letterhead
        : typeof snapshot.company_name === 'string'
          ? snapshot.company_name
          : 'Staff Loan Sanction Letter';
    const document = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document.fontSize(15).font('Helvetica-Bold').text(letterhead);
    document.moveDown(0.3);
    document.fontSize(12).font('Helvetica').text('Loan Sanction Letter');
    document.moveDown(0.8);
    document
      .fontSize(9)
      .fillColor('#444444')
      .text(`Letter No: ${letter.letterNo}`)
      .text(
        `Date: ${typeof snapshot.issue_date === 'string' ? snapshot.issue_date : new Date(letter.generatedAt).toISOString().slice(0, 10)}`,
      );
    document.fillColor('#000000').moveDown(1);
    document.fontSize(11).text(letter.content, { align: 'left' });
    document.moveDown(2);
    if (typeof template.signatory_name === 'string') {
      document.font('Helvetica-Bold').text(template.signatory_name);
      document
        .font('Helvetica')
        .text(
          typeof template.signatory_title === 'string'
            ? template.signatory_title
            : '',
        );
    }
    document.moveDown(1.5);
    document
      .fontSize(9)
      .fillColor('#444444')
      .text(
        letter.acceptedAt
          ? `Accepted electronically by the employee on ${new Date(letter.acceptedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC.`
          : 'Awaiting employee acceptance in the HRMS portal.',
      );
    document.end();
    return finished;
  }
}

// ---------------------------------------------------------------------------
// Approval delegation
// ---------------------------------------------------------------------------

@Injectable()
export class EmployeeFinanceDelegationService {
  constructor(
    private readonly directory: EmployeeFinancePermissionDirectoryService,
    @InjectRepository(EmployeeFinanceApprovalDelegation)
    private readonly repository: Repository<EmployeeFinanceApprovalDelegation>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: {
      delegate_company_user_id: number;
      stages: string[];
      starts_on: string;
      ends_on: string;
      reason?: string;
    },
  ) {
    const companyId = actor.companyId!;
    const delegator = actorMembershipId(actor);
    if (dto.delegate_company_user_id === delegator) {
      throw new BadRequestException('You cannot delegate to yourself.');
    }
    if (dto.ends_on < dto.starts_on) {
      throw new BadRequestException('Delegation end date is before its start.');
    }
    if (dto.ends_on < todayString()) {
      throw new BadRequestException('Delegation must end today or later.');
    }
    const stages = Array.from(
      new Set((dto.stages ?? []).map((stage) => stage.trim().toUpperCase())),
    );
    if (!stages.length || stages.some((stage) => !isRoutableStage(stage))) {
      throw new BadRequestException(
        `Stages must be from: ${EMPLOYEE_FINANCE_APPROVAL_STAGE_ORDER.join(', ')}.`,
      );
    }
    const missing = stages.filter(
      (stage) =>
        !hasPermission(
          actor.permissions,
          EMPLOYEE_FINANCE_STAGE_PERMISSION[
            stage as EmployeeFinanceRoutableStage
          ],
        ),
    );
    if (missing.length) {
      throw new ForbiddenException(
        `You can only delegate stages you approve yourself (missing: ${missing.join(', ')}).`,
      );
    }
    const delegate = await this.directory.membershipSummary(
      companyId,
      dto.delegate_company_user_id,
    );
    if (!delegate) {
      throw new NotFoundException('Delegate must be an active company user.');
    }
    return this.repository.save(
      this.repository.create({
        companyId,
        delegatorCompanyUserId: delegator,
        delegateCompanyUserId: dto.delegate_company_user_id,
        stages,
        startsOn: dto.starts_on,
        endsOn: dto.ends_on,
        reason: dto.reason?.trim() || null,
        status: 'ACTIVE',
      }),
    );
  }

  listMine(actor: AuthenticatedUser) {
    const membershipId = actorMembershipId(actor);
    return this.repository.find({
      where: [
        { companyId: actor.companyId!, delegatorCompanyUserId: membershipId },
        { companyId: actor.companyId!, delegateCompanyUserId: membershipId },
      ],
      order: { id: 'DESC' },
    });
  }

  async revoke(actor: AuthenticatedUser, id: number) {
    const delegation = await this.repository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!delegation) throw new NotFoundException('Delegation not found.');
    if (delegation.delegatorCompanyUserId !== actorMembershipId(actor)) {
      throw new ForbiddenException('Only the delegator can revoke it.');
    }
    delegation.status = 'REVOKED';
    delegation.revokedAt = new Date();
    return this.repository.save(delegation);
  }

  /** Active delegations letting `delegateMembershipId` act for `stage` today. */
  async findActive(
    companyId: number,
    delegateMembershipId: number,
    stage: EmployeeFinanceRoutableStage,
    onDate = todayString(),
  ) {
    const rows = await this.repository.find({
      where: {
        companyId,
        delegateCompanyUserId: delegateMembershipId,
        status: 'ACTIVE',
      },
      order: { id: 'ASC' },
    });
    return rows.filter(
      (row) =>
        row.startsOn <= onDate &&
        row.endsOn >= onDate &&
        Array.isArray(row.stages) &&
        row.stages.includes(stage),
    );
  }

  /** Delegates currently covering a stage for any of the given approvers. */
  async activeDelegatesFor(
    companyId: number,
    delegatorMembershipIds: number[],
    stage: EmployeeFinanceRoutableStage,
    onDate = todayString(),
  ) {
    if (!delegatorMembershipIds.length) return [];
    const rows = await this.repository.find({
      where: {
        companyId,
        delegatorCompanyUserId: In(delegatorMembershipIds),
        status: 'ACTIVE',
      },
    });
    return rows
      .filter(
        (row) =>
          row.startsOn <= onDate &&
          row.endsOn >= onDate &&
          Array.isArray(row.stages) &&
          row.stages.includes(stage),
      )
      .map((row) => row.delegateCompanyUserId);
  }
}

// ---------------------------------------------------------------------------
// Account status and overdue tracking
// ---------------------------------------------------------------------------

const UNPAID_INSTALLMENT_STATUSES = [
  EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
  EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
  EmployeeFinanceInstallmentStatusEnum.OVERDUE,
  EmployeeFinanceInstallmentStatusEnum.DEFERRED,
];

/** Accounts whose status is decided by people, not by the schedule. */
const FROZEN_ACCOUNT_STATUSES = [
  EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT,
  EmployeeFinanceAccountStatusEnum.CANCELLED,
  EmployeeFinanceAccountStatusEnum.WRITTEN_OFF,
  EmployeeFinanceAccountStatusEnum.SETTLED,
];

@Injectable()
export class EmployeeFinanceAccountStatusService {
  private readonly logger = new Logger(
    EmployeeFinanceAccountStatusService.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly notifier: EmployeeFinanceNotifierService,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository: Repository<EmployeeFinancePayrollInstruction>,
    @InjectRepository(EmployeeFinanceAdjustment)
    private readonly adjustmentRepository: Repository<EmployeeFinanceAdjustment>,
  ) {}

  /**
   * Recomputes an account's status from its schedule and balance:
   * fully repaid -> SETTLED, any overdue instalment -> IN_ARREARS, arrears
   * cleared -> back to ACTIVE (or RESTRUCTURED after a reschedule).
   */
  async refresh(companyId: number, accountId: number) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId },
    });
    if (!account || FROZEN_ACCOUNT_STATUSES.includes(account.status)) {
      return account;
    }
    const unpaid = await this.installmentRepository.find({
      where: {
        companyId,
        accountId,
        status: In(UNPAID_INSTALLMENT_STATUSES),
      },
    });
    const outstandingCents = EmployeeFinanceMoney.toCents(
      account.outstandingTotal,
    );
    let next = account.status;
    if (outstandingCents <= 0n && unpaid.length === 0) {
      next = EmployeeFinanceAccountStatusEnum.SETTLED;
    } else if (
      account.status !== EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY
    ) {
      const inArrears = unpaid.some(
        (installment) =>
          installment.status === EmployeeFinanceInstallmentStatusEnum.OVERDUE,
      );
      if (inArrears) {
        next = EmployeeFinanceAccountStatusEnum.IN_ARREARS;
      } else if (
        account.status === EmployeeFinanceAccountStatusEnum.IN_ARREARS ||
        account.status === EmployeeFinanceAccountStatusEnum.DEFERRED
      ) {
        next =
          account.scheduleVersion > 1
            ? EmployeeFinanceAccountStatusEnum.RESTRUCTURED
            : EmployeeFinanceAccountStatusEnum.ACTIVE;
      }
    }
    if (next !== account.status) {
      const previous = account.status;
      await this.accountRepository.update(
        { id: account.id, companyId },
        { status: next },
      );
      account.status = next;
      if (next === EmployeeFinanceAccountStatusEnum.SETTLED) {
        await this.notifier.notifyEmployee(companyId, account.employeeId, {
          title: 'Loan fully repaid',
          message: `Your ${account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE ? 'salary advance' : 'staff loan'} ${account.accountNo} is fully repaid and closed.`,
          entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
          entityId: account.id,
          actionUrl: '/dashboard/me/finance',
          dedupeKey: `ef-settled:${account.id}`,
        });
      } else if (
        next === EmployeeFinanceAccountStatusEnum.IN_ARREARS &&
        previous !== EmployeeFinanceAccountStatusEnum.IN_ARREARS
      ) {
        await this.notifier.notifyEmployee(companyId, account.employeeId, {
          title: 'Loan instalment overdue',
          message: `An instalment on ${account.accountNo} is overdue. Please contact Finance to arrange payment.`,
          entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
          entityId: account.id,
          actionUrl: '/dashboard/me/finance',
          priority: NotificationPriorityEnum.HIGH,
          dedupeKey: `ef-arrears:${account.id}:${todayString()}`,
        });
      }
    }
    return account;
  }

  @Cron(process.env.EMPLOYEE_FINANCE_OVERDUE_CRON || '0 15 1 * * *')
  async scheduledOverdueSweep() {
    try {
      return await this.markOverdue();
    } catch (error) {
      this.logger.error(
        `Overdue sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Flags instalments still unpaid `grace` days after their due date. An
   * instalment reserved by an in-progress payroll run is left alone: payroll
   * may still collect it.
   */
  async markOverdue(companyId?: number, asOf = todayString()) {
    const graceDays = Math.max(
      0,
      Number(
        this.configService.get<number>(
          'EMPLOYEE_FINANCE_OVERDUE_GRACE_DAYS',
          5,
        ),
      ) || 0,
    );
    const cutoff = addDaysString(asOf, -graceDays);
    const query = this.installmentRepository
      .createQueryBuilder('installment')
      .innerJoin(
        EmployeeFinanceAccount,
        'account',
        'account.id = installment.accountId AND account.companyId = installment.companyId',
      )
      .where('installment.dueDate < :cutoff', { cutoff })
      .andWhere('installment.status IN (:...statuses)', {
        statuses: [
          EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
          EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
        ],
      })
      .andWhere('account.status IN (:...accountStatuses)', {
        accountStatuses: [
          EmployeeFinanceAccountStatusEnum.ACTIVE,
          EmployeeFinanceAccountStatusEnum.IN_ARREARS,
          EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
          EmployeeFinanceAccountStatusEnum.DEFERRED,
        ],
      });
    if (companyId) {
      query.andWhere('installment.companyId = :companyId', { companyId });
    }
    const candidates = await query.getMany();
    const touched = new Map<string, { companyId: number; accountId: number }>();
    let marked = 0;
    let penalties = 0;
    for (const installment of candidates) {
      const reserved = await this.instructionRepository.count({
        where: {
          companyId: installment.companyId,
          installmentId: installment.id,
          status: EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
        },
      });
      if (reserved > 0) continue;
      installment.status = EmployeeFinanceInstallmentStatusEnum.OVERDUE;
      installment.overdueSince =
        installment.overdueSince ?? installment.dueDate;
      await this.installmentRepository.save(installment);
      marked += 1;
      touched.set(`${installment.companyId}:${installment.accountId}`, {
        companyId: installment.companyId,
        accountId: installment.accountId,
      });
      if (await this.raisePenalty(installment)) penalties += 1;
    }
    for (const item of touched.values()) {
      await this.refresh(item.companyId, item.accountId);
    }
    return {
      as_of: asOf,
      grace_days: graceDays,
      marked_overdue: marked,
      accounts_updated: touched.size,
      penalties_raised: penalties,
    };
  }

  /**
   * Raises a pending penalty for maker-checker review when the product has a
   * penalty rule. One penalty per instalment; nothing is posted until an
   * approver accepts it.
   */
  private async raisePenalty(installment: EmployeeFinanceInstallment) {
    const account = await this.accountRepository.findOne({
      where: { id: installment.accountId, companyId: installment.companyId },
    });
    if (!account) return false;
    const product = recordValue(account.productSnapshot);
    const eligibility = recordValue(
      product.eligibilityConfiguration ?? product.eligibility_configuration,
    );
    const policy = recordValue(
      eligibility.policy_configuration ??
        eligibility.policyConfiguration ??
        product.policyConfiguration,
    );
    const rule = recordValue(policy.penalty);
    const method = textValue(rule.method, 'NONE').toUpperCase();
    if (method === 'NONE' || !rule.value) return false;
    const unpaid = EmployeeFinanceMoney.subtract(
      installment.totalDue,
      installment.paidAmount,
    );
    let amount =
      method === 'PERCENT_OF_OVERDUE'
        ? EmployeeFinanceMoney.multiplyPercent(unpaid, textValue(rule.value))
        : EmployeeFinanceMoney.fromCents(
            EmployeeFinanceMoney.toCents(textValue(rule.value)),
          );
    if (rule.maximum_amount) {
      amount = EmployeeFinanceMoney.min(amount, textValue(rule.maximum_amount));
    }
    if (EmployeeFinanceMoney.toCents(amount) <= 0n) return false;
    const idempotencyKey = `penalty:installment:${installment.id}`;
    const existing = await this.adjustmentRepository.findOne({
      where: { companyId: installment.companyId, idempotencyKey },
    });
    if (existing) return false;
    await this.adjustmentRepository.save(
      this.adjustmentRepository.create({
        companyId: installment.companyId,
        accountId: installment.accountId,
        installmentId: installment.id,
        adjustmentType: EmployeeFinanceAdjustmentTypeEnum.PENALTY,
        principalAmount: '0.00',
        interestAmount: '0.00',
        feeAmount: amount,
        reason: `Late payment penalty for instalment ${installment.installmentNumber} due ${installment.dueDate}.`,
        source: 'OVERDUE_RULE',
        status: EmployeeFinanceRequestStatusEnum.PENDING,
        idempotencyKey,
        createdByCompanyUserId: null,
      }),
    );
    return true;
  }
}

/** Guards a pending request against being decided twice or by its maker. */
export function assertDecidable(
  request: { status: string; createdByCompanyUserId?: number | null },
  actor: AuthenticatedUser,
  makerField: number | null | undefined,
) {
  if (request.status !== String(EmployeeFinanceRequestStatusEnum.PENDING)) {
    throw new ConflictException('This request has already been decided.');
  }
  if (makerField !== null && makerField !== undefined) {
    if (makerField === actorMembershipId(actor)) {
      throw new ForbiddenException(
        'The person who raised this request cannot approve it.',
      );
    }
  }
}
