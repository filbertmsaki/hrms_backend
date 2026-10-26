import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { DataSource, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformancePeriodAssignmentStatusEnum } from '../enums/performance-period-assignment-status.enum';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import {
  KpiImportBatch,
  KpiImportBatchStatus,
  KpiImportRow,
} from '../entities/kpi-import-batch.entity';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceScoringService } from './performance-scoring.service';

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;
const REQUIRED_HEADERS = [
  'employee_no',
  'kpi_code',
  'period_id',
  'source_record_id',
  'measurement_unit',
  'value',
] as const;

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let quoteClosed = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        cell += char;
      }
      continue;
    }
    if (quoteClosed) {
      if (char === ',') {
        row.push(cell);
        cell = '';
        quoteClosed = false;
      } else if (char === '\n' || (char === '\r' && csv[index + 1] === '\n')) {
        row.push(cell);
        if (row.some((value) => value.trim() !== '')) rows.push(row);
        row = [];
        cell = '';
        quoteClosed = false;
        if (char === '\r') index += 1;
      } else if (char === ' ' || char === '\t') {
        // Permit harmless whitespace after a closed quoted field.
      } else {
        throw new BadRequestException(
          'CSV contains characters after a closed quoted field.',
        );
      }
      continue;
    }
    if (char === '"') {
      if (cell.length !== 0) {
        throw new BadRequestException(
          'CSV quotes must begin at the start of a field.',
        );
      }
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted)
    throw new BadRequestException('CSV contains an unterminated quoted field.');
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }
  return rows;
}

@Injectable()
export class KpiImportService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly scoringService: PerformanceScoringService,
    private readonly auditService: PerformanceAuditService,
    private readonly dataSource: DataSource,
    @InjectRepository(KpiImportBatch)
    private readonly batchRepository: Repository<KpiImportBatch>,
    @InjectRepository(KpiAchievement)
    private readonly achievementRepository: Repository<KpiAchievement>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async createBatch(actor: AuthenticatedUser, csv: string) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.companyMembershipId) {
      throw new ForbiddenException(
        'A company membership is required to create a KPI import batch.',
      );
    }
    if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
      throw new BadRequestException('KPI import CSV exceeds the 5 MB limit.');
    }
    if (csv.includes('\u0000') || csv.includes('\uFFFD')) {
      throw new BadRequestException(
        'KPI import file must be valid UTF-8 CSV text.',
      );
    }
    const checksum = createHash('sha256').update(csv, 'utf8').digest('hex');
    const existing = await this.batchRepository.findOne({
      where: { companyId, checksum },
    });
    if (existing) return this.toSummary(existing);

    const parsed = parseCsv(csv.replace(/^\uFEFF/, ''));
    if (parsed.length < 2)
      throw new BadRequestException(
        'CSV must include a header and at least one data row.',
      );
    if (parsed.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `KPI import CSV cannot exceed ${MAX_IMPORT_ROWS} rows.`,
      );
    }
    const headers = parsed[0].map((header) => header.trim().toLowerCase());
    if (
      new Set(headers).size !== headers.length ||
      REQUIRED_HEADERS.some((header) => !headers.includes(header))
    ) {
      throw new BadRequestException(
        `CSV headers must include exactly one each of: ${REQUIRED_HEADERS.join(', ')}. Additional columns are not accepted.`,
      );
    }
    if (headers.length !== REQUIRED_HEADERS.length) {
      throw new BadRequestException(
        `CSV headers must be: ${REQUIRED_HEADERS.join(', ')}.`,
      );
    }
    const column = Object.fromEntries(
      headers.map((header, index) => [header, index]),
    );
    const sourceIds = new Set<string>();
    const rows: KpiImportRow[] = [];
    for (let index = 1; index < parsed.length; index += 1) {
      const cells = parsed[index];
      const errors: string[] = [];
      if (cells.length !== headers.length)
        errors.push('Column count does not match the header.');
      const employeeNo = cells[column.employee_no]?.trim() ?? '';
      const kpiCode = cells[column.kpi_code]?.trim().toUpperCase() ?? '';
      const periodRaw = cells[column.period_id]?.trim() ?? '';
      const sourceRecordId = cells[column.source_record_id]?.trim() ?? '';
      const measurementUnit = cells[column.measurement_unit]?.trim() ?? '';
      const valueRaw = cells[column.value]?.trim() ?? '';
      const periodId = /^\d+$/.test(periodRaw) ? Number(periodRaw) : 0;
      if (!employeeNo) errors.push('employee_no is required.');
      if (!kpiCode) errors.push('kpi_code is required.');
      if (!periodId || !Number.isSafeInteger(periodId))
        errors.push('period_id must be a positive integer.');
      if (!sourceRecordId || sourceRecordId.length > 160)
        errors.push(
          'source_record_id is required and must be at most 160 characters.',
        );
      if (sourceRecordId && sourceIds.has(sourceRecordId))
        errors.push('source_record_id is duplicated in this file.');
      if (sourceRecordId) sourceIds.add(sourceRecordId);
      if (
        !/^-?\d+(?:\.\d{1,4})?$/.test(valueRaw) ||
        !Number.isFinite(Number(valueRaw))
      ) {
        errors.push(
          'value must be a finite decimal with at most four fractional digits.',
        );
      }
      rows.push({
        rowNumber: index + 1,
        sourceRecordId,
        employeeNo,
        kpiCode,
        periodId,
        measurementUnit,
        value: valueRaw,
        achievementId: null,
        errors,
      });
    }

    const achievements = await this.achievementRepository.find({
      where: { companyId },
      relations: {
        planItem: { kpiDefinitionVersion: { kpiDefinition: true } },
        periodAssignment: { performancePeriod: true, employee: true },
      },
    });
    const achievementMap = new Map<string, KpiAchievement>();
    for (const achievement of achievements) {
      const version = achievement.planItem.kpiDefinitionVersion;
      if (version.dataSourceType !== KpiDataSourceTypeEnum.FILE_IMPORT)
        continue;
      const employeeNo = achievement.periodAssignment.employee.employee_no
        .trim()
        .toUpperCase();
      const code = version.kpiDefinition.code.trim().toUpperCase();
      achievementMap.set(
        `${employeeNo}|${version.kpiDefinitionId}|${achievement.periodAssignment.performancePeriodId}`,
        achievement,
      );
      // The code index is used after resolving the tenant-scoped definition ID.
      achievementMap.set(
        `${employeeNo}|${code}|${achievement.periodAssignment.performancePeriodId}`,
        achievement,
      );
    }
    const importedEmployeeNos = Array.from(
      new Set(rows.map((row) => row.employeeNo.toUpperCase())),
    );
    const employees = importedEmployeeNos.length
      ? await this.employeeRepository.find({
          where: {
            company_id: companyId,
            employee_no: In(importedEmployeeNos),
          },
        })
      : [];
    const employeeNos = new Set(
      employees.map((employee) => employee.employee_no.trim().toUpperCase()),
    );
    const priorBatches = await this.batchRepository.find({
      where: { companyId, status: KpiImportBatchStatus.APPLIED },
    });
    const priorSourceIds = new Set(
      priorBatches.flatMap((batch) =>
        batch.rows.map((row) => row.sourceRecordId),
      ),
    );
    const duplicateAchievements = new Set<string>();

    for (const row of rows) {
      if (!employeeNos.has(row.employeeNo.toUpperCase()))
        row.errors.push('Employee number was not found in this company.');
      if (priorSourceIds.has(row.sourceRecordId))
        row.errors.push(
          'source_record_id was already applied in an earlier batch.',
        );
      const achievement = achievementMap.get(
        `${row.employeeNo.toUpperCase()}|${row.kpiCode}|${row.periodId}`,
      );
      if (!achievement) {
        row.errors.push(
          'No matching FILE_IMPORT KPI achievement is assigned to this employee for the period.',
        );
        continue;
      }
      row.achievementId = achievement.id;
      if (
        row.measurementUnit !==
        achievement.planItem.kpiDefinitionVersion.measurementUnit
      ) {
        row.errors.push(
          `measurement_unit must match the configured KPI unit (${achievement.planItem.kpiDefinitionVersion.measurementUnit}).`,
        );
      }
      const dedupeKey = `${row.employeeNo.toUpperCase()}|${row.kpiCode}|${row.periodId}`;
      if (duplicateAchievements.has(dedupeKey))
        row.errors.push(
          'Only one imported value per employee, KPI, and period is supported in a batch.',
        );
      duplicateAchievements.add(dedupeKey);
      if (
        achievement.periodAssignment.status ===
          PerformancePeriodAssignmentStatusEnum.PUBLISHED ||
        achievement.periodAssignment.status ===
          PerformancePeriodAssignmentStatusEnum.LOCKED
      ) {
        row.errors.push(
          'Published or locked KPI achievements cannot be imported.',
        );
      }
      if (achievement.achievementSnapshot?.['import_source_record_id']) {
        row.errors.push(
          'This achievement already has an imported value; corrections require a separately approved correction workflow.',
        );
      }
    }

    const validRowCount = rows.filter((row) => row.errors.length === 0).length;
    const batch = await this.batchRepository.save(
      this.batchRepository.create({
        companyId,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        approvedByCompanyUserId: null,
        checksum,
        status:
          validRowCount === rows.length
            ? KpiImportBatchStatus.VALIDATED
            : KpiImportBatchStatus.REJECTED,
        rowCount: rows.length,
        validRowCount,
        rows,
        appliedAt: null,
      }),
    );
    await this.auditService.log({
      action: PerformanceAuditActionEnum.KPI_IMPORT_VALIDATED,
      actor,
      afterValues: {
        batch_id: batch.id,
        row_count: rows.length,
        valid_row_count: validRowCount,
        status: batch.status,
        checksum,
      },
    });
    return this.toSummary(batch);
  }

  async listBatches(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const batches = await this.batchRepository.find({
      where: { companyId },
      order: { id: 'DESC' },
      take: 100,
    });
    return batches.map((batch) => this.toSummary(batch));
  }

  async getBatch(actor: AuthenticatedUser, id: number) {
    const batch = await this.findBatch(actor, id);
    return { ...this.toSummary(batch), rows: batch.rows };
  }

  async approve(actor: AuthenticatedUser, id: number) {
    const batch = await this.findBatch(actor, id);
    if (!actor.companyMembershipId) {
      throw new ForbiddenException(
        'A company membership is required to approve a KPI import batch.',
      );
    }
    if (batch.status !== KpiImportBatchStatus.VALIDATED) {
      throw new BadRequestException(
        'Only a fully validated batch can be approved.',
      );
    }
    if (
      batch.createdByCompanyUserId &&
      batch.createdByCompanyUserId === actor.companyMembershipId
    ) {
      throw new ForbiddenException(
        'The uploader cannot approve their own KPI import batch.',
      );
    }
    batch.status = KpiImportBatchStatus.APPROVED;
    batch.approvedByCompanyUserId = actor.companyMembershipId ?? null;
    const saved = await this.batchRepository.save(batch);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.KPI_IMPORT_APPROVED,
      actor,
      afterValues: { batch_id: saved.id, checksum: saved.checksum },
    });
    return this.toSummary(saved);
  }

  async apply(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const applied = await this.dataSource.transaction(async (manager) => {
      // Serialize imports within a tenant so two approved batches cannot race
      // past the cross-batch source-id idempotency check.
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        101010,
        companyId,
      ]);
      const batchRepo = manager.getRepository(KpiImportBatch);
      const batch = await batchRepo.findOne({
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch) throw new NotFoundException('KPI import batch not found.');
      if (batch.status === KpiImportBatchStatus.APPLIED)
        return { batch, achievements: [] as KpiAchievement[] };
      if (batch.status !== KpiImportBatchStatus.APPROVED)
        throw new BadRequestException(
          'KPI import batch must be approved before applying.',
        );
      const priorBatches = await batchRepo.find({
        where: { companyId, status: KpiImportBatchStatus.APPLIED },
      });
      const priorSourceIds = new Set(
        priorBatches.flatMap((prior) =>
          prior.rows.map((row) => row.sourceRecordId),
        ),
      );
      if (batch.rows.some((row) => priorSourceIds.has(row.sourceRecordId))) {
        throw new ConflictException(
          'A source_record_id was already applied by another KPI import batch.',
        );
      }
      const achievementRepo = manager.getRepository(KpiAchievement);
      const savedAchievements: KpiAchievement[] = [];
      for (const row of batch.rows) {
        if (row.errors.length || !row.achievementId)
          throw new ConflictException(
            'Approved batch contains an invalid row; create a new validated batch.',
          );
        const achievement = await achievementRepo.findOne({
          where: { id: row.achievementId, companyId },
          relations: {
            planItem: { kpiDefinitionVersion: true },
            periodAssignment: { performancePeriod: true },
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !achievement ||
          achievement.planItem.kpiDefinitionVersion.dataSourceType !==
            KpiDataSourceTypeEnum.FILE_IMPORT
        ) {
          throw new ConflictException(
            `KPI achievement for import row ${row.rowNumber} changed after validation.`,
          );
        }
        if (
          achievement.periodAssignment.status ===
            PerformancePeriodAssignmentStatusEnum.PUBLISHED ||
          achievement.periodAssignment.status ===
            PerformancePeriodAssignmentStatusEnum.LOCKED ||
          achievement.achievementSnapshot?.['import_source_record_id']
        ) {
          throw new ConflictException(
            `KPI achievement for import row ${row.rowNumber} is no longer eligible for import.`,
          );
        }
        const version = achievement.planItem.kpiDefinitionVersion;
        if (version.measurementUnit !== row.measurementUnit) {
          throw new ConflictException(
            `KPI measurement unit for import row ${row.rowNumber} changed after validation.`,
          );
        }
        const score = this.scoringService.score({
          formula: version.scoringFormula,
          targetValue:
            achievement.targetValue ??
            achievement.planItem.targetValue ??
            version.defaultTargetValue,
          achievementValue: Number(row.value),
          weight: achievement.planItem.weight,
          formulaConfiguration: version.formulaConfiguration,
        });
        achievement.achievementValue = row.value;
        achievement.rawScore = score.rawScore;
        achievement.cappedScore = score.cappedScore;
        achievement.weightedScore = score.weightedScore;
        achievement.status = KpiAchievementStatusEnum.SYSTEM_CALCULATED;
        achievement.achievementSnapshot = {
          ...(achievement.achievementSnapshot ?? {}),
          import_batch_id: batch.id,
          import_batch_checksum: batch.checksum,
          import_source_record_id: row.sourceRecordId,
          import_row_number: row.rowNumber,
          imported_at: new Date().toISOString(),
        };
        savedAchievements.push(await achievementRepo.save(achievement));
      }
      batch.status = KpiImportBatchStatus.APPLIED;
      batch.appliedAt = new Date();
      await batchRepo.save(batch);
      return { batch, achievements: savedAchievements };
    });

    for (const achievement of applied.achievements) {
      await this.auditService.log({
        action: PerformanceAuditActionEnum.ACHIEVEMENT_SYSTEM_CALCULATED,
        actor,
        employeeId: achievement.employeeId,
        kpiAchievementId: achievement.id,
        afterValues: {
          achievement_value: achievement.achievementValue,
          weighted_score: achievement.weightedScore,
          import_batch_id: id,
        },
        reason: 'Value imported from an approved KPI CSV batch.',
      });
    }
    if (applied.achievements.length) {
      await this.auditService.log({
        action: PerformanceAuditActionEnum.KPI_IMPORT_APPLIED,
        actor,
        afterValues: {
          batch_id: id,
          applied_count: applied.achievements.length,
          checksum: applied.batch.checksum,
        },
      });
    }
    return {
      batch_id: id,
      status: applied.batch.status,
      applied_count: applied.achievements.length,
    };
  }

  private async findBatch(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const batch = await this.batchRepository.findOne({
      where: { id, companyId },
    });
    if (!batch) throw new NotFoundException('KPI import batch not found.');
    return batch;
  }

  private toSummary(batch: KpiImportBatch) {
    const totals = new Map<
      string,
      {
        kpi_code: string;
        period_id: number;
        measurement_unit: string;
        row_count: number;
        valid_row_count: number;
        input_total: Decimal;
        valid_total: Decimal;
      }
    >();
    for (const row of batch.rows ?? []) {
      const key = `${row.kpiCode}|${row.periodId}|${row.measurementUnit}`;
      const total = totals.get(key) ?? {
        kpi_code: row.kpiCode,
        period_id: row.periodId,
        measurement_unit: row.measurementUnit,
        row_count: 0,
        valid_row_count: 0,
        input_total: new Decimal(0),
        valid_total: new Decimal(0),
      };
      total.row_count += 1;
      let value: Decimal | null = null;
      try {
        value = new Decimal(row.value);
        if (!value.isFinite()) value = null;
      } catch {
        value = null;
      }
      if (value) {
        total.input_total = total.input_total.plus(value);
        if (row.errors.length === 0) {
          total.valid_row_count += 1;
          total.valid_total = total.valid_total.plus(value);
        }
      }
      totals.set(key, total);
    }
    const isApplicable =
      batch.rowCount > 0 && batch.validRowCount === batch.rowCount;
    return {
      id: batch.id,
      status: batch.status,
      row_count: batch.rowCount,
      valid_row_count: batch.validRowCount,
      error_row_count: batch.rowCount - batch.validRowCount,
      checksum: batch.checksum,
      file_totals: Array.from(totals.values()).map((total) => ({
        kpi_code: total.kpi_code,
        period_id: total.period_id,
        measurement_unit: total.measurement_unit,
        row_count: total.row_count,
        valid_row_count: total.valid_row_count,
        input_total: total.input_total.toFixed(4),
        valid_total: total.valid_total.toFixed(4),
        applicable_total: isApplicable
          ? total.valid_total.toFixed(4)
          : '0.0000',
      })),
      created_at: batch.createdAt,
      applied_at: batch.appliedAt,
    };
  }
}
