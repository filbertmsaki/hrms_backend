import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { KpiImportBatchStatus } from '../entities/kpi-import-batch.entity';
import { KpiImportService } from './kpi-import.service';

describe('KpiImportService', () => {
  const batchRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) =>
      Promise.resolve({ id: 31, createdAt: new Date(), ...value }),
    ),
  };
  const achievementRepository = { find: jest.fn() };
  const employeeRepository = { find: jest.fn() };
  const access = { ensureActorCompanyId: jest.fn() };
  const audit = { log: jest.fn() };
  const scoring = { score: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const service = new KpiImportService(
    access as never,
    scoring as never,
    audit as never,
    dataSource as never,
    batchRepository as never,
    achievementRepository as never,
    employeeRepository as never,
  );
  const actor = { companyId: 8, companyMembershipId: 4 } as never;
  const csv =
    'employee_no,kpi_code,period_id,source_record_id,measurement_unit,value\n' +
    'EMP-1,SALES,12,source-1,units,10.25\n';
  const achievement = {
    id: 55,
    planItem: {
      kpiDefinitionVersionId: 9,
      kpiDefinitionVersion: {
        dataSourceType: KpiDataSourceTypeEnum.FILE_IMPORT,
        measurementUnit: 'units',
        kpiDefinition: { code: 'SALES' },
      },
    },
    periodAssignment: {
      performancePeriodId: 12,
      status: 'OPEN',
      employee: { employee_no: 'EMP-1' },
    },
    achievementSnapshot: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    access.ensureActorCompanyId.mockReturnValue(8);
    batchRepository.findOne.mockResolvedValue(null);
    batchRepository.find.mockResolvedValue([]);
    achievementRepository.find.mockResolvedValue([achievement]);
    employeeRepository.find.mockResolvedValue([{ employee_no: 'EMP-1' }]);
    audit.log.mockResolvedValue(undefined);
  });

  it('stages a tenant-scoped CSV after matching employee, KPI, period, and unit', async () => {
    const result = await service.createBatch(actor, csv);
    expect(result).toMatchObject({
      id: 31,
      status: KpiImportBatchStatus.VALIDATED,
      row_count: 1,
      valid_row_count: 1,
      file_totals: [
        {
          kpi_code: 'SALES',
          period_id: 12,
          measurement_unit: 'units',
          row_count: 1,
          valid_row_count: 1,
          input_total: '10.2500',
          valid_total: '10.2500',
          applicable_total: '10.2500',
        },
      ],
    });
    expect(achievementRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 8 } }),
    );
    expect(batchRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 8,
        createdByCompanyUserId: 4,
        status: KpiImportBatchStatus.VALIDATED,
        rows: [
          expect.objectContaining({
            rowNumber: 2,
            achievementId: 55,
            sourceRecordId: 'source-1',
          }),
        ],
      }),
    );
  });

  it('rejects a batch atomically when a unit does not match the KPI definition', async () => {
    const result = await service.createBatch(
      actor,
      csv.replace(',units,', ',TZS,'),
    );
    expect(result).toMatchObject({
      status: KpiImportBatchStatus.REJECTED,
      valid_row_count: 0,
    });
    expect(batchRepository.save.mock.calls[0][0].rows[0].errors).toContain(
      'measurement_unit must match the configured KPI unit (units).',
    );
  });

  it('rejects malformed headers before creating a batch', async () => {
    await expect(
      service.createBatch(actor, 'employee_no,kpi_code\nEMP-1,SALES'),
    ).rejects.toThrow(BadRequestException);
    expect(batchRepository.save).not.toHaveBeenCalled();
  });

  it('rejects characters appended after a quoted CSV field', async () => {
    const malformed = csv.replace('EMP-1,', '"EMP-1"unexpected,');
    await expect(service.createBatch(actor, malformed)).rejects.toThrow(
      'CSV contains characters after a closed quoted field.',
    );
    expect(batchRepository.save).not.toHaveBeenCalled();
  });

  it('returns the existing batch for an identical upload', async () => {
    batchRepository.findOne.mockResolvedValue({
      id: 17,
      status: KpiImportBatchStatus.APPLIED,
      rowCount: 1,
      validRowCount: 1,
      checksum: 'hash',
      createdAt: new Date(),
      appliedAt: new Date(),
    });
    const result = await service.createBatch(actor, csv);
    expect(result.id).toBe(17);
    expect(batchRepository.save).not.toHaveBeenCalled();
  });

  it('prevents the uploader from approving their own batch', async () => {
    batchRepository.findOne.mockResolvedValue({
      id: 31,
      companyId: 8,
      createdByCompanyUserId: 4,
      status: KpiImportBatchStatus.VALIDATED,
    });
    await expect(service.approve(actor, 31)).rejects.toThrow(
      ForbiddenException,
    );
    expect(batchRepository.save).not.toHaveBeenCalled();
  });

  it('applies an approved batch transactionally and records source provenance', async () => {
    const batch = {
      id: 31,
      companyId: 8,
      status: KpiImportBatchStatus.APPROVED,
      approvedByCompanyUserId: 6,
      checksum: 'abc',
      rows: [
        {
          rowNumber: 2,
          sourceRecordId: 'source-1',
          employeeNo: 'EMP-1',
          kpiCode: 'SALES',
          periodId: 12,
          measurementUnit: 'units',
          value: '10.25',
          achievementId: 55,
          errors: [],
        },
      ],
    };
    const achievementRepo = {
      findOne: jest.fn().mockResolvedValue({
        ...achievement,
        targetValue: '10',
        employeeId: 3,
        planItem: {
          weight: '100',
          targetValue: '10',
          kpiDefinitionVersion: {
            dataSourceType: KpiDataSourceTypeEnum.FILE_IMPORT,
            measurementUnit: 'units',
            scoringFormula: 'PERCENT_TO_TARGET',
            defaultTargetValue: '10',
            formulaConfiguration: null,
          },
        },
        achievementSnapshot: {},
      }),
      save: jest.fn(async (value) => value),
    };
    const batchRepo = {
      findOne: jest.fn().mockResolvedValue(batch),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn((entity) =>
        entity.name === 'KpiImportBatch' ? batchRepo : achievementRepo,
      ),
    };
    dataSource.transaction.mockImplementation(async (work) => work(manager));
    scoring.score.mockReturnValue({
      rawScore: '102.5000',
      cappedScore: '102.5000',
      weightedScore: '102.5000',
    });

    const result = await service.apply(
      { companyId: 8, companyMembershipId: 4 } as never,
      31,
    );

    expect(result).toEqual({
      batch_id: 31,
      status: KpiImportBatchStatus.APPLIED,
      applied_count: 1,
    });
    expect(batchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: KpiImportBatchStatus.APPLIED }),
    );
    expect(achievementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        achievementValue: '10.25',
        status: 'SYSTEM_CALCULATED',
        achievementSnapshot: expect.objectContaining({
          import_batch_id: 31,
          import_source_record_id: 'source-1',
        }),
      }),
    );
  });
});
