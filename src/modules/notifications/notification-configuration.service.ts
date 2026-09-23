import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { NotificationRuleQueryDto } from './dto/notification-rule-query.dto';
import { NotificationTemplateQueryDto } from './dto/notification-template-query.dto';
import {
  UpdateNotificationRuleDto,
  UpsertNotificationRuleDto,
} from './dto/upsert-notification-rule.dto';
import {
  UpdateNotificationTemplateDto,
  UpsertNotificationTemplateDto,
} from './dto/upsert-notification-template.dto';
import { NotificationRule } from './entities/notification-rule.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationPriorityEnum } from './enums/notification-priority.enum';
import { NotificationTemplateStatusEnum } from './enums/notification-template-status.enum';

type TemplateVariables = Record<string, unknown>;

@Injectable()
export class NotificationConfigurationService {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templateRepository: Repository<NotificationTemplate>,
    @InjectRepository(NotificationRule)
    private readonly ruleRepository: Repository<NotificationRule>,
  ) {}

  async listTemplates(companyId: number, query: NotificationTemplateQueryDto) {
    const qb = this.templateRepository.createQueryBuilder('template').where(
      new Brackets((where) => {
        where
          .where('template.companyId = :companyId', { companyId })
          .orWhere('template.companyId IS NULL');
      }),
    );

    if (query.status) {
      qb.andWhere('template.status = :status', { status: query.status });
    }

    if (query.template_code?.trim()) {
      qb.andWhere('template.templateCode = :templateCode', {
        templateCode: query.template_code.trim(),
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        `(
          LOWER(template.templateCode) LIKE :search OR
          LOWER(template.title) LIKE :search OR
          LOWER(template.systemMessage) LIKE :search
        )`,
        { search: `%${query.search.trim().toLowerCase()}%` },
      );
    }

    return qb
      .orderBy('template.companyId', 'DESC', 'NULLS LAST')
      .addOrderBy('template.templateCode', 'ASC')
      .getMany();
  }

  async getTemplate(companyId: number, id: number) {
    const template = await this.templateRepository.findOne({
      where: [
        { id, companyId },
        { id, companyId: IsNull() },
      ],
    });

    if (!template) {
      throw new NotFoundException('Notification template not found.');
    }

    return template;
  }

  async createTemplate(companyId: number, dto: UpsertNotificationTemplateDto) {
    const template = this.templateRepository.create({
      companyId,
      templateCode: dto.template_code.trim(),
      title: dto.title.trim(),
      emailSubject: this.trimOptional(dto.email_subject),
      systemMessage: dto.system_message.trim(),
      emailBody: this.trimOptional(dto.email_body),
      mobileMessage: this.trimOptional(dto.mobile_message),
      availableVariables: this.normalizeVariables(dto.available_variables),
      status: dto.status ?? NotificationTemplateStatusEnum.ACTIVE,
    });

    return this.templateRepository.save(template);
  }

  async updateTemplate(
    companyId: number,
    id: number,
    dto: UpdateNotificationTemplateDto,
  ) {
    const template = await this.getTemplate(companyId, id);

    if (template.companyId === null) {
      const clone = this.templateRepository.create({
        ...template,
        id: undefined,
        companyId,
      });
      Object.assign(clone, this.templatePatch(dto));
      return this.templateRepository.save(clone);
    }

    Object.assign(template, this.templatePatch(dto));
    return this.templateRepository.save(template);
  }

  async resolveTemplate(
    companyId: number,
    templateCode: string,
  ): Promise<NotificationTemplate | null> {
    const code = templateCode.trim();
    if (!code) {
      return null;
    }

    return this.templateRepository
      .createQueryBuilder('template')
      .where('template.templateCode = :code', { code })
      .andWhere(
        new Brackets((where) => {
          where
            .where('template.companyId = :companyId', { companyId })
            .orWhere('template.companyId IS NULL');
        }),
      )
      .andWhere('template.status = :status', {
        status: NotificationTemplateStatusEnum.ACTIVE,
      })
      .orderBy('template.companyId', 'DESC', 'NULLS LAST')
      .getOne();
  }

  async renderTemplate(
    companyId: number,
    templateCode: string,
    variables: TemplateVariables,
  ) {
    const template = await this.resolveTemplate(companyId, templateCode);
    if (!template) {
      return null;
    }

    return {
      template,
      title: this.renderText(template.title, variables),
      systemMessage: this.renderText(template.systemMessage, variables),
      emailSubject: template.emailSubject
        ? this.renderText(template.emailSubject, variables)
        : null,
      emailBody: template.emailBody
        ? this.renderText(template.emailBody, variables)
        : null,
      mobileMessage: template.mobileMessage
        ? this.renderText(template.mobileMessage, variables)
        : null,
    };
  }

  async listRules(companyId: number, query: NotificationRuleQueryDto) {
    const qb = this.ruleRepository.createQueryBuilder('rule').where(
      new Brackets((where) => {
        where
          .where('rule.companyId = :companyId', { companyId })
          .orWhere('rule.companyId IS NULL');
      }),
    );

    if (query.notification_type?.trim()) {
      qb.andWhere('rule.notificationType = :notificationType', {
        notificationType: query.notification_type.trim(),
      });
    }

    if (query.trigger_event?.trim()) {
      qb.andWhere('rule.triggerEvent = :triggerEvent', {
        triggerEvent: query.trigger_event.trim(),
      });
    }

    if (query.related_module?.trim()) {
      qb.andWhere('rule.relatedModule = :relatedModule', {
        relatedModule: query.related_module.trim(),
      });
    }

    if (typeof query.enabled === 'boolean') {
      qb.andWhere('rule.enabled = :enabled', { enabled: query.enabled });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        `(
          LOWER(rule.notificationType) LIKE :search OR
          LOWER(rule.triggerEvent) LIKE :search OR
          LOWER(rule.recipientType) LIKE :search OR
          LOWER(COALESCE(rule.relatedModule, '')) LIKE :search
        )`,
        { search: `%${query.search.trim().toLowerCase()}%` },
      );
    }

    return qb
      .orderBy('rule.companyId', 'DESC', 'NULLS LAST')
      .addOrderBy('rule.relatedModule', 'ASC')
      .addOrderBy('rule.notificationType', 'ASC')
      .getMany();
  }

  async getRule(companyId: number, id: number) {
    const rule = await this.ruleRepository.findOne({
      where: [
        { id, companyId },
        { id, companyId: IsNull() },
      ],
    });

    if (!rule) {
      throw new NotFoundException('Notification rule not found.');
    }

    return rule;
  }

  async createRule(companyId: number, dto: UpsertNotificationRuleDto) {
    const rule = this.ruleRepository.create({
      companyId,
      notificationType: dto.notification_type.trim(),
      triggerEvent: dto.trigger_event.trim(),
      relatedModule: this.trimOptional(dto.related_module),
      reminderBeforeMinutes: dto.reminder_before_minutes ?? null,
      reminderAfterMinutes: dto.reminder_after_minutes ?? null,
      escalationAfterMinutes: dto.escalation_after_minutes ?? null,
      repeatIntervalMinutes: dto.repeat_interval_minutes ?? null,
      recipientType: dto.recipient_type.trim(),
      channels: this.normalizeChannels(dto.channels),
      priority: dto.priority ?? NotificationPriorityEnum.MEDIUM,
      enabled: dto.enabled ?? true,
      metadata: dto.metadata ?? null,
    });

    return this.ruleRepository.save(rule);
  }

  async updateRule(
    companyId: number,
    id: number,
    dto: UpdateNotificationRuleDto,
  ) {
    const rule = await this.getRule(companyId, id);

    if (rule.companyId === null) {
      const clone = this.ruleRepository.create({
        ...rule,
        id: undefined,
        companyId,
      });
      Object.assign(clone, this.rulePatch(dto));
      return this.ruleRepository.save(clone);
    }

    Object.assign(rule, this.rulePatch(dto));
    return this.ruleRepository.save(rule);
  }

  private templatePatch(dto: UpdateNotificationTemplateDto) {
    return {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.email_subject !== undefined
        ? { emailSubject: this.trimOptional(dto.email_subject) }
        : {}),
      ...(dto.system_message !== undefined
        ? { systemMessage: dto.system_message.trim() }
        : {}),
      ...(dto.email_body !== undefined
        ? { emailBody: this.trimOptional(dto.email_body) }
        : {}),
      ...(dto.mobile_message !== undefined
        ? { mobileMessage: this.trimOptional(dto.mobile_message) }
        : {}),
      ...(dto.available_variables !== undefined
        ? {
            availableVariables: this.normalizeVariables(
              dto.available_variables,
            ),
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
  }

  private rulePatch(dto: UpdateNotificationRuleDto) {
    return {
      ...(dto.trigger_event !== undefined
        ? { triggerEvent: dto.trigger_event.trim() }
        : {}),
      ...(dto.related_module !== undefined
        ? { relatedModule: this.trimOptional(dto.related_module) }
        : {}),
      ...(dto.reminder_before_minutes !== undefined
        ? { reminderBeforeMinutes: dto.reminder_before_minutes }
        : {}),
      ...(dto.reminder_after_minutes !== undefined
        ? { reminderAfterMinutes: dto.reminder_after_minutes }
        : {}),
      ...(dto.escalation_after_minutes !== undefined
        ? { escalationAfterMinutes: dto.escalation_after_minutes }
        : {}),
      ...(dto.repeat_interval_minutes !== undefined
        ? { repeatIntervalMinutes: dto.repeat_interval_minutes }
        : {}),
      ...(dto.recipient_type !== undefined
        ? { recipientType: dto.recipient_type.trim() }
        : {}),
      ...(dto.channels !== undefined
        ? { channels: this.normalizeChannels(dto.channels) }
        : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
    };
  }

  private normalizeChannels(channels: NotificationChannelEnum[]) {
    return Array.from(new Set(channels));
  }

  private normalizeVariables(variables: string[] | undefined) {
    return Array.from(
      new Set(
        (variables ?? []).map((variable) => variable.trim()).filter(Boolean),
      ),
    );
  }

  private renderText(template: string, variables: TemplateVariables): string {
    return template.replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (_match: string, key: string) => {
        const value: unknown = variables[key];
        return this.renderValue(value);
      },
    );
  }

  private renderValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private trimOptional(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
