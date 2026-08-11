import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilesService } from '../../files/files.service';
import { ReportExecution } from '../entities/report-execution.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import { ReportEmailDeliveryStatusEnum } from '../enums/report-email-delivery-status.enum';
import { ReportExecutionSourceEnum } from '../enums/report-execution-source.enum';
import { ReportExecutionStatusEnum } from '../enums/report-execution-status.enum';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';

export type ManualExecutionInput = {
  dateFrom?: string | null;
  dateTo?: string | null;
  outputFormat?: ReportOutputFormatEnum | null;
};

@Injectable()
export class ReportExecutionService {
  constructor(
    @InjectRepository(ReportExecution)
    private readonly executionRepository: Repository<ReportExecution>,
    @InjectRepository(ReportTemplate)
    private readonly templateRepository: Repository<ReportTemplate>,
    private readonly filesService: FilesService,
  ) {}

  async queueManualExecution(
    companyId: number,
    templateId: number,
    triggeredByCompanyUserId: number | null,
    input: ManualExecutionInput,
  ): Promise<ReportExecution> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId, companyId },
    });

    if (!template) {
      throw new NotFoundException('Report template not found');
    }

    if (!template.isActive) {
      throw new BadRequestException(
        'This report template is inactive and cannot be run.',
      );
    }

    const dateTo = input.dateTo ?? this.today();
    const dateFrom = input.dateFrom ?? dateTo;

    return this.executionRepository.save(
      this.executionRepository.create({
        companyId,
        templateId: template.id,
        scheduleId: null,
        reportDefinitionId: template.reportDefinitionId,
        smtpConfigurationId: template.smtpConfigurationId,
        source: ReportExecutionSourceEnum.MANUAL,
        status: ReportExecutionStatusEnum.PENDING,
        emailDeliveryStatus: ReportEmailDeliveryStatusEnum.PENDING,
        idempotencyKey: `manual-${template.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reportDateFrom: dateFrom,
        reportDateTo: dateTo,
        appliedFilters: {
          ...(template.reportFilters ?? {}),
          date_from: dateFrom,
          date_to: dateTo,
        },
        executionMetadata: {
          requestedOutputFormat: input.outputFormat ?? template.outputFormat,
        },
        maxRetryAttempts: 3,
        triggeredByCompanyUserId,
      }),
    );
  }

  async retryExecution(
    companyId: number,
    executionId: number,
    triggeredByCompanyUserId: number | null,
  ): Promise<ReportExecution> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId, companyId },
    });

    if (!execution) {
      throw new NotFoundException('Report execution not found');
    }

    if (execution.status !== ReportExecutionStatusEnum.FAILED) {
      throw new BadRequestException(
        'Only failed report executions can be retried.',
      );
    }

    if (execution.retryCount >= (execution.maxRetryAttempts || 3)) {
      throw new BadRequestException(
        'This report execution has exhausted its retry attempts.',
      );
    }

    execution.status = ReportExecutionStatusEnum.PENDING;
    execution.source = ReportExecutionSourceEnum.RETRY;
    execution.retryCount += 1;
    execution.errorMessage = null;
    execution.technicalDetails = null;
    execution.triggeredByCompanyUserId = triggeredByCompanyUserId;

    return this.executionRepository.save(execution);
  }

  async downloadExecutionFile(
    companyId: number,
    executionId: number,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId, companyId },
    });

    if (!execution) {
      throw new NotFoundException('Report execution not found');
    }

    if (!execution.generatedFilePath) {
      throw new BadRequestException(
        'This report execution has no generated file to download.',
      );
    }

    if (
      execution.status !== ReportExecutionStatusEnum.GENERATED &&
      execution.status !== ReportExecutionStatusEnum.SENT &&
      execution.status !== ReportExecutionStatusEnum.PARTIALLY_SENT
    ) {
      throw new ForbiddenException(
        'This report execution does not have a downloadable file yet.',
      );
    }

    const buffer = await this.filesService.readManagedFile(
      execution.generatedFilePath,
    );

    if (!buffer) {
      throw new NotFoundException('Generated report file was not found');
    }

    return {
      buffer,
      filename: execution.generatedFilename ?? 'report.bin',
      mimeType: execution.generatedFileMimeType ?? 'application/octet-stream',
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
