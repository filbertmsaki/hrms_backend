import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { ReportExecution } from '../entities/report-execution.entity';
import { ReportSchedule } from '../entities/report-schedule.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportScheduleDispatcherService } from './report-schedule-dispatcher.service';

describe('ReportScheduleDispatcherService', () => {
  let service: ReportScheduleDispatcherService;
  let scheduleRepository: {
    find: jest.Mock;
    save: jest.Mock;
  };
  let templateRepository: { findOne: jest.Mock };
  let executionRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let advisoryLockService: { runWithLock: jest.Mock };

  beforeEach(() => {
    scheduleRepository = {
      find: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    templateRepository = { findOne: jest.fn() };
    executionRepository = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      create: jest.fn((entity) => entity),
    };
    advisoryLockService = {
      runWithLock: jest.fn(
        async (_key: string, callback: () => Promise<unknown>) => ({
          acquired: true,
          result: await callback(),
        }),
      ),
    };

    service = new ReportScheduleDispatcherService(
      scheduleRepository as unknown as Repository<ReportSchedule>,
      templateRepository as unknown as Repository<ReportTemplate>,
      executionRepository as unknown as Repository<ReportExecution>,
      advisoryLockService as unknown as PostgresAdvisoryLockService,
    );
  });

  it('does nothing when there are no due schedules', async () => {
    scheduleRepository.find.mockResolvedValue([]);

    await service.dispatch();

    expect(executionRepository.save).not.toHaveBeenCalled();
  });

  it('skips creating an execution and reschedules when the template is inactive', async () => {
    const schedule: Partial<ReportSchedule> = {
      id: 1,
      companyId: 4,
      templateId: 10,
      scheduleType: ReportScheduleTypeEnum.DAILY,
      maxRetryAttempts: 3,
    };
    scheduleRepository.find.mockResolvedValue([schedule]);
    templateRepository.findOne.mockResolvedValue({ id: 10, isActive: false });

    await service.dispatch();

    expect(executionRepository.save).not.toHaveBeenCalled();
    expect(scheduleRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
    );
  });

  it('creates exactly one PENDING execution per due schedule per day (idempotent)', async () => {
    const schedule: Partial<ReportSchedule> = {
      id: 1,
      companyId: 4,
      templateId: 10,
      scheduleType: ReportScheduleTypeEnum.DAILY,
      maxRetryAttempts: 3,
    };
    scheduleRepository.find.mockResolvedValue([schedule]);
    templateRepository.findOne.mockResolvedValue({
      id: 10,
      companyId: 4,
      isActive: true,
      reportDefinitionId: 5,
      smtpConfigurationId: null,
      reportFilters: null,
      outputFormat: 'CSV',
    });
    executionRepository.findOne.mockResolvedValue(null);

    await service.dispatch();

    expect(executionRepository.save).toHaveBeenCalledTimes(1);
    const created = executionRepository.save.mock.calls[0][0];
    expect(created.companyId).toBe(4);
    expect(created.templateId).toBe(10);
    expect(created.scheduleId).toBe(1);

    executionRepository.findOne.mockResolvedValue({
      id: 99,
      idempotencyKey: created.idempotencyKey,
    });

    await service.dispatch();

    expect(executionRepository.save).toHaveBeenCalledTimes(1);
  });
});
