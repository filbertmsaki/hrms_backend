import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FilesService } from '../../files/files.service';
import { ReportExecution } from '../entities/report-execution.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import { ReportExecutionStatusEnum } from '../enums/report-execution-status.enum';
import { ReportExecutionService } from './report-execution.service';

describe('ReportExecutionService', () => {
  let service: ReportExecutionService;
  let executionRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let templateRepository: { findOne: jest.Mock };
  let filesService: { readManagedFile: jest.Mock };

  beforeEach(() => {
    executionRepository = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      create: jest.fn((entity) => entity),
    };
    templateRepository = { findOne: jest.fn() };
    filesService = { readManagedFile: jest.fn() };

    service = new ReportExecutionService(
      executionRepository as unknown as Repository<ReportExecution>,
      templateRepository as unknown as Repository<ReportTemplate>,
      filesService as unknown as FilesService,
    );
  });

  describe('queueManualExecution', () => {
    it('rejects when the template does not exist for the company', async () => {
      templateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.queueManualExecution(4, 99, 1, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the template is inactive', async () => {
      templateRepository.findOne.mockResolvedValue({
        id: 1,
        companyId: 4,
        isActive: false,
      });

      await expect(
        service.queueManualExecution(4, 1, 1, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a PENDING execution scoped to the company and template', async () => {
      templateRepository.findOne.mockResolvedValue({
        id: 1,
        companyId: 4,
        isActive: true,
        reportDefinitionId: 7,
        smtpConfigurationId: null,
        reportFilters: { branch_id: 2 },
        outputFormat: 'CSV',
      });

      const result = await service.queueManualExecution(4, 1, 9, {
        dateFrom: '2026-08-01',
        dateTo: '2026-08-01',
      });

      expect(result.companyId).toBe(4);
      expect(result.templateId).toBe(1);
      expect(result.status).toBe(ReportExecutionStatusEnum.PENDING);
      expect(result.triggeredByCompanyUserId).toBe(9);
      expect(result.appliedFilters).toEqual(
        expect.objectContaining({
          branch_id: 2,
          date_from: '2026-08-01',
          date_to: '2026-08-01',
        }),
      );
    });
  });

  describe('retryExecution', () => {
    it('rejects when the execution does not exist', async () => {
      executionRepository.findOne.mockResolvedValue(null);

      await expect(service.retryExecution(4, 1, 9)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects retrying an execution that is not FAILED', async () => {
      executionRepository.findOne.mockResolvedValue({
        id: 1,
        status: ReportExecutionStatusEnum.SENT,
        retryCount: 0,
        maxRetryAttempts: 3,
      });

      await expect(service.retryExecution(4, 1, 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects retrying once retry attempts are exhausted', async () => {
      executionRepository.findOne.mockResolvedValue({
        id: 1,
        status: ReportExecutionStatusEnum.FAILED,
        retryCount: 3,
        maxRetryAttempts: 3,
      });

      await expect(service.retryExecution(4, 1, 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('resets a failed execution back to PENDING and increments retryCount', async () => {
      const execution = {
        id: 1,
        status: ReportExecutionStatusEnum.FAILED,
        retryCount: 0,
        maxRetryAttempts: 3,
        errorMessage: 'boom',
        technicalDetails: 'stack',
      };
      executionRepository.findOne.mockResolvedValue(execution);

      const result = await service.retryExecution(4, 1, 9);

      expect(result.status).toBe(ReportExecutionStatusEnum.PENDING);
      expect(result.retryCount).toBe(1);
      expect(result.errorMessage).toBeNull();
    });
  });

  describe('downloadExecutionFile', () => {
    it('rejects when the execution has no generated file', async () => {
      executionRepository.findOne.mockResolvedValue({
        id: 1,
        generatedFilePath: null,
        status: ReportExecutionStatusEnum.GENERATED,
      });

      await expect(service.downloadExecutionFile(4, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns the file buffer for a GENERATED execution', async () => {
      executionRepository.findOne.mockResolvedValue({
        id: 1,
        generatedFilePath: '/private-uploads/scheduled-reports/4/report.csv',
        generatedFilename: 'report.csv',
        generatedFileMimeType: 'text/csv',
        status: ReportExecutionStatusEnum.GENERATED,
      });
      filesService.readManagedFile.mockResolvedValue(Buffer.from('data'));

      const result = await service.downloadExecutionFile(4, 1);

      expect(result.filename).toBe('report.csv');
      expect(result.buffer.toString()).toBe('data');
    });
  });
});
