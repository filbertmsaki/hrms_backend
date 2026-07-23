import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  applyMailRecipientSafety,
  resolveMailRecipientSafetyConfigFromConfigService,
  type SafeSendMailOptions,
} from '../mail/mail-recipient-safety.util';
import { buildPaginationMeta } from '../hr/shared/hr.utils';
import {
  CreateReportScheduleDto,
  CreateReportSmtpConfigurationDto,
  CreateReportTemplateDto,
  CreateReportTemplateRecipientDto,
  QueryReportExecutionsDto,
  QueryReportSchedulesDto,
  QueryReportSmtpConfigurationsDto,
  QueryReportTemplatesDto,
  TestReportSmtpConfigurationDto,
  UpdateReportScheduleDto,
  UpdateReportSmtpConfigurationDto,
  UpdateReportTemplateDto,
} from './dto/scheduled-reporting.dto';
import { ReportEmailDeliveryStatusEnum } from './enums/report-email-delivery-status.enum';
import { ReportRecipientTypeEnum } from './enums/report-recipient-type.enum';
import { ReportScheduleTypeEnum } from './enums/report-schedule-type.enum';
import { ReportSmtpSecurityTypeEnum } from './enums/report-smtp-security-type.enum';
import { ReportSmtpTestStatusEnum } from './enums/report-smtp-test-status.enum';
import { ReportWeekdayEnum } from './enums/report-weekday.enum';
import { ReportDefinition } from './entities/report-definition.entity';
import { ReportExecutionAttempt } from './entities/report-execution-attempt.entity';
import { ReportExecutionRecipient } from './entities/report-execution-recipient.entity';
import { ReportExecution } from './entities/report-execution.entity';
import { ReportScheduleWeekday } from './entities/report-schedule-weekday.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportSmtpConfiguration } from './entities/report-smtp-configuration.entity';
import { ReportTemplateRecipient } from './entities/report-template-recipient.entity';
import { ReportTemplate } from './entities/report-template.entity';
import {
  decryptReportSmtpSecret,
  encryptReportSmtpSecret,
} from './utils/report-smtp-secret.util';

type ReportMailTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: {
    user: string;
    pass: string;
  };
};

type ReportMailSendOptions = SafeSendMailOptions & {
  from: string;
  to: string;
  subject: string;
  text: string;
};

type ReportMailSendResult = {
  accepted: string[];
  rejected: string[];
  response: string;
  messageId: string;
};

type ReportMailTransporter = {
  verify(): Promise<void>;
  sendMail(options: ReportMailSendOptions): Promise<ReportMailSendResult>;
};

type NodemailerModule = {
  createTransport(options: ReportMailTransportOptions): ReportMailTransporter;
};

async function loadNodemailerModule(): Promise<NodemailerModule> {
  return (await import('nodemailer')) as unknown as NodemailerModule;
}

@Injectable()
export class ScheduledReportingService {
  private readonly logger = new Logger(ScheduledReportingService.name);

  constructor(
    @InjectRepository(ReportDefinition)
    private readonly reportDefinitionRepository: Repository<ReportDefinition>,
    @InjectRepository(ReportSmtpConfiguration)
    private readonly reportSmtpConfigurationRepository: Repository<ReportSmtpConfiguration>,
    @InjectRepository(ReportTemplate)
    private readonly reportTemplateRepository: Repository<ReportTemplate>,
    @InjectRepository(ReportTemplateRecipient)
    private readonly reportTemplateRecipientRepository: Repository<ReportTemplateRecipient>,
    @InjectRepository(ReportSchedule)
    private readonly reportScheduleRepository: Repository<ReportSchedule>,
    @InjectRepository(ReportScheduleWeekday)
    private readonly reportScheduleWeekdayRepository: Repository<ReportScheduleWeekday>,
    @InjectRepository(ReportExecution)
    private readonly reportExecutionRepository: Repository<ReportExecution>,
    @InjectRepository(ReportExecutionRecipient)
    private readonly reportExecutionRecipientRepository: Repository<ReportExecutionRecipient>,
    @InjectRepository(ReportExecutionAttempt)
    private readonly reportExecutionAttemptRepository: Repository<ReportExecutionAttempt>,
    private readonly configService: ConfigService,
  ) {}

  assertCompanyActor(user: AuthenticatedUser) {
    if (user.scope !== 'company' || !user.companyId) {
      throw new ForbiddenException(
        'Scheduled reporting is only available to company users.',
      );
    }

    return {
      companyId: user.companyId,
      companyMembershipId: user.companyMembershipId ?? null,
    };
  }

  async listReportDefinitions() {
    const definitions = await this.reportDefinitionRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    return definitions.map((definition) => this.mapDefinition(definition));
  }

  async createSmtpConfiguration(
    companyId: number,
    dto: CreateReportSmtpConfigurationDto,
  ) {
    await this.ensureUniqueSmtpConfigurationName(companyId, dto.name);

    if (!dto.password?.trim()) {
      throw new BadRequestException('password is required');
    }

    const entity = this.reportSmtpConfigurationRepository.create({
      companyId,
      name: dto.name.trim(),
      host: dto.host.trim(),
      port: dto.port,
      securityType: dto.securityType,
      username: dto.username?.trim() || null,
      encryptedPassword: encryptReportSmtpSecret(dto.password),
      senderName: dto.senderName?.trim() || null,
      senderEmail: dto.senderEmail.trim(),
      replyToEmail: dto.replyToEmail?.trim() || null,
      connectionTimeoutMs: dto.connectionTimeoutMs ?? 10000,
      isActive: dto.isActive ?? true,
      isDefault: dto.isDefault ?? false,
      lastTestStatus: ReportSmtpTestStatusEnum.UNTESTED,
      lastTestedAt: null,
      lastTestError: null,
    });

    const saved = await this.reportSmtpConfigurationRepository.save(entity);
    await this.syncDefaultSmtpConfiguration(
      companyId,
      saved.id,
      saved.isDefault,
    );

    return this.findOneSmtpConfiguration(companyId, saved.id);
  }

  async findSmtpConfigurations(
    companyId: number,
    query: QueryReportSmtpConfigurationsDto,
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const direction = query.sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      name: 'name',
      host: 'host',
      sender_email: 'senderEmail',
    };
    const qb = this.reportSmtpConfigurationRepository
      .createQueryBuilder('smtp')
      .where('smtp.company_id = :companyId', { companyId });

    if (query.isActive !== undefined) {
      qb.andWhere('smtp.is_active = :isActive', { isActive: query.isActive });
    }

    if (query.isDefault !== undefined) {
      qb.andWhere('smtp.is_default = :isDefault', {
        isDefault: query.isDefault,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(smtp.name ILIKE :term OR smtp.host ILIKE :term OR smtp.sender_email ILIKE :term)',
        { term: `%${query.search.trim()}%` },
      );
    }

    const safeSortBy =
      sortFieldMap[query.sortBy ?? 'created_at'] ?? 'createdAt';
    const [items, total] = await qb
      .orderBy(`smtp.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapSmtpConfiguration(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneSmtpConfiguration(companyId: number, id: number) {
    const item = await this.findSmtpConfigurationOrFail(companyId, id);
    return this.mapSmtpConfiguration(item);
  }

  async updateSmtpConfiguration(
    companyId: number,
    id: number,
    dto: UpdateReportSmtpConfigurationDto,
  ) {
    const item = await this.findSmtpConfigurationOrFail(companyId, id);

    if (dto.name !== undefined && dto.name.trim() !== item.name) {
      await this.ensureUniqueSmtpConfigurationName(
        companyId,
        dto.name,
        item.id,
      );
      item.name = dto.name.trim();
    }

    if (dto.host !== undefined) item.host = dto.host.trim();
    if (dto.port !== undefined) item.port = dto.port;
    if (dto.securityType !== undefined) item.securityType = dto.securityType;
    if (dto.username !== undefined)
      item.username = dto.username?.trim() || null;
    if (dto.password !== undefined) {
      item.encryptedPassword = dto.password?.trim()
        ? encryptReportSmtpSecret(dto.password)
        : null;
    }
    if (dto.senderName !== undefined)
      item.senderName = dto.senderName?.trim() || null;
    if (dto.senderEmail !== undefined)
      item.senderEmail = dto.senderEmail.trim();
    if (dto.replyToEmail !== undefined)
      item.replyToEmail = dto.replyToEmail?.trim() || null;
    if (dto.connectionTimeoutMs !== undefined)
      item.connectionTimeoutMs = dto.connectionTimeoutMs;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    if (dto.isDefault !== undefined) item.isDefault = dto.isDefault;

    const saved = await this.reportSmtpConfigurationRepository.save(item);
    await this.syncDefaultSmtpConfiguration(
      companyId,
      saved.id,
      saved.isDefault,
    );

    return this.findOneSmtpConfiguration(companyId, saved.id);
  }

  async removeSmtpConfiguration(companyId: number, id: number) {
    const item = await this.findSmtpConfigurationOrFail(companyId, id);
    await this.reportSmtpConfigurationRepository.remove(item);
    return { message: 'SMTP configuration deleted successfully' };
  }

  async testSmtpConfiguration(
    companyId: number,
    id: number,
    dto: TestReportSmtpConfigurationDto,
  ) {
    const item = await this.findSmtpConfigurationOrFail(companyId, id);
    const password = decryptReportSmtpSecret(item.encryptedPassword);

    if (item.username && !password) {
      throw new BadRequestException(
        'SMTP password is missing for this configuration.',
      );
    }

    try {
      const nodemailerModule = await loadNodemailerModule();
      const transporter = nodemailerModule.createTransport({
        host: item.host,
        port: item.port,
        secure: item.securityType === ReportSmtpSecurityTypeEnum.SSL_TLS,
        requireTLS: item.securityType === ReportSmtpSecurityTypeEnum.STARTTLS,
        auth: item.username
          ? {
              user: item.username,
              pass: password ?? '',
            }
          : undefined,
      });

      await transporter.verify();

      let mailResult: ReportMailSendResult | null = null;
      if (dto.sendTestEmail ?? true) {
        const to = dto.toEmail ?? item.senderEmail;
        const mailOptions: ReportMailSendOptions = {
          from: `"${item.senderName || item.name}" <${item.senderEmail}>`,
          to,
          subject: 'Scheduled Reporting SMTP Test',
          text: 'This is a scheduled reporting SMTP test email.',
          mailSafetyContext: {
            sourceModule: 'ScheduledReportingService.testSmtpConfiguration',
          },
        };
        this.applyMailSafety(mailOptions);
        mailResult = await transporter.sendMail(mailOptions);
      }

      item.lastTestStatus = ReportSmtpTestStatusEnum.SUCCESS;
      item.lastTestedAt = new Date();
      item.lastTestError = null;
      await this.reportSmtpConfigurationRepository.save(item);

      return {
        status: 'success',
        testedAt: item.lastTestedAt,
        mailResponse: mailResult?.response ?? null,
        accepted: mailResult?.accepted ?? [],
        rejected: mailResult?.rejected ?? [],
        messageId: mailResult?.messageId ?? null,
      };
    } catch (error) {
      item.lastTestStatus = ReportSmtpTestStatusEnum.FAILED;
      item.lastTestedAt = new Date();
      item.lastTestError =
        error instanceof Error ? error.message : 'Unknown SMTP test failure';
      await this.reportSmtpConfigurationRepository.save(item);
      throw error;
    }
  }

  async createTemplate(companyId: number, dto: CreateReportTemplateDto) {
    await this.ensureUniqueTemplateName(companyId, dto.name);
    await this.ensureReportDefinition(companyId, dto.reportDefinitionId);
    if (dto.smtpConfigurationId) {
      await this.findSmtpConfigurationOrFail(
        companyId,
        dto.smtpConfigurationId,
      );
    }

    const entity = this.reportTemplateRepository.create({
      companyId,
      reportDefinitionId: dto.reportDefinitionId,
      smtpConfigurationId: dto.smtpConfigurationId ?? null,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      outputFormat: dto.outputFormat ?? null,
      filenamePattern: dto.filenamePattern?.trim() || null,
      emailSubjectTemplate: dto.emailSubjectTemplate?.trim() || null,
      emailBodyTemplate: dto.emailBodyTemplate ?? null,
      dateRangeStrategy: dto.dateRangeStrategy ?? null,
      dateRangeConfig: dto.dateRangeConfig ?? null,
      reportFilters: dto.reportFilters ?? null,
      attachReport: dto.attachReport ?? true,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.reportTemplateRepository.save(entity);
    await this.syncTemplateRecipients(
      companyId,
      saved.id,
      dto.recipients ?? [],
    );

    return this.findOneTemplate(companyId, saved.id);
  }

  async findTemplates(companyId: number, query: QueryReportTemplatesDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const direction = query.sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      name: 'name',
    };

    const qb = this.reportTemplateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.reportDefinition', 'reportDefinition')
      .leftJoinAndSelect('template.smtpConfiguration', 'smtpConfiguration')
      .where('template.company_id = :companyId', { companyId });

    if (query.reportDefinitionId) {
      qb.andWhere('template.report_definition_id = :reportDefinitionId', {
        reportDefinitionId: query.reportDefinitionId,
      });
    }

    if (query.smtpConfigurationId) {
      qb.andWhere('template.smtp_configuration_id = :smtpConfigurationId', {
        smtpConfigurationId: query.smtpConfigurationId,
      });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('template.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(template.name ILIKE :term OR template.description ILIKE :term OR reportDefinition.name ILIKE :term)',
        { term: `%${query.search.trim()}%` },
      );
    }

    const safeSortBy =
      sortFieldMap[query.sortBy ?? 'created_at'] ?? sortFieldMap.created_at;
    const [items, total] = await qb
      .orderBy(`template.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapTemplate(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneTemplate(companyId: number, id: number) {
    const item = await this.findTemplateOrFail(companyId, id, true);
    return this.mapTemplate(item, true);
  }

  async updateTemplate(
    companyId: number,
    id: number,
    dto: UpdateReportTemplateDto,
  ) {
    const item = await this.findTemplateOrFail(companyId, id, true);

    if (dto.name !== undefined && dto.name.trim() !== item.name) {
      await this.ensureUniqueTemplateName(companyId, dto.name, item.id);
      item.name = dto.name.trim();
    }

    if (dto.reportDefinitionId !== undefined) {
      await this.ensureReportDefinition(companyId, dto.reportDefinitionId);
      item.reportDefinitionId = dto.reportDefinitionId;
    }

    if (dto.smtpConfigurationId !== undefined) {
      if (dto.smtpConfigurationId) {
        await this.findSmtpConfigurationOrFail(
          companyId,
          dto.smtpConfigurationId,
        );
      }
      item.smtpConfigurationId = dto.smtpConfigurationId ?? null;
    }

    if (dto.description !== undefined)
      item.description = dto.description?.trim() || null;
    if (dto.outputFormat !== undefined)
      item.outputFormat = dto.outputFormat ?? null;
    if (dto.filenamePattern !== undefined)
      item.filenamePattern = dto.filenamePattern?.trim() || null;
    if (dto.emailSubjectTemplate !== undefined)
      item.emailSubjectTemplate = dto.emailSubjectTemplate?.trim() || null;
    if (dto.emailBodyTemplate !== undefined)
      item.emailBodyTemplate = dto.emailBodyTemplate ?? null;
    if (dto.dateRangeStrategy !== undefined)
      item.dateRangeStrategy = dto.dateRangeStrategy ?? null;
    if (dto.dateRangeConfig !== undefined)
      item.dateRangeConfig = dto.dateRangeConfig ?? null;
    if (dto.reportFilters !== undefined)
      item.reportFilters = dto.reportFilters ?? null;
    if (dto.attachReport !== undefined) item.attachReport = dto.attachReport;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    const saved = await this.reportTemplateRepository.save(item);

    if (dto.recipients !== undefined) {
      await this.syncTemplateRecipients(companyId, saved.id, dto.recipients);
    }

    return this.findOneTemplate(companyId, saved.id);
  }

  async removeTemplate(companyId: number, id: number) {
    const item = await this.findTemplateOrFail(companyId, id);
    const executionCount = await this.reportExecutionRepository.count({
      where: {
        companyId,
        templateId: id,
      },
    });

    if (executionCount > 0) {
      throw new ConflictException(
        'This template already has execution history. Deactivate it instead of deleting it.',
      );
    }

    await this.reportTemplateRepository.remove(item);
    return { message: 'Report template deleted successfully' };
  }

  async createSchedule(companyId: number, dto: CreateReportScheduleDto) {
    await this.ensureUniqueScheduleName(companyId, dto.name);
    await this.findTemplateOrFail(companyId, dto.templateId);

    const entity = this.reportScheduleRepository.create({
      companyId,
      templateId: dto.templateId,
      name: dto.name.trim(),
      scheduleType: dto.scheduleType,
      executionTime: dto.executionTime?.trim() || null,
      dayOfMonth: dto.dayOfMonth ?? null,
      timezone: dto.timezone?.trim() || 'Africa/Dar_es_Salaam',
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      oneTimeRunAt: dto.oneTimeRunAt ? new Date(dto.oneTimeRunAt) : null,
      cronExpression: dto.cronExpression?.trim() || null,
      misfireHandling: dto.misfireHandling,
      maxRetryAttempts: dto.maxRetryAttempts ?? 3,
      isActive: dto.isActive ?? true,
      pausedAt: null,
      nextRunAt: dto.oneTimeRunAt ? new Date(dto.oneTimeRunAt) : null,
    });

    const saved = await this.reportScheduleRepository.save(entity);
    await this.syncScheduleWeekdays(
      saved.id,
      dto.weekdays ?? [],
      dto.scheduleType,
    );

    return this.findOneSchedule(companyId, saved.id);
  }

  async findSchedules(companyId: number, query: QueryReportSchedulesDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const direction = query.sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      name: 'name',
      next_run_at: 'nextRunAt',
    };

    const qb = this.reportScheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.template', 'template')
      .where('schedule.company_id = :companyId', { companyId });

    if (query.templateId) {
      qb.andWhere('schedule.template_id = :templateId', {
        templateId: query.templateId,
      });
    }

    if (query.scheduleType) {
      qb.andWhere('schedule.schedule_type = :scheduleType', {
        scheduleType: query.scheduleType,
      });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('schedule.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere('(schedule.name ILIKE :term OR template.name ILIKE :term)', {
        term: `%${query.search.trim()}%`,
      });
    }

    const safeSortBy =
      sortFieldMap[query.sortBy ?? 'created_at'] ?? sortFieldMap.created_at;
    const [items, total] = await qb
      .orderBy(`schedule.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapSchedule(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneSchedule(companyId: number, id: number) {
    const item = await this.findScheduleOrFail(companyId, id, true);
    return this.mapSchedule(item, true);
  }

  async updateSchedule(
    companyId: number,
    id: number,
    dto: UpdateReportScheduleDto,
  ) {
    const item = await this.findScheduleOrFail(companyId, id, true);

    if (dto.name !== undefined && dto.name.trim() !== item.name) {
      await this.ensureUniqueScheduleName(companyId, dto.name, item.id);
      item.name = dto.name.trim();
    }

    if (dto.templateId !== undefined) {
      await this.findTemplateOrFail(companyId, dto.templateId);
      item.templateId = dto.templateId;
    }

    if (dto.scheduleType !== undefined) item.scheduleType = dto.scheduleType;
    if (dto.executionTime !== undefined)
      item.executionTime = dto.executionTime?.trim() || null;
    if (dto.dayOfMonth !== undefined) item.dayOfMonth = dto.dayOfMonth ?? null;
    if (dto.timezone !== undefined)
      item.timezone = dto.timezone?.trim() || 'Africa/Dar_es_Salaam';
    if (dto.startDate !== undefined) item.startDate = dto.startDate ?? null;
    if (dto.endDate !== undefined) item.endDate = dto.endDate ?? null;
    if (dto.oneTimeRunAt !== undefined) {
      item.oneTimeRunAt = dto.oneTimeRunAt ? new Date(dto.oneTimeRunAt) : null;
      item.nextRunAt = dto.oneTimeRunAt ? new Date(dto.oneTimeRunAt) : null;
    }
    if (dto.cronExpression !== undefined)
      item.cronExpression = dto.cronExpression?.trim() || null;
    if (dto.misfireHandling !== undefined)
      item.misfireHandling = dto.misfireHandling;
    if (dto.maxRetryAttempts !== undefined)
      item.maxRetryAttempts = dto.maxRetryAttempts;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    const saved = await this.reportScheduleRepository.save(item);

    if (dto.weekdays !== undefined || dto.scheduleType !== undefined) {
      await this.syncScheduleWeekdays(
        saved.id,
        dto.weekdays ?? saved.weekdays?.map((weekday) => weekday.weekday) ?? [],
        saved.scheduleType,
      );
    }

    return this.findOneSchedule(companyId, saved.id);
  }

  async removeSchedule(companyId: number, id: number) {
    const item = await this.findScheduleOrFail(companyId, id);
    await this.reportScheduleRepository.remove(item);
    return { message: 'Report schedule deleted successfully' };
  }

  async findExecutions(companyId: number, query: QueryReportExecutionsDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const direction = query.sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      started_at: 'startedAt',
      completed_at: 'completedAt',
    };

    const qb = this.reportExecutionRepository
      .createQueryBuilder('execution')
      .leftJoinAndSelect('execution.template', 'template')
      .leftJoinAndSelect('execution.reportDefinition', 'reportDefinition')
      .leftJoinAndSelect('execution.schedule', 'schedule')
      .leftJoinAndSelect('execution.smtpConfiguration', 'smtpConfiguration')
      .where('execution.company_id = :companyId', { companyId });

    if (query.templateId) {
      qb.andWhere('execution.template_id = :templateId', {
        templateId: query.templateId,
      });
    }

    if (query.scheduleId) {
      qb.andWhere('execution.schedule_id = :scheduleId', {
        scheduleId: query.scheduleId,
      });
    }

    if (query.status) {
      qb.andWhere('execution.status = :status', { status: query.status });
    }

    if (query.emailDeliveryStatus) {
      qb.andWhere('execution.email_delivery_status = :emailDeliveryStatus', {
        emailDeliveryStatus: query.emailDeliveryStatus,
      });
    }

    if (query.source) {
      qb.andWhere('execution.source = :source', { source: query.source });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(template.name ILIKE :term OR reportDefinition.name ILIKE :term OR execution.generated_filename ILIKE :term)',
        { term: `%${query.search.trim()}%` },
      );
    }

    const safeSortBy =
      sortFieldMap[query.sortBy ?? 'created_at'] ?? sortFieldMap.created_at;
    const [items, total] = await qb
      .orderBy(`execution.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapExecution(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneExecution(companyId: number, id: number) {
    const item = await this.reportExecutionRepository.findOne({
      where: {
        id,
        companyId,
      },
      relations: {
        template: true,
        reportDefinition: true,
        schedule: true,
        smtpConfiguration: true,
        resolvedRecipients: true,
        attempts: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Report execution not found');
    }

    return this.mapExecution(item, true);
  }

  private async findSmtpConfigurationOrFail(companyId: number, id: number) {
    const item = await this.reportSmtpConfigurationRepository.findOne({
      where: {
        id,
        companyId,
      },
    });

    if (!item) {
      throw new NotFoundException('SMTP configuration not found');
    }

    return item;
  }

  private async findTemplateOrFail(
    companyId: number,
    id: number,
    withRelations = false,
  ) {
    const item = await this.reportTemplateRepository.findOne({
      where: {
        id,
        companyId,
      },
      relations: withRelations
        ? {
            reportDefinition: true,
            smtpConfiguration: true,
            recipients: true,
            schedules: {
              weekdays: true,
            },
          }
        : undefined,
    });

    if (!item) {
      throw new NotFoundException('Report template not found');
    }

    return item;
  }

  private async findScheduleOrFail(
    companyId: number,
    id: number,
    withRelations = false,
  ) {
    const item = await this.reportScheduleRepository.findOne({
      where: {
        id,
        companyId,
      },
      relations: withRelations
        ? {
            template: true,
            weekdays: true,
          }
        : undefined,
    });

    if (!item) {
      throw new NotFoundException('Report schedule not found');
    }

    return item;
  }

  private async ensureReportDefinition(companyId: number, id: number) {
    void companyId;
    const definition = await this.reportDefinitionRepository.findOne({
      where: {
        id,
      },
    });

    if (!definition) {
      throw new NotFoundException('Report definition not found');
    }

    return definition;
  }

  private async ensureUniqueSmtpConfigurationName(
    companyId: number,
    name: string,
    excludeId?: number,
  ) {
    const existing = await this.reportSmtpConfigurationRepository.findOne({
      where: {
        companyId,
        name: name.trim(),
      },
      select: ['id'],
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'SMTP configuration name already exists in this company.',
      );
    }
  }

  private async ensureUniqueTemplateName(
    companyId: number,
    name: string,
    excludeId?: number,
  ) {
    const existing = await this.reportTemplateRepository.findOne({
      where: {
        companyId,
        name: name.trim(),
      },
      select: ['id'],
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Report template name already exists in this company.',
      );
    }
  }

  private async ensureUniqueScheduleName(
    companyId: number,
    name: string,
    excludeId?: number,
  ) {
    const existing = await this.reportScheduleRepository.findOne({
      where: {
        companyId,
        name: name.trim(),
      },
      select: ['id'],
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Report schedule name already exists in this company.',
      );
    }
  }

  private async syncDefaultSmtpConfiguration(
    companyId: number,
    smtpConfigurationId: number,
    isDefault: boolean,
  ) {
    if (!isDefault) {
      return;
    }

    await this.reportSmtpConfigurationRepository
      .createQueryBuilder()
      .update(ReportSmtpConfiguration)
      .set({ isDefault: false })
      .where('company_id = :companyId', { companyId })
      .andWhere('id <> :id', { id: smtpConfigurationId })
      .execute();
  }

  private async syncTemplateRecipients(
    companyId: number,
    templateId: number,
    recipients: CreateReportTemplateRecipientDto[],
  ) {
    await this.reportTemplateRecipientRepository.delete({
      companyId,
      templateId,
    });

    if (!recipients.length) {
      return;
    }

    const entities = recipients.map((recipient) =>
      this.reportTemplateRecipientRepository.create({
        companyId,
        templateId,
        channel: recipient.channel,
        recipientType: recipient.recipientType,
        targetKey: this.buildRecipientTargetKey(recipient),
        emailAddress: recipient.emailAddress?.trim() || null,
        companyUserId: recipient.companyUserId ?? null,
        employeeId: recipient.employeeId ?? null,
        roleId: recipient.roleId ?? null,
        departmentId: recipient.departmentId ?? null,
        dynamicGroupCode: recipient.dynamicGroupCode?.trim() || null,
        displayName: recipient.displayName?.trim() || null,
      }),
    );

    await this.reportTemplateRecipientRepository.save(entities);
  }

  private async syncScheduleWeekdays(
    scheduleId: number,
    weekdays: ReportWeekdayEnum[],
    scheduleType: ReportScheduleTypeEnum,
  ) {
    await this.reportScheduleWeekdayRepository.delete({
      scheduleId,
    });

    if (scheduleType !== ReportScheduleTypeEnum.WEEKLY || !weekdays.length) {
      return;
    }

    const uniqueWeekdays = Array.from(new Set(weekdays));
    const entities = uniqueWeekdays.map((weekday) =>
      this.reportScheduleWeekdayRepository.create({
        scheduleId,
        weekday,
      }),
    );

    await this.reportScheduleWeekdayRepository.save(entities);
  }

  private buildRecipientTargetKey(recipient: CreateReportTemplateRecipientDto) {
    switch (recipient.recipientType) {
      case ReportRecipientTypeEnum.EMAIL: {
        const email = recipient.emailAddress?.trim().toLowerCase();
        if (!email) {
          throw new BadRequestException(
            'emailAddress is required for EMAIL recipients.',
          );
        }
        return `email:${email}`;
      }
      case ReportRecipientTypeEnum.COMPANY_USER:
        if (!recipient.companyUserId) {
          throw new BadRequestException(
            'companyUserId is required for COMPANY_USER recipients.',
          );
        }
        return `company_user:${recipient.companyUserId}`;
      case ReportRecipientTypeEnum.EMPLOYEE:
        if (!recipient.employeeId) {
          throw new BadRequestException(
            'employeeId is required for EMPLOYEE recipients.',
          );
        }
        return `employee:${recipient.employeeId}`;
      case ReportRecipientTypeEnum.ROLE:
        if (!recipient.roleId) {
          throw new BadRequestException(
            'roleId is required for ROLE recipients.',
          );
        }
        return `role:${recipient.roleId}`;
      case ReportRecipientTypeEnum.DEPARTMENT:
        if (!recipient.departmentId) {
          throw new BadRequestException(
            'departmentId is required for DEPARTMENT recipients.',
          );
        }
        return `department:${recipient.departmentId}`;
      case ReportRecipientTypeEnum.DEPARTMENT_MANAGER:
        if (!recipient.departmentId) {
          throw new BadRequestException(
            'departmentId is required for DEPARTMENT_MANAGER recipients.',
          );
        }
        return `department_manager:${recipient.departmentId}`;
      case ReportRecipientTypeEnum.DYNAMIC_GROUP:
        if (!recipient.dynamicGroupCode?.trim()) {
          throw new BadRequestException(
            'dynamicGroupCode is required for DYNAMIC_GROUP recipients.',
          );
        }
        return `dynamic_group:${recipient.dynamicGroupCode.trim().toLowerCase()}`;
      default:
        throw new BadRequestException('Unsupported recipient type.');
    }
  }

  private mapDefinition(definition: ReportDefinition) {
    return {
      id: definition.id,
      reportCode: definition.reportCode,
      name: definition.name,
      description: definition.description,
      supportedFilters: definition.supportedFilters,
      supportedFormats: definition.supportedFormats,
      generatorService: definition.generatorService,
      isActive: definition.isActive,
      isRunnableNow: definition.reportCode === 'ATTENDANCE_SUMMARY',
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
    };
  }

  private mapSmtpConfiguration(configuration: ReportSmtpConfiguration) {
    return {
      id: configuration.id,
      companyId: configuration.companyId,
      name: configuration.name,
      host: configuration.host,
      port: configuration.port,
      securityType: configuration.securityType,
      username: configuration.username,
      hasPassword: Boolean(configuration.encryptedPassword),
      senderName: configuration.senderName,
      senderEmail: configuration.senderEmail,
      replyToEmail: configuration.replyToEmail,
      connectionTimeoutMs: configuration.connectionTimeoutMs,
      isActive: configuration.isActive,
      isDefault: configuration.isDefault,
      lastTestStatus: configuration.lastTestStatus,
      lastTestedAt: configuration.lastTestedAt,
      lastTestError: configuration.lastTestError,
      createdAt: configuration.createdAt,
      updatedAt: configuration.updatedAt,
    };
  }

  private mapRecipient(
    recipient: ReportTemplateRecipient | ReportExecutionRecipient,
  ) {
    const typedRecipient = recipient as Partial<ReportTemplateRecipient> &
      Partial<ReportExecutionRecipient>;

    return {
      id: typedRecipient.id,
      channel: typedRecipient.channel,
      recipientType:
        typedRecipient.recipientType ?? typedRecipient.sourceType ?? null,
      targetKey: typedRecipient.targetKey ?? null,
      emailAddress: typedRecipient.emailAddress ?? null,
      companyUserId: typedRecipient.companyUserId ?? null,
      employeeId: typedRecipient.employeeId ?? null,
      roleId: typedRecipient.roleId ?? null,
      departmentId: typedRecipient.departmentId ?? null,
      dynamicGroupCode: typedRecipient.dynamicGroupCode ?? null,
      displayName: typedRecipient.displayName ?? null,
      sourceLabel: typedRecipient.sourceLabel ?? null,
      deliveryStatus:
        typedRecipient.deliveryStatus ?? ReportEmailDeliveryStatusEnum.PENDING,
      errorMessage: typedRecipient.errorMessage ?? null,
      createdAt: typedRecipient.createdAt ?? null,
      updatedAt:
        'updatedAt' in typedRecipient
          ? (typedRecipient.updatedAt ?? null)
          : null,
    };
  }

  private mapTemplate(template: ReportTemplate, includeRelations = false) {
    return {
      id: template.id,
      companyId: template.companyId,
      reportDefinitionId: template.reportDefinitionId,
      smtpConfigurationId: template.smtpConfigurationId,
      name: template.name,
      description: template.description,
      outputFormat: template.outputFormat,
      filenamePattern: template.filenamePattern,
      emailSubjectTemplate: template.emailSubjectTemplate,
      emailBodyTemplate: template.emailBodyTemplate,
      dateRangeStrategy: template.dateRangeStrategy,
      dateRangeConfig: template.dateRangeConfig,
      reportFilters: template.reportFilters,
      attachReport: template.attachReport,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      reportDefinition: template.reportDefinition
        ? this.mapDefinition(template.reportDefinition)
        : null,
      smtpConfiguration: template.smtpConfiguration
        ? this.mapSmtpConfiguration(template.smtpConfiguration)
        : null,
      recipients: includeRelations
        ? (template.recipients ?? []).map((recipient) =>
            this.mapRecipient(recipient),
          )
        : undefined,
      schedules: includeRelations
        ? (template.schedules ?? []).map((schedule) =>
            this.mapSchedule(schedule, true),
          )
        : undefined,
    };
  }

  private mapSchedule(schedule: ReportSchedule, includeRelations = false) {
    return {
      id: schedule.id,
      companyId: schedule.companyId,
      templateId: schedule.templateId,
      name: schedule.name,
      scheduleType: schedule.scheduleType,
      executionTime: schedule.executionTime,
      dayOfMonth: schedule.dayOfMonth,
      timezone: schedule.timezone,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      oneTimeRunAt: schedule.oneTimeRunAt,
      cronExpression: schedule.cronExpression,
      misfireHandling: schedule.misfireHandling,
      maxRetryAttempts: schedule.maxRetryAttempts,
      isActive: schedule.isActive,
      pausedAt: schedule.pausedAt,
      lastRunAt: schedule.lastRunAt,
      nextRunAt: schedule.nextRunAt,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
      weekdays:
        schedule.weekdays?.map((weekday) => weekday.weekday) ??
        ([] as ReportWeekdayEnum[]),
      template:
        includeRelations && schedule.template
          ? {
              id: schedule.template.id,
              name: schedule.template.name,
            }
          : undefined,
    };
  }

  private mapExecutionAttempt(attempt: ReportExecutionAttempt) {
    return {
      id: attempt.id,
      executionId: attempt.executionId,
      attemptNumber: attempt.attemptNumber,
      phase: attempt.phase,
      status: attempt.status,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      errorMessage: attempt.errorMessage,
      technicalDetails: attempt.technicalDetails,
      metadata: attempt.metadata,
      createdAt: attempt.createdAt,
    };
  }

  private mapExecution(execution: ReportExecution, includeRelations = false) {
    return {
      id: execution.id,
      companyId: execution.companyId,
      templateId: execution.templateId,
      scheduleId: execution.scheduleId,
      reportDefinitionId: execution.reportDefinitionId,
      smtpConfigurationId: execution.smtpConfigurationId,
      source: execution.source,
      status: execution.status,
      emailDeliveryStatus: execution.emailDeliveryStatus,
      idempotencyKey: execution.idempotencyKey,
      queueJobId: execution.queueJobId,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      reportDateFrom: execution.reportDateFrom,
      reportDateTo: execution.reportDateTo,
      appliedFilters: execution.appliedFilters,
      executionMetadata: execution.executionMetadata,
      generatedFilename: execution.generatedFilename,
      generatedFilePath: execution.generatedFilePath,
      generatedFileMimeType: execution.generatedFileMimeType,
      generatedFileSize: execution.generatedFileSize,
      recordCount: execution.recordCount,
      retryCount: execution.retryCount,
      maxRetryAttempts: execution.maxRetryAttempts,
      errorMessage: execution.errorMessage,
      technicalDetails: execution.technicalDetails,
      triggeredByCompanyUserId: execution.triggeredByCompanyUserId,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
      template: execution.template
        ? {
            id: execution.template.id,
            name: execution.template.name,
          }
        : null,
      schedule: execution.schedule
        ? {
            id: execution.schedule.id,
            name: execution.schedule.name,
          }
        : null,
      reportDefinition: execution.reportDefinition
        ? this.mapDefinition(execution.reportDefinition)
        : null,
      smtpConfiguration: execution.smtpConfiguration
        ? this.mapSmtpConfiguration(execution.smtpConfiguration)
        : null,
      resolvedRecipients: includeRelations
        ? (execution.resolvedRecipients ?? []).map((recipient) =>
            this.mapRecipient(recipient),
          )
        : undefined,
      attempts: includeRelations
        ? (execution.attempts ?? [])
            .sort((left, right) => left.attemptNumber - right.attemptNumber)
            .map((attempt) => this.mapExecutionAttempt(attempt))
        : undefined,
    };
  }

  private applyMailSafety(options: SafeSendMailOptions) {
    applyMailRecipientSafety(
      options,
      resolveMailRecipientSafetyConfigFromConfigService(this.configService),
      this.logger,
    );
  }
}
