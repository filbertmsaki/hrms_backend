import { SmsCompanyRegistry } from './entities/sms-company-registry.entity';
import {
  GLOBAL_SMS_SETTING_KEY,
  SmsDeliveryDisabledError,
} from './sms-settings.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { normalizeTanzaniaPhone } from '../../common/utils/tanzania-phone.util';
import { SecurityEventsService } from '../security/security-events.service';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../security/enums/security-event-type.enum';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { EmployeeContact } from '../hr/employees/entities/employee-contact.entity';
import { ContactTypeEnum } from '../hr/employees/enums/contact-type.enum';
import { SmsLogStatusEnum } from './enums/sms-log-status.enum';
import { SmsGlobalSetting } from './entities/sms-global-setting.entity';
import { SmsNotificationLog } from './entities/sms-notification-log.entity';
import { SmsNotificationRegistry } from './entities/sms-notification-registry.entity';
import { SendTestSmsDto } from './dto/sms-test.dto';
import { UpdateSmsNotificationRegistryDto } from './dto/sms-notification-registry.dto';
import { SmsLogQueryDto } from './dto/sms-log-query.dto';
import { SmsService } from './sms.service';

// Employee contact verification is not enforced yet because the backend does
// not have a complete phone-verification workflow.
const REQUIRE_VERIFIED_EMPLOYEE_SMS_CONTACTS = false;

type SmsRegistrySeed = {
  code: string;
  name: string;
  module: string;
  description: string;
  smsTemplate: string;
  isEnabled: boolean;
};

const DEFAULT_SMS_NOTIFICATION_REGISTRY: readonly SmsRegistrySeed[] = [
  {
    code: 'auth.password.reset.requested',
    name: 'Password reset requested',
    module: 'auth',
    description:
      'Alert the user that a password reset request was initiated for the account.',
    smsTemplate:
      '{{app_name}}: A password reset was requested for your account. If this was not you, contact support at {{support_email}} immediately.',
    isEnabled: true,
  },
  {
    code: 'auth.two_factor.enabled',
    name: 'Two-factor enabled',
    module: 'auth',
    description:
      'Confirm to the user that two-factor authentication was enabled.',
    smsTemplate:
      '{{app_name}}: Two-factor authentication was enabled for your account.',
    isEnabled: true,
  },
  {
    code: 'auth.two_factor.disabled',
    name: 'Two-factor disabled',
    module: 'auth',
    description: 'Alert the user that two-factor authentication was disabled.',
    smsTemplate:
      '{{app_name}}: Two-factor authentication was disabled for your account. Contact support if this was not you.',
    isEnabled: true,
  },
  {
    code: 'leave.application.submitted',
    name: 'Leave application submitted',
    module: 'leave',
    description:
      'Notify the employee that the leave application was submitted.',
    smsTemplate:
      'Your {{leave_type_name}} leave request has been submitted in {{app_name}}.',
    isEnabled: false,
  },
  {
    code: 'leave.approval.required',
    name: 'Leave approval required',
    module: 'leave',
    description:
      'Notify approvers that a leave request requires urgent review.',
    smsTemplate:
      '{{employee_name}} submitted a {{leave_type_name}} leave request that requires your action in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'leave.approved',
    name: 'Leave approved',
    module: 'leave',
    description: 'Notify the employee that leave was approved.',
    smsTemplate:
      'Your {{leave_type_name}} leave request has been approved in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'leave.rejected',
    name: 'Leave rejected',
    module: 'leave',
    description: 'Notify the employee that leave was rejected.',
    smsTemplate:
      'Your {{leave_type_name}} leave request was rejected in {{app_name}}. Please review the feedback in the system.',
    isEnabled: true,
  },
  {
    code: 'offboarding.approval.required',
    name: 'Offboarding approval required',
    module: 'offboarding',
    description:
      'Notify approvers that an offboarding request requires action.',
    smsTemplate:
      'Offboarding for {{employee_name}} is waiting for your action in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'offboarding.approval.reminder',
    name: 'Offboarding approval reminder',
    module: 'offboarding',
    description: 'Send an overdue reminder for offboarding approvals.',
    smsTemplate:
      'Reminder: offboarding approval for {{employee_name}} is still pending in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'offboarding.asset.overdue',
    name: 'Offboarding asset overdue',
    module: 'offboarding',
    description: 'Notify asset owners that a return is overdue.',
    smsTemplate:
      'Asset return overdue: {{asset_label}} for {{employee_name}} requires your action in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'offboarding.settlement.overdue',
    name: 'Offboarding settlement overdue',
    module: 'offboarding',
    description: 'Notify settlement owners that a settlement item is overdue.',
    smsTemplate:
      'Settlement overdue: {{settlement_title}} for {{employee_name}} requires your action in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'payroll.payslip.ready',
    name: 'Payslip ready',
    module: 'payroll',
    description: 'Notify employees that a payslip is ready to view.',
    smsTemplate:
      'Your payslip for payroll run {{run_no}} is ready in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'employee_finance.application.submitted',
    name: 'Employee finance submitted',
    module: 'employee-finance',
    description:
      'Notify stakeholders that a loan or salary advance application was submitted.',
    smsTemplate:
      '{{app_name}}: Employee finance application {{application_no}} was submitted and is waiting for review.',
    isEnabled: false,
  },
  {
    code: 'employee_finance.application.recommended',
    name: 'Employee finance recommended',
    module: 'employee-finance',
    description:
      'Notify the employee that the manager recommended the application.',
    smsTemplate:
      '{{app_name}}: Your {{product_type}} application {{application_no}} was recommended by your manager.',
    isEnabled: false,
  },
  {
    code: 'employee_finance.application.hr_approved',
    name: 'Employee finance HR approved',
    module: 'employee-finance',
    description: 'Notify the employee that HR approved the application.',
    smsTemplate:
      '{{app_name}}: Your {{product_type}} application {{application_no}} was approved by HR.',
    isEnabled: false,
  },
  {
    code: 'employee_finance.application.approved',
    name: 'Employee finance approved',
    module: 'employee-finance',
    description:
      'Notify the employee that a loan or salary advance application has been approved.',
    smsTemplate:
      'Your {{product_type}} application {{application_no}} has been approved in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'employee_finance.application.guarantor_decided',
    name: 'Employee finance guarantor decided',
    module: 'employee-finance',
    description:
      'Notify the applicant when a guarantor approves or rejects the guarantee request.',
    smsTemplate:
      '{{app_name}}: Guarantor response for application {{application_no}} is {{decision}}.',
    isEnabled: false,
  },
  {
    code: 'employee_finance.disbursement.confirmed',
    name: 'Employee finance disbursed',
    module: 'employee-finance',
    description: 'Notify the employee that a disbursement was confirmed.',
    smsTemplate:
      'Your {{product_type}} disbursement for application {{application_no}} has been confirmed in {{app_name}}.',
    isEnabled: true,
  },
  {
    code: 'employee_finance.repayment.posted',
    name: 'Employee finance repayment posted',
    module: 'employee-finance',
    description: 'Notify the employee when a repayment is posted.',
    smsTemplate:
      '{{app_name}}: A repayment of {{amount}} was posted to your {{product_type}} account {{account_no}}.',
    isEnabled: false,
  },
  {
    code: 'onboarding.employee.started',
    name: 'Onboarding employee started',
    module: 'onboarding',
    description: 'Future SMS hook for employee onboarding starts.',
    smsTemplate: 'Your onboarding has started in {{app_name}}.',
    isEnabled: false,
  },
  {
    code: 'attendance.alert.missed-punch',
    name: 'Attendance missed punch alert',
    module: 'attendance',
    description: 'Future SMS hook for missed punch alerts.',
    smsTemplate:
      'Attendance alert: your punch requires attention in {{app_name}}.',
    isEnabled: false,
  },
];

export type SendConfiguredSmsInput = {
  code: string;
  recipientCompanyUserId?: number | null;
  recipientEmployeeId?: number | null;
  recipientPhone?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | number | null;
  module?: string | null;
  variables?: Record<string, unknown>;
  actor?: AuthenticatedUser | null;
  context?: AuditRequestContext | null;
  companyId?: number | null;
};

type RecipientResolutionInput = Pick<
  SendConfiguredSmsInput,
  | 'recipientCompanyUserId'
  | 'recipientEmployeeId'
  | 'recipientPhone'
  | 'companyId'
>;

type ResolvedRecipient = {
  companyId?: number;
  companyUserId: number | null;
  employeeId: number | null;
  phone: string | null;
  logRecipientPhone: string | null;
  error: string | null;
};

type ResolvedPhoneCandidate = {
  rawPhone: string;
  logRecipientPhone: string;
  fromEmployeeContact: boolean;
  isVerified: boolean | null;
};

@Injectable()
export class SmsNotificationManagementService implements OnModuleInit {
  private readonly logger = new Logger(SmsNotificationManagementService.name);

  constructor(
    @InjectRepository(SmsGlobalSetting)
    private readonly globalSettingRepository: Repository<SmsGlobalSetting>,
    @InjectRepository(SmsNotificationRegistry)
    private readonly registryRepository: Repository<SmsNotificationRegistry>,
    @InjectRepository(SmsNotificationLog)
    private readonly logRepository: Repository<SmsNotificationLog>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
  }

  private async ensureDefaults(): Promise<void> {
    await this.globalSettingRepository
      .createQueryBuilder()
      .insert()
      .values({
        key: GLOBAL_SMS_SETTING_KEY,
        isEnabled: false,
        description: 'Controls SMS delivery across the platform.',
      })
      .orIgnore()
      .execute();
    await this.registryRepository
      .createQueryBuilder()
      .insert()
      .values([...DEFAULT_SMS_NOTIFICATION_REGISTRY])
      .orIgnore()
      .execute();
  }

  private get companyRegistry() {
    return this.registryRepository.manager.getRepository(SmsCompanyRegistry);
  }

  private applyCompanyRegistry(
    base: SmsNotificationRegistry,
    override?: SmsCompanyRegistry | null,
  ) {
    return {
      ...base,
      isEnabled: base.isEnabled && (override?.isEnabled ?? true),
      platformEnabled: base.isEnabled,
      companyEnabled: override?.isEnabled ?? true,
      smsTemplate: override?.smsTemplate ?? base.smsTemplate,
      description: override?.description ?? base.description,
    };
  }

  async listRegistry(companyId?: number) {
    const rows = await this.registryRepository.find({
      order: { module: 'ASC', code: 'ASC' },
    });
    if (!companyId) return rows;
    const overrides = new Map(
      (await this.companyRegistry.findBy({ companyId })).map((row) => [
        row.registryId,
        row,
      ]),
    );
    return rows.map((row) =>
      this.applyCompanyRegistry(row, overrides.get(row.id)),
    );
  }

  async getRegistryItem(idOrCode: string | number, companyId?: number | null) {
    const where =
      typeof idOrCode === 'number' ? { id: idOrCode } : { code: idOrCode };
    const base = await this.registryRepository.findOne({ where });
    if (!base)
      throw new NotFoundException('SMS notification configuration not found.');
    if (!companyId) return base;
    return this.applyCompanyRegistry(
      base,
      await this.companyRegistry.findOneBy({ companyId, registryId: base.id }),
    );
  }

  async updateRegistryItem(
    code: string,
    dto: UpdateSmsNotificationRegistryDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
    companyId?: number,
  ) {
    const item = await this.getRegistryItem(code);
    const patch = {
      ...(dto.is_enabled !== undefined ? { isEnabled: dto.is_enabled } : {}),
      ...(dto.sms_template !== undefined
        ? { smsTemplate: dto.sms_template.trim() }
        : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
    };
    if (companyId) {
      await this.companyRegistry.upsert(
        { companyId, registryId: item.id, ...patch },
        ['companyId', 'registryId'],
      );
    } else {
      await this.registryRepository.update(item.id, {
        ...patch,
        updatedByCompanyUserId: actor.companyMembershipId ?? null,
      });
    }
    const saved = await this.getRegistryItem(code, companyId);

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.CONFIGURATION_CHANGED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      resourceType: 'sms_notification_registry',
      resourceId: saved.code,
      newValues: {
        is_enabled: saved.isEnabled,
        sms_template: saved.smsTemplate,
      },
      context,
    });

    return saved;
  }

  async sendTestSms(
    dto: SendTestSmsDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ) {
    const phone = normalizeTanzaniaPhone(dto.recipient_phone);
    if (!phone) {
      throw new BadRequestException(
        'Recipient phone number must be a valid Tanzanian number in +255 format',
      );
    }

    const log = await this.logRepository.save(
      this.logRepository.create({
        companyId: actor.companyId!,
        registryId: null,
        notificationCode: 'sms.test',
        notificationName: 'Manual SMS test',
        module: 'sms',
        recipientPhone: phone,
        message: dto.message.trim(),
        templateSnapshot: null,
        status: SmsLogStatusEnum.PENDING,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
      }),
    );

    try {
      const providerResult = await this.smsService.sendTextSms(
        phone,
        dto.message.trim(),
        actor.companyId!,
      );
      log.status = SmsLogStatusEnum.SENT;
      log.providerReference = providerResult.reference;
      log.providerResponseCode = providerResult.providerCode;
      log.providerResponse = providerResult.rawResponse;
      log.sentAt = new Date();
      log.errorMessage = null;
      await this.logRepository.save(log);

      await this.securityEventsService.logBestEffort({
        eventType: SecurityEventType.CONFIGURATION_CHANGED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        resourceType: 'sms_test',
        resourceId: log.id,
        metadata: { recipient_phone: phone },
        context,
      });

      return {
        delivery_status: log.status,
        provider_response: providerResult.rawResponse,
        provider_reference: providerResult.reference,
        provider_code: providerResult.providerCode,
        error: null,
      };
    } catch (error) {
      log.status =
        error instanceof SmsDeliveryDisabledError
          ? SmsLogStatusEnum.SKIPPED
          : SmsLogStatusEnum.FAILED;
      log.errorMessage =
        error instanceof Error ? error.message : 'SMS send failed';
      await this.logRepository.save(log);

      return {
        delivery_status: log.status,
        provider_response: null,
        provider_reference: null,
        provider_code: null,
        error: log.errorMessage,
      };
    }
  }

  async retryFailedLog(
    id: number,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
    scope?: { companyId?: number | null; platformScope?: boolean },
  ) {
    const existing = await this.findLogWithScope(id, scope);
    if (!existing) {
      throw new NotFoundException('SMS log not found.');
    }

    if (
      ![SmsLogStatusEnum.FAILED, SmsLogStatusEnum.SKIPPED].includes(
        existing.status,
      )
    ) {
      throw new BadRequestException(
        'Only failed or skipped SMS logs can be retried.',
      );
    }

    if (
      existing.companyId == null &&
      !existing.notificationCode?.startsWith('auth.')
    ) {
      throw new BadRequestException(
        'The original company for this SMS could not be verified.',
      );
    }
    if (existing.notificationCode && existing.notificationCode !== 'sms.test') {
      const registry = await this.getRegistryItem(
        existing.notificationCode,
        existing.companyId,
      );
      if (!registry.isEnabled)
        throw new BadRequestException('This SMS notification is disabled.');
    }

    const recipient = await this.resolveRecipient({
      companyId: existing.companyId,
      recipientCompanyUserId: existing.recipientCompanyUserId,
      recipientEmployeeId: existing.recipientEmployeeId,
      recipientPhone:
        existing.recipientCompanyUserId || existing.recipientEmployeeId
          ? null
          : existing.recipientPhone,
    });

    const retry = await this.logRepository.save(
      this.logRepository.create({
        companyId: existing.companyId,
        registryId: existing.registryId,
        notificationCode: existing.notificationCode,
        notificationName: existing.notificationName,
        module: existing.module,
        recipientPhone:
          recipient.phone ?? recipient.logRecipientPhone ?? 'UNKNOWN',
        recipientCompanyUserId: recipient.companyUserId,
        recipientEmployeeId: recipient.employeeId,
        message: existing.message,
        templateSnapshot: existing.templateSnapshot,
        relatedEntityType: existing.relatedEntityType,
        relatedEntityId: existing.relatedEntityId,
        status: recipient.phone
          ? SmsLogStatusEnum.PENDING
          : SmsLogStatusEnum.SKIPPED,
        errorMessage: recipient.phone ? null : recipient.error,
        retryOfLogId: existing.id,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
      }),
    );

    if (!recipient.phone) {
      await this.securityEventsService.logBestEffort({
        eventType: SecurityEventType.CONFIGURATION_CHANGED,
        outcome: SecurityEventOutcome.FAILURE,
        actor,
        resourceType: 'sms_retry',
        resourceId: retry.id,
        metadata: { retry_of_log_id: existing.id },
        context,
      });

      return retry;
    }

    try {
      const providerResult = await this.smsService.sendTextSms(
        recipient.phone,
        retry.message,
        existing.companyId,
      );
      retry.status = SmsLogStatusEnum.SENT;
      retry.providerReference = providerResult.reference;
      retry.providerResponseCode = providerResult.providerCode;
      retry.providerResponse = providerResult.rawResponse;
      retry.sentAt = new Date();
      retry.errorMessage = null;
      await this.logRepository.save(retry);
    } catch (error) {
      retry.status =
        error instanceof SmsDeliveryDisabledError
          ? SmsLogStatusEnum.SKIPPED
          : SmsLogStatusEnum.FAILED;
      retry.errorMessage =
        error instanceof Error ? error.message : 'SMS retry failed';
      await this.logRepository.save(retry);
    }

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.CONFIGURATION_CHANGED,
      outcome:
        retry.status === SmsLogStatusEnum.SENT
          ? SecurityEventOutcome.SUCCESS
          : SecurityEventOutcome.FAILURE,
      actor,
      resourceType: 'sms_retry',
      resourceId: retry.id,
      metadata: { retry_of_log_id: existing.id },
      context,
    });

    return retry;
  }

  async sendConfiguredNotification(
    input: SendConfiguredSmsInput,
  ): Promise<{ status: SmsLogStatusEnum; reason?: string | null }> {
    const expectedCompany = input.companyId ?? input.actor?.companyId ?? null;
    const recipient = await this.resolveRecipient({
      ...input,
      companyId: expectedCompany,
    });
    const companyId = expectedCompany ?? recipient.companyId ?? null;
    const registry = await this.getRegistryItem(input.code, companyId);
    input = { ...input, companyId };
    if (!companyId && !input.code.startsWith('auth.') && recipient.phone) {
      recipient.phone = null;
      recipient.error =
        'The original company for this SMS could not be verified.';
    }
    if (!recipient.phone) {
      const reason =
        recipient.error ?? 'Recipient has no valid Tanzania phone number';
      await this.writeSkippedLog(registry, input, recipient, reason);
      return {
        status: SmsLogStatusEnum.SKIPPED,
        reason,
      };
    }

    if (!registry.isEnabled) {
      const reason = 'This SMS notification is disabled.';
      await this.writeSkippedLog(registry, input, recipient, reason);
      return { status: SmsLogStatusEnum.SKIPPED, reason };
    }

    const message = this.renderTemplate(
      registry.smsTemplate,
      input.variables ?? {},
    );

    const log = await this.logRepository.save(
      this.logRepository.create({
        companyId: input.companyId,
        registryId: registry.id,
        notificationCode: registry.code,
        notificationName: registry.name,
        module: input.module ?? registry.module,
        recipientPhone: recipient.phone,
        recipientCompanyUserId: recipient.companyUserId,
        recipientEmployeeId: recipient.employeeId,
        message,
        templateSnapshot: registry.smsTemplate,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId:
          input.relatedEntityId === undefined || input.relatedEntityId === null
            ? null
            : String(input.relatedEntityId),
        status: SmsLogStatusEnum.PENDING,
        createdByCompanyUserId: input.actor?.companyMembershipId ?? null,
      }),
    );

    try {
      const providerResult = await this.smsService.sendTextSms(
        recipient.phone,
        message,
        companyId,
      );
      log.status = SmsLogStatusEnum.SENT;
      log.providerReference = providerResult.reference;
      log.providerResponseCode = providerResult.providerCode;
      log.providerResponse = providerResult.rawResponse;
      log.sentAt = new Date();
      log.errorMessage = null;
      await this.logRepository.save(log);
      return { status: SmsLogStatusEnum.SENT, reason: null };
    } catch (error) {
      log.status =
        error instanceof SmsDeliveryDisabledError
          ? SmsLogStatusEnum.SKIPPED
          : SmsLogStatusEnum.FAILED;
      log.errorMessage =
        error instanceof Error ? error.message : 'SMS send failed';
      await this.logRepository.save(log);
      if (log.status === SmsLogStatusEnum.FAILED)
        this.logger.error(
          `SMS send failed for ${registry.code}`,
          error instanceof Error ? error.stack : String(error),
        );
      return { status: log.status, reason: log.errorMessage };
    }
  }

  private async writeSkippedLog(
    registry: SmsNotificationRegistry,
    input: SendConfiguredSmsInput,
    recipient: {
      phone: string | null;
      logRecipientPhone: string | null;
      companyUserId: number | null;
      employeeId: number | null;
    },
    reason: string,
  ) {
    await this.logRepository.save(
      this.logRepository.create({
        companyId: input.companyId,
        registryId: registry.id,
        notificationCode: registry.code,
        notificationName: registry.name,
        module: input.module ?? registry.module,
        recipientPhone:
          recipient.phone ?? recipient.logRecipientPhone ?? 'UNKNOWN',
        recipientCompanyUserId: recipient.companyUserId,
        recipientEmployeeId: recipient.employeeId,
        message: this.renderTemplate(
          registry.smsTemplate,
          input.variables ?? {},
        ),
        templateSnapshot: registry.smsTemplate,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId:
          input.relatedEntityId === undefined || input.relatedEntityId === null
            ? null
            : String(input.relatedEntityId),
        status: SmsLogStatusEnum.SKIPPED,
        errorMessage: reason,
        createdByCompanyUserId: input.actor?.companyMembershipId ?? null,
      }),
    );
  }

  private renderTemplate(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    const runtimeVariables: Record<string, unknown> = {
      app_name: this.configService.get<string>('APP_NAME', 'HRMS'),
      support_email: this.configService.get<string>('SUPPORT_EMAIL', ''),
      ...variables,
    };

    return template.replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (_, token: string) => {
        const value = runtimeVariables[token];
        return value === undefined || value === null
          ? ''
          : typeof value === 'string'
            ? value
            : typeof value === 'number' ||
                typeof value === 'boolean' ||
                typeof value === 'bigint'
              ? String(value)
              : (JSON.stringify(value) ?? '');
      },
    );
  }

  private async resolveRecipient(
    input: RecipientResolutionInput,
  ): Promise<ResolvedRecipient> {
    if (input.recipientCompanyUserId) {
      const membership = await this.companyUserRepository.findOne({
        where: {
          id: input.recipientCompanyUserId,
          ...(input.companyId ? { company_id: input.companyId } : {}),
          status: 'active',
        },
        relations: { user: true, employee: { contacts: true } },
      });

      if (!membership) {
        return {
          companyUserId: input.recipientCompanyUserId,
          employeeId: null,
          phone: null,
          logRecipientPhone: null,
          error:
            'Recipient could not be resolved in the active company context',
        };
      }

      const employee =
        membership.employee &&
        membership.employee.company_id === membership.company_id
          ? membership.employee
          : null;
      const candidate = this.selectRecipientPhoneCandidate(
        employee?.contacts ?? [],
        membership.user?.phone ?? null,
      );

      return {
        companyId: membership.company_id,
        companyUserId: membership.id,
        employeeId: employee?.id ?? null,
        ...this.resolveCandidatePhone(candidate),
      };
    }

    if (input.recipientEmployeeId) {
      const employee = await this.employeeRepository.findOne({
        where: {
          id: input.recipientEmployeeId,
          ...(input.companyId ? { company_id: input.companyId } : {}),
        },
        relations: { contacts: true, company_user: { user: true } },
      });
      if (!employee) {
        return {
          companyUserId: null,
          employeeId: input.recipientEmployeeId,
          phone: null,
          logRecipientPhone: null,
          error:
            'Recipient could not be resolved in the active company context',
        };
      }

      const membership =
        employee.company_user &&
        employee.company_user.status === 'active' &&
        employee.company_user.company_id === employee.company_id
          ? employee.company_user
          : null;

      if (!membership) {
        return {
          companyUserId: employee.company_user_id ?? null,
          employeeId: employee.id,
          phone: null,
          logRecipientPhone: null,
          error:
            'Recipient could not be resolved in the active company context',
        };
      }

      const candidate = this.selectRecipientPhoneCandidate(
        employee.contacts ?? [],
        membership.user?.phone ?? null,
      );

      return {
        companyId: membership.company_id,
        companyUserId: membership.id,
        employeeId: employee.id,
        ...this.resolveCandidatePhone(candidate),
      };
    }

    const directPhone = this.normalizeLogRecipientPhone(input.recipientPhone);
    if (!directPhone) {
      return {
        companyUserId: null,
        employeeId: null,
        phone: null,
        logRecipientPhone: null,
        error: 'Recipient has no phone number',
      };
    }

    const normalizedDirectPhone = normalizeTanzaniaPhone(directPhone);
    if (!normalizedDirectPhone) {
      return {
        companyUserId: null,
        employeeId: null,
        phone: null,
        logRecipientPhone: directPhone,
        error: 'Recipient has no valid Tanzania phone number',
      };
    }

    return {
      companyUserId: null,
      employeeId: null,
      phone: normalizedDirectPhone,
      logRecipientPhone: normalizedDirectPhone,
      error: null,
    };
  }

  private selectRecipientPhoneCandidate(
    contacts: EmployeeContact[],
    fallbackUserPhone: string | null | undefined,
  ): ResolvedPhoneCandidate | null {
    const sortedContacts = [...contacts].sort((left, right) => {
      if (left.is_primary !== right.is_primary) {
        return Number(right.is_primary) - Number(left.is_primary);
      }

      return left.id - right.id;
    });

    const primaryContact = sortedContacts.find(
      (contact) =>
        contact.is_primary && this.hasPhoneValue(contact.phone_number),
    );
    if (primaryContact) {
      return this.buildContactCandidate(primaryContact);
    }

    const secondaryTypePriority = [
      ContactTypeEnum.MOBILE,
      ContactTypeEnum.WORK,
      ContactTypeEnum.WHATSAPP,
    ] as const;

    for (const contactType of secondaryTypePriority) {
      const contact = sortedContacts.find(
        (item) =>
          String(item.contact_type).toLowerCase() ===
            String(contactType).toLowerCase() &&
          this.hasPhoneValue(item.phone_number),
      );
      if (contact) {
        return this.buildContactCandidate(contact);
      }
    }

    const anyContact = sortedContacts.find((contact) =>
      this.hasPhoneValue(contact.phone_number),
    );
    if (anyContact) {
      return this.buildContactCandidate(anyContact);
    }

    if (this.hasPhoneValue(fallbackUserPhone)) {
      const logRecipientPhone =
        this.normalizeLogRecipientPhone(fallbackUserPhone);
      if (!logRecipientPhone) {
        return null;
      }

      return {
        rawPhone: fallbackUserPhone.trim(),
        logRecipientPhone,
        fromEmployeeContact: false,
        isVerified: null,
      };
    }

    return null;
  }

  private buildContactCandidate(
    contact: EmployeeContact,
  ): ResolvedPhoneCandidate {
    return {
      rawPhone: contact.phone_number!.trim(),
      logRecipientPhone:
        this.normalizeLogRecipientPhone(contact.phone_number) ??
        contact.phone_number!.trim(),
      fromEmployeeContact: true,
      isVerified: contact.is_verified,
    };
  }

  private resolveCandidatePhone(
    candidate: ResolvedPhoneCandidate | null,
  ): Pick<ResolvedRecipient, 'phone' | 'logRecipientPhone' | 'error'> {
    if (!candidate) {
      return {
        phone: null,
        logRecipientPhone: null,
        error: 'Recipient has no phone number',
      };
    }

    if (
      candidate.fromEmployeeContact &&
      REQUIRE_VERIFIED_EMPLOYEE_SMS_CONTACTS &&
      candidate.isVerified === false
    ) {
      return {
        phone: null,
        logRecipientPhone: candidate.logRecipientPhone,
        error: 'Recipient phone number is not verified',
      };
    }

    const normalizedPhone = normalizeTanzaniaPhone(candidate.rawPhone);
    if (!normalizedPhone) {
      return {
        phone: null,
        logRecipientPhone: candidate.logRecipientPhone,
        error: 'Recipient has no valid Tanzania phone number',
      };
    }

    return {
      phone: normalizedPhone,
      logRecipientPhone: normalizedPhone,
      error: null,
    };
  }

  private hasPhoneValue(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private normalizeLogRecipientPhone(
    value: string | null | undefined,
  ): string | null {
    if (!this.hasPhoneValue(value)) {
      return null;
    }

    const compact = value.replace(/[\s()-]/g, '').trim();
    return compact || null;
  }

  async listLogs(
    query: SmsLogQueryDto,
    scope?: { companyId?: number | null; platformScope?: boolean },
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const qb = this.logRepository.createQueryBuilder('log');

    if (!scope?.platformScope) {
      qb.andWhere('log.companyId = :companyId', {
        companyId: scope?.companyId ?? null,
      });
    }

    if (query.status) {
      qb.andWhere('log.status = :status', { status: query.status });
    }
    if (query.module?.trim()) {
      qb.andWhere('log.module = :module', { module: query.module.trim() });
    }
    if (query.notification_code?.trim()) {
      qb.andWhere('log.notificationCode = :code', {
        code: query.notification_code.trim(),
      });
    }

    const [data, total] = await qb
      .orderBy('log.createdAt', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async findLogWithScope(
    id: number,
    scope?: { companyId?: number | null; platformScope?: boolean },
  ) {
    const qb = this.logRepository
      .createQueryBuilder('log')
      .where('log.id = :id', { id });

    if (!scope?.platformScope) {
      qb.andWhere('log.companyId = :companyId', {
        companyId: scope?.companyId ?? null,
      });
    }

    return qb.getOne();
  }
}
