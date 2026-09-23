import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import {
  applyMailRecipientSafety,
  resolveMailRecipientSafetyConfigFromEnv,
  type SafeSendMailOptions,
} from '../../mail/mail-recipient-safety.util';
import { FilesService } from '../../files/files.service';
import { ReportDefinition } from '../entities/report-definition.entity';
import { ReportExecution } from '../entities/report-execution.entity';
import { ReportExecutionAttempt } from '../entities/report-execution-attempt.entity';
import { ReportExecutionRecipient } from '../entities/report-execution-recipient.entity';
import { ReportSmtpConfiguration } from '../entities/report-smtp-configuration.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import { ReportTemplateRecipient } from '../entities/report-template-recipient.entity';
import { ReportAttemptStatusEnum } from '../enums/report-attempt-status.enum';
import { ReportEmailDeliveryStatusEnum } from '../enums/report-email-delivery-status.enum';
import { ReportExecutionAttemptPhaseEnum } from '../enums/report-execution-attempt-phase.enum';
import { ReportExecutionStatusEnum } from '../enums/report-execution-status.enum';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRecipientChannelEnum } from '../enums/report-recipient-channel.enum';
import { ReportRecipientTypeEnum } from '../enums/report-recipient-type.enum';
import { ReportSmtpSecurityTypeEnum } from '../enums/report-smtp-security-type.enum';
import { decryptReportSmtpSecret } from '../utils/report-smtp-secret.util';
import { ReportRegistryService } from './report-registry.service';

export const REPORT_EXECUTION_WORKER_LOCK_KEY = 'scheduled-reporting:worker';

type ResolvedRecipient = {
  email: string;
  displayName: string | null;
  targetKey: string;
};

type NodemailerSendResult = {
  accepted: string[];
  rejected: string[];
  response: string;
  messageId: string;
};

type NodemailerTransporter = {
  sendMail(options: SafeSendMailOptions): Promise<NodemailerSendResult>;
};

type NodemailerModule = {
  createTransport(options: {
    host: string;
    port: number;
    secure: boolean;
    requireTLS: boolean;
    auth?: { user: string; pass: string };
  }): NodemailerTransporter;
};

async function loadNodemailer(): Promise<NodemailerModule> {
  return (await import('nodemailer')) as unknown as NodemailerModule;
}

@Injectable()
export class ReportExecutionWorkerService {
  private readonly logger = new Logger(ReportExecutionWorkerService.name);

  constructor(
    @InjectRepository(ReportExecution)
    private readonly executionRepository: Repository<ReportExecution>,
    @InjectRepository(ReportTemplate)
    private readonly templateRepository: Repository<ReportTemplate>,
    @InjectRepository(ReportDefinition)
    private readonly reportDefinitionRepository: Repository<ReportDefinition>,
    @InjectRepository(ReportSmtpConfiguration)
    private readonly smtpConfigurationRepository: Repository<ReportSmtpConfiguration>,
    @InjectRepository(ReportTemplateRecipient)
    private readonly templateRecipientRepository: Repository<ReportTemplateRecipient>,
    @InjectRepository(ReportExecutionRecipient)
    private readonly executionRecipientRepository: Repository<ReportExecutionRecipient>,
    @InjectRepository(ReportExecutionAttempt)
    private readonly executionAttemptRepository: Repository<ReportExecutionAttempt>,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    private readonly reportRegistryService: ReportRegistryService,
    private readonly filesService: FilesService,
  ) {}

  @Interval(15000)
  async dispatch(): Promise<void> {
    await this.advisoryLockService.runWithLock(
      REPORT_EXECUTION_WORKER_LOCK_KEY,
      async () => this.processDue(),
    );
  }

  private async processDue(): Promise<void> {
    const executions = await this.executionRepository.find({
      where: { status: ReportExecutionStatusEnum.PENDING },
      order: { id: 'ASC' },
      take: 10,
    });

    for (const execution of executions) {
      await this.runOne(execution.id);
    }
  }

  private async runOne(executionId: number): Promise<void> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    if (!execution || execution.status !== ReportExecutionStatusEnum.PENDING) {
      return;
    }

    execution.status = ReportExecutionStatusEnum.GENERATING;
    execution.startedAt = new Date();
    await this.executionRepository.save(execution);

    let template: ReportTemplate | null = null;

    try {
      template = await this.templateRepository.findOne({
        where: { id: execution.templateId },
      });

      if (!template) {
        throw new Error('Report template no longer exists');
      }

      const reportDefinition = await this.reportDefinitionRepository.findOne({
        where: {
          id: execution.reportDefinitionId ?? template.reportDefinitionId,
        },
      });

      if (!reportDefinition) {
        throw new Error('Report definition no longer exists');
      }

      const runner = this.reportRegistryService.requireRunner(
        reportDefinition.reportCode,
      );

      const outputFormat =
        (execution.executionMetadata?.requestedOutputFormat as
          | ReportOutputFormatEnum
          | undefined) ??
        template.outputFormat ??
        ReportOutputFormatEnum.CSV;

      const result = await runner.generate({
        reportCode: reportDefinition.reportCode,
        companyId: execution.companyId,
        outputFormat,
        filenamePattern:
          template.filenamePattern ??
          `${reportDefinition.reportCode}-{{reportDate}}`,
        reportFilters: execution.appliedFilters ?? null,
        dateFrom: execution.reportDateFrom,
        dateTo: execution.reportDateTo,
      });

      const stored = await this.filesService.savePrivateBufferFile({
        buffer: result.buffer,
        fileName: result.filename,
        fileSize: result.buffer.byteLength,
        mimeType: result.mimeType,
        directorySegments: ['scheduled-reports', String(execution.companyId)],
      });

      await this.executionAttemptRepository.save(
        this.executionAttemptRepository.create({
          executionId: execution.id,
          attemptNumber: execution.retryCount + 1,
          phase: ReportExecutionAttemptPhaseEnum.GENERATION,
          status: ReportAttemptStatusEnum.SUCCESS,
          startedAt: execution.startedAt ?? new Date(),
          completedAt: new Date(),
          metadata: {
            filename: result.filename,
            mimeType: result.mimeType,
            recordCount: result.recordCount,
          },
        }),
      );

      execution.status = ReportExecutionStatusEnum.GENERATED;
      execution.generatedFilename = result.filename;
      execution.generatedFilePath = stored.publicPath;
      execution.generatedFileMimeType = result.mimeType;
      execution.generatedFileSize = String(result.buffer.byteLength);
      execution.recordCount = result.recordCount;
      execution.errorMessage = null;
      execution.technicalDetails = null;
      await this.executionRepository.save(execution);

      await this.deliverByEmail(
        execution,
        template,
        result.buffer,
        result.mimeType,
      );
    } catch (error) {
      this.logger.error(
        `Report execution ${executionId} failed: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );

      execution.status = ReportExecutionStatusEnum.FAILED;
      execution.completedAt = new Date();
      execution.errorMessage =
        error instanceof Error ? error.message : 'Report execution failed';
      execution.technicalDetails =
        error instanceof Error ? (error.stack ?? error.message) : null;

      await this.executionRepository.save(execution);
    }
  }

  private async deliverByEmail(
    execution: ReportExecution,
    template: ReportTemplate,
    attachmentBuffer: Buffer,
    attachmentMimeType: string,
  ): Promise<void> {
    if (!template.attachReport) {
      execution.status = ReportExecutionStatusEnum.GENERATED;
      execution.emailDeliveryStatus = ReportEmailDeliveryStatusEnum.SKIPPED;
      execution.completedAt = new Date();
      await this.executionRepository.save(execution);
      return;
    }

    const recipients = await this.resolveRecipients(template.id);

    if (recipients.length === 0) {
      execution.status = ReportExecutionStatusEnum.GENERATED;
      execution.emailDeliveryStatus = ReportEmailDeliveryStatusEnum.SKIPPED;
      execution.completedAt = new Date();
      await this.executionRepository.save(execution);
      return;
    }

    const smtpConfiguration = template.smtpConfigurationId
      ? await this.smtpConfigurationRepository.findOne({
          where: {
            id: template.smtpConfigurationId,
            companyId: execution.companyId,
            isActive: true,
          },
        })
      : null;

    if (!smtpConfiguration) {
      const errorMessage =
        'Scheduled reports require an active SMTP configuration for this company. Shared system SMTP is not used.';
      this.logger.warn(`Report execution ${execution.id}: ${errorMessage}`);
      execution.status = ReportExecutionStatusEnum.FAILED;
      execution.emailDeliveryStatus = ReportEmailDeliveryStatusEnum.FAILED;
      execution.errorMessage = errorMessage;
      execution.completedAt = new Date();
      await this.executionAttemptRepository.save(
        this.executionAttemptRepository.create({
          executionId: execution.id,
          attemptNumber: execution.retryCount + 1,
          phase: ReportExecutionAttemptPhaseEnum.EMAIL_DELIVERY,
          status: ReportAttemptStatusEnum.FAILED,
          startedAt: new Date(),
          completedAt: new Date(),
          errorMessage,
        }),
      );
      await this.executionRepository.save(execution);
      return;
    }

    const smtpPassword = decryptReportSmtpSecret(
      smtpConfiguration.encryptedPassword,
    );

    const subject = this.renderTemplateString(
      template.emailSubjectTemplate ?? 'Scheduled Report - {{reportDate}}',
      { reportDate: execution.reportDateTo ?? execution.reportDateFrom ?? '' },
    );
    const html = this.renderTemplateString(
      template.emailBodyTemplate ??
        '<p>Please find the attached scheduled report.</p>',
      { reportDate: execution.reportDateTo ?? execution.reportDateFrom ?? '' },
    );

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        const nodemailerModule = await loadNodemailer();
        const transporter = nodemailerModule.createTransport({
          host: smtpConfiguration.host,
          port: smtpConfiguration.port,
          secure:
            smtpConfiguration.securityType ===
            ReportSmtpSecurityTypeEnum.SSL_TLS,
          requireTLS:
            smtpConfiguration.securityType ===
            ReportSmtpSecurityTypeEnum.STARTTLS,
          auth:
            smtpConfiguration.username && smtpPassword
              ? { user: smtpConfiguration.username, pass: smtpPassword }
              : undefined,
        });

        const mailOptions: SafeSendMailOptions = {
          from: `"${smtpConfiguration.senderName || 'HRMS Reports'}" <${smtpConfiguration.senderEmail}>`,
          to: recipient.email,
          subject,
          html,
          attachments: [
            {
              filename: execution.generatedFilename ?? 'report',
              content: attachmentBuffer,
              contentType: attachmentMimeType,
            },
          ],
          mailSafetyContext: {
            sourceModule: 'ReportExecutionWorkerService.deliverByEmail',
          },
        };
        applyMailRecipientSafety(
          mailOptions,
          resolveMailRecipientSafetyConfigFromEnv(process.env),
          this.logger,
        );

        const mailResult = await transporter.sendMail(mailOptions);

        await this.executionRecipientRepository.save(
          this.executionRecipientRepository.create({
            executionId: execution.id,
            channel: ReportRecipientChannelEnum.TO,
            sourceType: ReportRecipientTypeEnum.EMAIL,
            emailAddress: recipient.email,
            displayName: recipient.displayName,
            sourceLabel: recipient.targetKey,
            deliveryStatus: ReportEmailDeliveryStatusEnum.SENT,
          }),
        );

        await this.executionAttemptRepository.save(
          this.executionAttemptRepository.create({
            executionId: execution.id,
            attemptNumber: execution.retryCount + 1,
            phase: ReportExecutionAttemptPhaseEnum.EMAIL_DELIVERY,
            status: ReportAttemptStatusEnum.SUCCESS,
            startedAt: new Date(),
            completedAt: new Date(),
            metadata: {
              recipient: recipient.email,
              accepted: mailResult.accepted,
              messageId: mailResult.messageId,
              usedSystemSmtp: false,
              companyId: execution.companyId,
              smtpConfigurationId: smtpConfiguration.id,
            },
          }),
        );

        sentCount += 1;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Email delivery failed';

        await this.executionRecipientRepository.save(
          this.executionRecipientRepository.create({
            executionId: execution.id,
            channel: ReportRecipientChannelEnum.TO,
            sourceType: ReportRecipientTypeEnum.EMAIL,
            emailAddress: recipient.email,
            displayName: recipient.displayName,
            sourceLabel: recipient.targetKey,
            deliveryStatus: ReportEmailDeliveryStatusEnum.FAILED,
            errorMessage,
          }),
        );

        await this.executionAttemptRepository.save(
          this.executionAttemptRepository.create({
            executionId: execution.id,
            attemptNumber: execution.retryCount + 1,
            phase: ReportExecutionAttemptPhaseEnum.EMAIL_DELIVERY,
            status: ReportAttemptStatusEnum.FAILED,
            startedAt: new Date(),
            completedAt: new Date(),
            errorMessage,
          }),
        );

        failedCount += 1;
      }
    }

    if (sentCount > 0 && failedCount === 0) {
      execution.status = ReportExecutionStatusEnum.SENT;
      execution.emailDeliveryStatus = ReportEmailDeliveryStatusEnum.SENT;
    } else if (sentCount > 0 && failedCount > 0) {
      execution.status = ReportExecutionStatusEnum.PARTIALLY_SENT;
      execution.emailDeliveryStatus =
        ReportEmailDeliveryStatusEnum.PARTIALLY_SENT;
    } else {
      execution.status = ReportExecutionStatusEnum.FAILED;
      execution.emailDeliveryStatus = ReportEmailDeliveryStatusEnum.FAILED;
      execution.errorMessage = 'All recipient deliveries failed.';
    }

    execution.completedAt = new Date();
    await this.executionRepository.save(execution);
  }

  private async resolveRecipients(
    templateId: number,
  ): Promise<ResolvedRecipient[]> {
    const recipients = await this.templateRecipientRepository.find({
      where: { templateId, recipientType: ReportRecipientTypeEnum.EMAIL },
    });

    return recipients
      .filter((recipient) => Boolean(recipient.emailAddress?.trim()))
      .map((recipient) => ({
        email: recipient.emailAddress!.trim(),
        displayName: recipient.displayName,
        targetKey: recipient.targetKey,
      }));
  }

  private renderTemplateString(
    template: string,
    values: Record<string, string>,
  ): string {
    return template.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_: string, key: string) => values[key] ?? '',
    );
  }
}
