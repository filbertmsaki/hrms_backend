import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  DataSource,
  EntityManager,
  FindOptionsRelations,
  FindOptionsWhere,
  In,
  LessThan,
  Raw,
  Repository,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../../common/utils/permission.util';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { ConfirmLeaveBalanceImportDto } from '../dtos/confirm-leave-balance-import.dto';
import { LeaveBalanceImportHistoryQueryDto } from '../dtos/leave-balance-import-history-query.dto';
import {
  LeaveBalanceImportRowFilterEnum,
  LeaveBalanceImportRowsQueryDto,
} from '../dtos/leave-balance-import-rows-query.dto';
import { LeaveBalanceImportTemplateQueryDto } from '../dtos/leave-balance-import-template-query.dto';
import { UploadLeaveBalanceImportDto } from '../dtos/upload-leave-balance-import.dto';
import { LeaveBalanceImportBatch } from '../entities/leave-balance-import-batch.entity';
import {
  LeaveBalanceImportRow,
  LeaveBalanceImportRowIssue,
} from '../entities/leave-balance-import-row.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';
import { LeaveBalanceAdjustmentSourceEnum } from '../enums/leave-balance-adjustment-source.enum';
import { LeaveBalanceImportBatchStatusEnum as BatchStatus } from '../enums/leave-balance-import-batch-status.enum';
import { LeaveBalanceImportIssueCodeEnum as IssueCode } from '../enums/leave-balance-import-issue-code.enum';
import { LeaveBalanceImportModeEnum } from '../enums/leave-balance-import-mode.enum';
import {
  LeaveBalanceImportResultStatusEnum as ResultStatus,
  LeaveBalanceImportValidationStatusEnum as ValidationStatus,
} from '../enums/leave-balance-import-row-status.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import {
  calculateAvailableLeaveDays,
  isEmployeeEligibleForLeaveType,
} from '../utils/leave-balance-rules.util';
import { LeaveAuditPayload, LeaveAuditService } from './leave-audit.service';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';
import { LeaveBalanceService } from './leave-balance.service';
import {
  buildLeaveBalanceReportWorkbook,
  buildLeaveBalanceTemplateWorkbook,
  LEAVE_BALANCE_MAX_ABSOLUTE_DAYS,
  LEAVE_BALANCE_REASON_MAX_LENGTH,
  LEAVE_BALANCE_TEMPLATE_VERSION,
  LeaveBalanceTemplateRow,
  LeaveBalanceWorkbookError,
  ParsedLeaveBalanceRow,
  parseLeaveBalanceDecimal,
  parseLeaveBalanceImportWorkbook,
  signLeaveBalanceTemplateToken,
  toLeaveBalanceCents,
  verifyLeaveBalanceTemplateToken,
} from './leave-balance-import-workbook';
import {
  LEAVE_BALANCE_IMPORT_QUEUE,
  LeaveBalanceImportJobData,
  LeaveBalanceImportJobName,
} from './leave-balance-import-job.constants';

type UploadedWorkbook = {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
};

type ValidationContext = {
  companyId: number;
  fiscalYear: string;
  actor: AuthenticatedUser;
  accessibleEmployeeIds: Set<number> | null;
  employeesByNumber: Map<string, Employee[]>;
  leaveTypesByCode: Map<string, LeaveType[]>;
  balancesByKey: Map<string, LeaveBalance>;
  policies: LeavePolicy[];
  defaultReason: string | null;
};

type RowEvaluation = {
  rowNumber: number;
  raw: Record<string, string>;
  employeeNo: string;
  leaveTypeCode: string;
  employee: Employee | null;
  leaveType: LeaveType | null;
  balance: LeaveBalance | null;
  uploadedCurrentCents: number | null;
  dbCurrentCents: number | null;
  newBalanceCents: number | null;
  adjustmentCents: number | null;
  reason: string | null;
  issues: LeaveBalanceImportRowIssue[];
  status: ValidationStatus;
};

type RowPlan = {
  row: LeaveBalanceImportRow;
  evaluation: RowEvaluation;
  conflict: LeaveBalanceImportRowIssue | null;
};

type AppliedRow = {
  plan: RowPlan;
  previousCents: number;
  newCents: number;
  adjustmentId: number | null;
  transactionId: number;
};

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const CHANGE_STATUSES = [ValidationStatus.VALID, ValidationStatus.WARNING];
const CONFIRMABLE_STATUSES = [
  BatchStatus.READY_FOR_IMPORT,
  BatchStatus.HAS_ERRORS,
];
const CANCELLABLE_STATUSES = [
  BatchStatus.VALIDATED,
  BatchStatus.HAS_ERRORS,
  BatchStatus.READY_FOR_IMPORT,
];
const QUERY_CHUNK_SIZE = 1000;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;
const STALE_PROCESSING_MS = 30 * 60 * 1000;

export const LEAVE_BALANCE_BULK_IMPORT_PERMISSION =
  'leave-balances.bulk-import';
export const LEAVE_BALANCE_BULK_IMPORT_PARTIAL_PERMISSION =
  'leave-balances.bulk-import.partial';

/** Thrown inside the strict-mode transaction so every write rolls back. */
class StrictImportConflictError extends Error {
  constructor(readonly plans: RowPlan[]) {
    super('Strict leave balance import rolled back because of conflicts');
  }
}

const PROGRESS_EVERY_ROWS = 25;

@Injectable()
export class LeaveBalanceImportService implements OnApplicationShutdown {
  private readonly logger = new Logger(LeaveBalanceImportService.name);
  /** Imports running in this process when the queue is unavailable. */
  private readonly inProcessImports = new Set<Promise<void>>();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepository: Repository<LeaveBalance>,
    @InjectRepository(LeaveBalanceImportBatch)
    private readonly batchRepository: Repository<LeaveBalanceImportBatch>,
    @InjectRepository(LeaveBalanceImportRow)
    private readonly rowRepository: Repository<LeaveBalanceImportRow>,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly leaveBalanceLedgerService: LeaveBalanceLedgerService,
    private readonly leaveAuditService: LeaveAuditService,
    private readonly hrAccessService: HrAccessService,
    private readonly configService: ConfigService,
    @InjectQueue(LEAVE_BALANCE_IMPORT_QUEUE)
    private readonly queue: Pick<Queue<LeaveBalanceImportJobData>, 'add'>,
  ) {}

  /** Lets in-process imports finish their transaction before shutdown. */
  async onApplicationShutdown(): Promise<void> {
    await this.waitForInProcessImports();
  }

  async waitForInProcessImports(): Promise<void> {
    while (this.inProcessImports.size) {
      await Promise.allSettled([...this.inProcessImports]);
    }
  }

  // ---------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------

  async downloadTemplate(
    companyId: number,
    query: LeaveBalanceImportTemplateQueryDto,
    actor: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string; rowCount: number }> {
    const fiscalYear = this.leaveBalanceService.normalizeFiscalYear(
      query.fiscal_year ??
        this.leaveBalanceService.getFiscalYearFromDate(new Date()),
    );
    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    const [employees, leaveTypes] = await Promise.all([
      this.findTemplateEmployees(companyId, query, accessibleEmployeeIds),
      this.leaveTypeRepository.find({
        where: {
          company_id: companyId,
          status: LeaveRecordStatusEnum.ACTIVE,
          ...(typeof query.leave_type_id === 'number'
            ? { id: query.leave_type_id }
            : {}),
        },
        order: { name: 'ASC' },
      }),
    ]);

    const combinations = employees.flatMap((employee) =>
      leaveTypes
        .filter((leaveType) =>
          isEmployeeEligibleForLeaveType(employee, leaveType),
        )
        .map((leaveType) => ({ employee, leaveType })),
    );
    if (!combinations.length) {
      throw new BadRequestException(
        'No active employees with eligible leave types match your access scope and the selected filters.',
      );
    }
    const maxRows = this.getMaxRows();
    if (combinations.length > maxRows) {
      throw new BadRequestException(
        `The template would contain ${combinations.length} employee leave balances, above the limit of ${maxRows}. Filter it by branch, department or leave type.`,
      );
    }

    const balancesByKey = await this.loadBalances(
      employees.map((employee) => employee.id),
      leaveTypes.map((leaveType) => leaveType.id),
      fiscalYear,
    );

    // Missing rows are rare (the daily job generates current-year balances);
    // they are created with the standard balance generation rules so the
    // exported figure is exactly what Leave Management will show.
    let initializedBalances = 0;
    for (const { employee, leaveType } of combinations) {
      const key = this.balanceKey(employee.id, leaveType.id);
      if (balancesByKey.has(key)) {
        continue;
      }
      balancesByKey.set(
        key,
        await this.leaveBalanceService.ensureBalanceForEmployee(
          companyId,
          employee,
          leaveType.id,
          fiscalYear,
          undefined,
          { leaveType },
        ),
      );
      initializedBalances += 1;
    }

    const generatedAt = new Date();
    const templateId = randomUUID();
    const token = signLeaveBalanceTemplateToken(
      {
        v: 1,
        tid: templateId,
        cid: companyId,
        fy: fiscalYear,
        gat: generatedAt.toISOString(),
      },
      this.getSigningSecret(),
    );

    const rows: LeaveBalanceTemplateRow[] = combinations.map(
      ({ employee, leaveType }) => {
        const balance = balancesByKey.get(
          this.balanceKey(employee.id, leaveType.id),
        )!;
        return {
          employee_no: employee.employee_no,
          first_name: employee.first_name,
          middle_name: employee.middle_name ?? '',
          last_name: employee.last_name,
          branch: employee.primary_branch?.name ?? '',
          department: employee.primary_department?.name ?? '',
          position: employee.primary_position?.name ?? '',
          leave_year: fiscalYear,
          leave_type_code: leaveType.code,
          leave_type_name: leaveType.name,
          current_balance:
            toLeaveBalanceCents(calculateAvailableLeaveDays(balance)) / 100,
          new_balance: null,
          reason: null,
          employee_ref: String(employee.id),
          leave_type_ref: String(leaveType.id),
          balance_version: String(balance.version ?? 1),
        };
      },
    );

    const buffer = await buildLeaveBalanceTemplateWorkbook({
      token,
      fiscalYear,
      companyName: actor.companyName ?? null,
      generatedAt,
      rows,
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_balance_import.template_exported',
      entity_name: 'leave_balance_import_template',
      actor,
      payload: {
        template_id: templateId,
        fiscal_year: fiscalYear,
        generated_at: generatedAt.toISOString(),
        employees: employees.length,
        rows: rows.length,
        initialized_balances: initializedBalances,
        filters: {
          branch_id: query.branch_id ?? null,
          department_id: query.department_id ?? null,
          leave_type_id: query.leave_type_id ?? null,
        },
      },
    });

    return {
      buffer,
      fileName: `leave-balance-template-${fiscalYear}-${this.formatDateStamp(generatedAt)}.xlsx`,
      rowCount: rows.length,
    };
  }

  // ---------------------------------------------------------------------
  // Upload + validation (never changes balances)
  // ---------------------------------------------------------------------

  async uploadAndValidate(
    companyId: number,
    file: UploadedWorkbook | undefined,
    dto: UploadLeaveBalanceImportDto,
    actor: AuthenticatedUser,
  ) {
    this.assertSupportedFile(file);

    let parsed: Awaited<ReturnType<typeof parseLeaveBalanceImportWorkbook>>;
    try {
      parsed = await parseLeaveBalanceImportWorkbook(file.buffer);
    } catch (error) {
      if (error instanceof LeaveBalanceWorkbookError) {
        await this.logRejectedUpload(
          companyId,
          file,
          actor,
          error.code,
          error.message,
        );
        throw new BadRequestException({
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }

    const template = verifyLeaveBalanceTemplateToken(
      parsed.token,
      this.getSigningSecret(),
    );
    if (!template || template.v !== 1) {
      const message =
        'The template signature is invalid or the template was modified. Download a new template from Leave Balance Bulk Import.';
      await this.logRejectedUpload(
        companyId,
        file,
        actor,
        IssueCode.INVALID_TEMPLATE,
        message,
      );
      throw new BadRequestException({
        message,
        code: IssueCode.INVALID_TEMPLATE,
      });
    }
    if (template.cid !== companyId) {
      const message =
        'This template was generated for a different company. Download the template while signed in to this company.';
      await this.logRejectedUpload(
        companyId,
        file,
        actor,
        IssueCode.COMPANY_MISMATCH,
        message,
      );
      throw new BadRequestException({
        message,
        code: IssueCode.COMPANY_MISMATCH,
      });
    }
    if (!parsed.rows.length) {
      throw new BadRequestException(
        'The workbook has no leave balance rows to import.',
      );
    }
    const maxRows = this.getMaxRows();
    if (parsed.rows.length > maxRows) {
      throw new BadRequestException(
        `The workbook has ${parsed.rows.length} rows; a leave balance import can contain at most ${maxRows}.`,
      );
    }

    const defaultReason = this.sanitizeReason(dto.default_reason);
    let batch = await this.batchRepository.save(
      this.batchRepository.create({
        batch_ref: this.generateBatchRef(),
        company_id: companyId,
        fiscal_year: template.fy,
        template_id: template.tid,
        template_version: LEAVE_BALANCE_TEMPLATE_VERSION,
        template_generated_at: new Date(template.gat),
        status: BatchStatus.VALIDATING,
        import_mode: null,
        original_file_name: this.safeFileName(file.originalname),
        file_size: file.size,
        file_checksum: createHash('sha256').update(file.buffer).digest('hex'),
        default_reason: defaultReason,
        total_rows: parsed.rows.length,
        uploaded_by_company_user_id: actor.companyMembershipId ?? null,
      }),
    );

    try {
      const context = await this.loadValidationContext(
        companyId,
        template.fy,
        parsed.rows.map((row) => row.values),
        actor,
        { defaultReason },
      );
      const duplicates = this.findDuplicateRows(parsed.rows);
      const evaluations = parsed.rows.map((row) =>
        this.evaluateRow(row, context, duplicates.get(row.rowNumber) ?? null),
      );

      batch = await this.dataSource.transaction(async (manager) => {
        const rowRepository = manager.getRepository(LeaveBalanceImportRow);
        const entities = evaluations.map(
          (evaluation) =>
            this.toRowEntity(
              batch.id,
              evaluation,
            ) as QueryDeepPartialEntity<LeaveBalanceImportRow>,
        );
        for (let index = 0; index < entities.length; index += 500) {
          await rowRepository.insert(entities.slice(index, index + 500));
        }

        Object.assign(batch, this.summarizeEvaluations(evaluations));
        batch.status = this.resolveValidatedStatus(batch);
        const saved = await manager
          .getRepository(LeaveBalanceImportBatch)
          .save(batch);

        await this.leaveAuditService.log(
          {
            company_id: companyId,
            action: 'leave_balance_import.validated',
            entity_name: 'leave_balance_import_batch',
            entity_id: saved.id,
            actor,
            payload: {
              batch_id: saved.batch_ref,
              template_id: saved.template_id,
              fiscal_year: saved.fiscal_year,
              file_name: saved.original_file_name,
              file_checksum: saved.file_checksum,
              status: saved.status,
              total_rows: saved.total_rows,
              valid_rows: saved.valid_rows,
              warning_rows: saved.warning_rows,
              invalid_rows: saved.invalid_rows,
              no_change_rows: saved.no_change_rows,
            },
          },
          manager,
        );
        return saved;
      });
    } catch (error) {
      this.logger.error(
        `Leave balance import ${batch.batch_ref} failed during validation`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.batchRepository.update(batch.id, {
        status: BatchStatus.FAILED,
        failure_reason:
          'The file could not be validated because of an unexpected error. No balances were changed.',
        completed_at: new Date(),
      });
      throw error;
    }

    return this.mapBatchDetail(batch, actor);
  }

  // ---------------------------------------------------------------------
  // Confirmation + import
  // ---------------------------------------------------------------------

  async confirmImport(
    companyId: number,
    batchRef: string,
    dto: ConfirmLeaveBalanceImportDto,
    actor: AuthenticatedUser,
  ) {
    const mode = dto.import_mode ?? LeaveBalanceImportModeEnum.STRICT;
    const canImportValidRowsOnly = hasPermission(
      actor.permissions,
      LEAVE_BALANCE_BULK_IMPORT_PARTIAL_PERMISSION,
    );
    if (
      mode === LeaveBalanceImportModeEnum.VALID_ROWS_ONLY &&
      !canImportValidRowsOnly
    ) {
      throw new ForbiddenException(
        'You are not allowed to import valid rows only. Correct the file and use strict mode.',
      );
    }

    // Claim the batch in its own short transaction so a second confirmation
    // (double click, another tab) sees PROCESSING and is rejected.
    const batch = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveBalanceImportBatch);
      const locked = await repository.findOne({
        where: { company_id: companyId, batch_ref: batchRef },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || !this.canViewBatch(locked, actor)) {
        throw new NotFoundException('Leave balance import batch not found');
      }
      if (!CONFIRMABLE_STATUSES.includes(locked.status)) {
        throw new ConflictException({
          message: `This import is ${this.describeStatus(locked.status)} and can no longer be confirmed.`,
          code: 'BATCH_NOT_CONFIRMABLE',
        });
      }
      const changedRows = locked.valid_rows + locked.warning_rows;
      if (!changedRows) {
        throw new BadRequestException({
          message: 'The file contains no balance changes to import.',
          code: 'NOTHING_TO_IMPORT',
        });
      }
      if (
        mode === LeaveBalanceImportModeEnum.STRICT &&
        locked.invalid_rows > 0
      ) {
        throw new BadRequestException({
          message: `Strict mode cannot import a file with ${locked.invalid_rows} invalid row(s). Correct the file and upload it again${canImportValidRowsOnly ? ', or import valid rows only' : ''}.`,
          code: 'STRICT_MODE_HAS_ERRORS',
        });
      }
      if (locked.warning_rows > 0 && dto.acknowledge_warnings !== true) {
        throw new BadRequestException({
          message: `Review and acknowledge the ${locked.warning_rows} row(s) with warnings before importing.`,
          code: 'WARNINGS_NOT_ACKNOWLEDGED',
        });
      }
      if (
        mode === LeaveBalanceImportModeEnum.VALID_ROWS_ONLY &&
        locked.invalid_rows > 0 &&
        dto.acknowledge_skipped_rows !== true
      ) {
        throw new BadRequestException({
          message: `Confirm that the ${locked.invalid_rows} invalid row(s) will be skipped before importing.`,
          code: 'SKIPPED_ROWS_NOT_ACKNOWLEDGED',
        });
      }

      const now = new Date();
      locked.status = BatchStatus.PROCESSING;
      locked.import_mode = mode;
      locked.confirmed_by_company_user_id = actor.companyMembershipId ?? null;
      locked.confirmed_at = now;
      locked.started_at = now;
      locked.processed_rows = 0;
      locked.processing_context = this.buildActorSnapshot(actor);
      const saved = await repository.save(locked);
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          action: 'leave_balance_import.confirmed',
          entity_name: 'leave_balance_import_batch',
          entity_id: saved.id,
          actor,
          payload: {
            batch_id: saved.batch_ref,
            import_mode: mode,
            changed_rows: changedRows,
            invalid_rows: saved.invalid_rows,
            warning_rows: saved.warning_rows,
          },
        },
        manager,
      );
      return saved;
    });

    await this.dispatch(batch);
    return this.getBatch(companyId, batchRef, actor);
  }

  /**
   * Hands the claimed batch to the background worker. Without Redis (or if
   * enqueueing fails) it runs in this process after the response is sent.
   * Either way the import itself is one all-or-nothing transaction.
   */
  private async dispatch(batch: LeaveBalanceImportBatch): Promise<void> {
    const job: LeaveBalanceImportJobData = {
      companyId: batch.company_id,
      databaseBatchId: batch.id,
    };
    try {
      await this.queue.add(LeaveBalanceImportJobName.PROCESS_BATCH, job, {
        jobId: `leave-balance-import-${batch.id}`,
        attempts: 1,
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
      });
    } catch (error) {
      this.logger.warn(
        `Leave balance import queue unavailable (${error instanceof Error ? error.message : 'unknown error'}); processing ${batch.batch_ref} in-process`,
      );
      const running: Promise<void> = new Promise<void>((resolve) =>
        setImmediate(resolve),
      )
        .then(() => this.processQueuedBatch(job))
        .catch((processError: unknown) =>
          this.logger.error(
            `In-process leave balance import ${batch.batch_ref} failed`,
            processError instanceof Error ? processError.stack : undefined,
          ),
        )
        .finally(() => this.inProcessImports.delete(running));
      this.inProcessImports.add(running);
    }
  }

  /** Entry point for the queue worker (and the in-process fallback). */
  async processQueuedBatch(job: LeaveBalanceImportJobData): Promise<void> {
    const batch = await this.batchRepository.findOne({
      where: { id: job.databaseBatchId, company_id: job.companyId },
    });
    if (!batch || batch.status !== BatchStatus.PROCESSING) {
      this.logger.warn(
        `Skipping leave balance import ${job.databaseBatchId}: not awaiting processing`,
      );
      return;
    }
    const actor = this.readActorSnapshot(batch);
    if (!actor || !batch.import_mode) {
      await this.batchRepository.update(batch.id, {
        status: BatchStatus.FAILED,
        failure_reason:
          'The import could not start because its confirmation details are missing. No balances were changed.',
        completed_at: new Date(),
      });
      return;
    }
    await this.processBatch(batch, batch.import_mode, actor);
  }

  private buildActorSnapshot(
    actor: AuthenticatedUser,
  ): Record<string, unknown> {
    return {
      id: actor.id,
      email: actor.email,
      scope: actor.scope,
      userType: actor.userType,
      companyId: actor.companyId ?? null,
      companyName: actor.companyName ?? null,
      companyMembershipId: actor.companyMembershipId ?? null,
      employeeId: actor.employeeId ?? null,
      roles: actor.roles ?? [],
      permissions: actor.permissions ?? [],
    };
  }

  private readActorSnapshot(
    batch: LeaveBalanceImportBatch,
  ): AuthenticatedUser | null {
    const snapshot = batch.processing_context;
    if (
      !snapshot ||
      typeof snapshot.id !== 'number' ||
      !Array.isArray(snapshot.permissions)
    ) {
      return null;
    }
    return {
      ...(snapshot as unknown as AuthenticatedUser),
      companyId: batch.company_id,
      companyName: (snapshot.companyName as string | null) ?? undefined,
      companyMembershipId:
        (snapshot.companyMembershipId as number | null) ?? undefined,
      employeeId: (snapshot.employeeId as number | null) ?? undefined,
    };
  }

  private async processBatch(
    batch: LeaveBalanceImportBatch,
    mode: LeaveBalanceImportModeEnum,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const rows = await this.rowRepository.find({
      where: { batch_id: batch.id },
      order: { row_number: 'ASC' },
    });
    const changeRows = rows.filter((row) =>
      CHANGE_STATUSES.includes(row.validation_status),
    );

    try {
      // One transaction for the whole batch: balances, ledger transactions,
      // adjustment records, audit entries and row results commit together or
      // not at all. Conflicting rows are excluded (valid rows only) or abort
      // everything (strict).
      await this.dataSource.transaction(async (manager) => {
        const context = await this.loadValidationContext(
          batch.company_id,
          batch.fiscal_year,
          changeRows.map((row) => row.raw_data),
          actor,
          { manager, lockBalances: true, defaultReason: batch.default_reason },
        );
        const plans = changeRows.map((row) => this.planRow(row, context));
        if (
          mode === LeaveBalanceImportModeEnum.STRICT &&
          plans.some((plan) => plan.conflict)
        ) {
          throw new StrictImportConflictError(plans);
        }

        const applied: AppliedRow[] = [];
        let processed = 0;
        for (const plan of plans) {
          if (!plan.conflict) {
            applied.push(await this.applyPlan(plan, batch, actor, manager));
          }
          processed += 1;
          if (processed % PROGRESS_EVERY_ROWS === 0) {
            await this.reportProgress(batch.id, processed);
          }
        }
        batch.processed_rows = processed;
        await this.leaveAuditService.logMany(
          applied.map((item) => this.buildAdjustmentAudit(item, batch, actor)),
          manager,
        );
        await this.persistResults(batch, rows, plans, applied, actor, manager);
      });
    } catch (error) {
      if (error instanceof StrictImportConflictError) {
        await this.persistStrictFailure(batch, rows, error.plans, actor);
        return;
      }
      this.logger.error(
        `Leave balance import ${batch.batch_ref} failed and was rolled back`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.persistUnexpectedFailure(batch, rows, actor);
    }
  }

  /**
   * Progress is written on the pooled repository (its own connection), so it
   * is visible while the import transaction is still open. It also refreshes
   * updated_at, which the interrupted-import sweep uses as a heartbeat.
   */
  private async reportProgress(
    batchId: number,
    processed: number,
  ): Promise<void> {
    try {
      await this.batchRepository.update(batchId, { processed_rows: processed });
    } catch (error) {
      this.logger.warn(
        `Could not record progress for leave balance import ${batchId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /** Re-validates a row against locked, current data right before writing. */
  private planRow(
    row: LeaveBalanceImportRow,
    context: ValidationContext,
  ): RowPlan {
    const evaluation = this.evaluateRow(
      {
        rowNumber: row.row_number,
        values: row.raw_data as ParsedLeaveBalanceRow['values'],
      },
      context,
      null,
    );
    const validatedCents =
      row.db_current_balance === null
        ? null
        : toLeaveBalanceCents(Number(row.db_current_balance));

    let conflict: LeaveBalanceImportRowIssue | null = null;
    if (
      evaluation.dbCurrentCents !== null &&
      validatedCents !== null &&
      evaluation.dbCurrentCents !== validatedCents
    ) {
      conflict = this.issue(
        IssueCode.BALANCE_CHANGED_SINCE_VALIDATION,
        'error',
        'current_balance',
        `The balance changed from ${this.formatDays(validatedCents)} to ${this.formatDays(evaluation.dbCurrentCents)} days after the file was validated, so it was not overwritten. Download a new template and try again.`,
      );
    } else if (
      evaluation.status === ValidationStatus.INVALID ||
      evaluation.status === ValidationStatus.NO_CHANGE
    ) {
      const firstError =
        evaluation.issues.find((item) => item.severity === 'error') ?? null;
      conflict =
        firstError ??
        this.issue(
          IssueCode.BALANCE_CHANGED_SINCE_VALIDATION,
          'error',
          'current_balance',
          'The balance no longer needs this change; it was not overwritten.',
        );
    } else if (
      evaluation.employee?.id !== row.employee_id ||
      evaluation.leaveType?.id !== row.leave_type_id ||
      evaluation.balance?.id !== row.leave_balance_id
    ) {
      conflict = this.issue(
        IssueCode.IMPORT_FAILED,
        'error',
        null,
        'The employee, leave type or balance no longer matches the validated record.',
      );
    }

    return { row, evaluation, conflict };
  }

  private async applyPlan(
    plan: RowPlan,
    batch: LeaveBalanceImportBatch,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<AppliedRow> {
    const { evaluation, row } = plan;
    const balance = evaluation.balance!;
    const previousCents = evaluation.dbCurrentCents!;
    const newCents = evaluation.newBalanceCents!;
    const deltaCents = newCents - previousCents;

    const result = await this.leaveBalanceLedgerService.applyManualAdjustment(
      balance,
      {
        companyId: batch.company_id,
        employeeId: evaluation.employee!.id,
        leaveTypeId: evaluation.leaveType!.id,
        leaveYear: batch.fiscal_year,
        effectiveDate: new Date().toISOString().slice(0, 10),
        mode:
          deltaCents >= 0
            ? LeaveBalanceAdjustmentModeEnum.ADD
            : LeaveBalanceAdjustmentModeEnum.DEDUCT,
        amount: Math.abs(deltaCents) / 100,
        reason: evaluation.reason!,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        idempotencyKey: `leave-balance-import:${batch.id}:row:${row.id}`,
        source: LeaveBalanceAdjustmentSourceEnum.BULK_IMPORT,
        importBatchId: batch.id,
        importRowId: row.id,
        reference: `${batch.batch_ref}#${row.row_number}`,
        metadata: {
          import_batch_ref: batch.batch_ref,
          import_row_number: row.row_number,
        },
      },
      manager,
    );

    const resultingCents = toLeaveBalanceCents(
      calculateAvailableLeaveDays(result.balance),
    );
    if (!result.created || resultingCents !== newCents) {
      // Never leave a balance that differs from what was previewed.
      throw new Error(
        `Row ${row.row_number} would end at ${resultingCents / 100} instead of ${newCents / 100} (created=${String(result.created)})`,
      );
    }

    return {
      plan,
      previousCents,
      newCents,
      adjustmentId: result.adjustment?.id ?? null,
      transactionId: result.transaction.id,
    };
  }

  private buildAdjustmentAudit(
    applied: AppliedRow,
    batch: LeaveBalanceImportBatch,
    actor: AuthenticatedUser,
  ): LeaveAuditPayload {
    const { evaluation, row } = applied.plan;
    const adjustmentCents = applied.newCents - applied.previousCents;
    return {
      company_id: batch.company_id,
      action: 'leave_balance.bulk_adjusted',
      entity_name: 'leave_balance',
      entity_id: evaluation.balance!.id,
      actor,
      payload: {
        source: LeaveBalanceAdjustmentSourceEnum.BULK_IMPORT,
        import_batch_id: batch.batch_ref,
        import_row_number: row.row_number,
        employee_id: evaluation.employee!.id,
        employee_no: evaluation.employee!.employee_no,
        leave_type_id: evaluation.leaveType!.id,
        leave_type_code: evaluation.leaveType!.code,
        fiscal_year: batch.fiscal_year,
        previous_balance_days: this.formatDecimal(applied.previousCents),
        new_balance_days: this.formatDecimal(applied.newCents),
        adjustment_days: this.formatDecimal(adjustmentCents),
        adjustment_direction: adjustmentCents >= 0 ? 'INCREASE' : 'DECREASE',
        reason: evaluation.reason,
        leave_balance_adjustment_id: applied.adjustmentId,
        leave_balance_transaction_id: applied.transactionId,
      },
    };
  }

  private async persistResults(
    batch: LeaveBalanceImportBatch,
    rows: LeaveBalanceImportRow[],
    plans: RowPlan[],
    applied: AppliedRow[],
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    const rowRepository = manager.getRepository(LeaveBalanceImportRow);
    const processedAt = new Date();
    const handled = new Set<number>();

    for (const item of applied) {
      handled.add(item.plan.row.id);
      await rowRepository.update(item.plan.row.id, {
        result_status: ResultStatus.IMPORTED,
        previous_balance_at_import: this.formatDecimal(item.previousCents),
        new_balance_at_import: this.formatDecimal(item.newCents),
        leave_balance_adjustment_id: item.adjustmentId,
        leave_balance_transaction_id: item.transactionId,
        processed_at: processedAt,
      });
    }
    const failed = plans.filter((plan) => plan.conflict);
    for (const plan of failed) {
      handled.add(plan.row.id);
      await rowRepository.update(plan.row.id, {
        result_status: ResultStatus.FAILED,
        error_code: plan.conflict!.code,
        message: plan.conflict!.message,
        issues: [...(plan.row.issues ?? []), plan.conflict!],
        processed_at: processedAt,
      });
    }
    const skippedIds = rows
      .filter((row) => !handled.has(row.id))
      .map((row) => row.id);
    for (let index = 0; index < skippedIds.length; index += QUERY_CHUNK_SIZE) {
      await rowRepository.update(
        { id: In(skippedIds.slice(index, index + QUERY_CHUNK_SIZE)) },
        { result_status: ResultStatus.SKIPPED, processed_at: processedAt },
      );
    }

    const importedRows = applied.length;
    const incomplete = failed.length > 0 || batch.invalid_rows > 0;
    batch.status = !importedRows
      ? BatchStatus.FAILED
      : incomplete
        ? BatchStatus.PARTIALLY_COMPLETED
        : BatchStatus.COMPLETED;
    batch.imported_rows = importedRows;
    batch.failed_rows = failed.length;
    batch.skipped_rows = skippedIds.length;
    batch.employees_affected = new Set(
      applied.map((item) => item.plan.evaluation.employee!.id),
    ).size;
    batch.completed_at = processedAt;
    batch.failure_reason = importedRows
      ? null
      : 'No balances were imported because every changed row conflicted with newer data.';
    batch.summary = {
      ...(batch.summary ?? {}),
      result: {
        imported_rows: importedRows,
        failed_rows: failed.length,
        skipped_rows: skippedIds.length,
        net_adjustment_days: this.formatDecimal(
          applied.reduce(
            (sum, item) => sum + (item.newCents - item.previousCents),
            0,
          ),
        ),
      },
    };
    await manager.getRepository(LeaveBalanceImportBatch).save(batch);
    await this.leaveAuditService.log(
      {
        company_id: batch.company_id,
        action: 'leave_balance_import.completed',
        entity_name: 'leave_balance_import_batch',
        entity_id: batch.id,
        actor,
        payload: {
          batch_id: batch.batch_ref,
          status: batch.status,
          import_mode: batch.import_mode,
          imported_rows: importedRows,
          failed_rows: failed.length,
          skipped_rows: skippedIds.length,
          employees_affected: batch.employees_affected,
        },
      },
      manager,
    );
  }

  private async persistStrictFailure(
    batch: LeaveBalanceImportBatch,
    rows: LeaveBalanceImportRow[],
    plans: RowPlan[],
    actor: AuthenticatedUser,
  ): Promise<void> {
    const conflicts = plans.filter((plan) => plan.conflict);
    await this.dataSource.transaction(async (manager) => {
      const rowRepository = manager.getRepository(LeaveBalanceImportRow);
      const processedAt = new Date();
      const conflictIds = new Set(conflicts.map((plan) => plan.row.id));
      for (const plan of conflicts) {
        await rowRepository.update(plan.row.id, {
          result_status: ResultStatus.FAILED,
          error_code: plan.conflict!.code,
          message: plan.conflict!.message,
          issues: [...(plan.row.issues ?? []), plan.conflict!],
          processed_at: processedAt,
        });
      }
      await this.markRowsNotImported(
        rowRepository,
        rows.filter((row) => !conflictIds.has(row.id)),
        processedAt,
      );

      batch.status = BatchStatus.FAILED;
      batch.imported_rows = 0;
      batch.failed_rows = conflicts.length;
      batch.skipped_rows = rows.length - conflicts.length;
      batch.employees_affected = 0;
      batch.completed_at = processedAt;
      batch.failure_reason = `${conflicts.length} balance(s) changed after the file was validated. Strict mode rolled back the whole import, so no balances were changed. Download a new template and try again.`;
      await manager.getRepository(LeaveBalanceImportBatch).save(batch);
      await this.leaveAuditService.log(
        {
          company_id: batch.company_id,
          action: 'leave_balance_import.failed',
          entity_name: 'leave_balance_import_batch',
          entity_id: batch.id,
          actor,
          payload: {
            batch_id: batch.batch_ref,
            reason: 'CONCURRENT_BALANCE_CHANGE',
            conflicting_rows: conflicts.map((plan) => plan.row.row_number),
          },
        },
        manager,
      );
    });
  }

  private async persistUnexpectedFailure(
    batch: LeaveBalanceImportBatch,
    rows: LeaveBalanceImportRow[],
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const processedAt = new Date();
      await this.markRowsNotImported(
        manager.getRepository(LeaveBalanceImportRow),
        rows,
        processedAt,
      );
      batch.status = BatchStatus.FAILED;
      batch.imported_rows = 0;
      batch.failed_rows = 0;
      batch.skipped_rows = rows.length;
      batch.employees_affected = 0;
      batch.completed_at = processedAt;
      batch.failure_reason =
        'The import failed unexpectedly and was rolled back. No balances were changed.';
      await manager.getRepository(LeaveBalanceImportBatch).save(batch);
      await this.leaveAuditService.log(
        {
          company_id: batch.company_id,
          action: 'leave_balance_import.failed',
          entity_name: 'leave_balance_import_batch',
          entity_id: batch.id,
          actor,
          payload: { batch_id: batch.batch_ref, reason: 'UNEXPECTED_ERROR' },
        },
        manager,
      );
    });
  }

  private async markRowsNotImported(
    rowRepository: Repository<LeaveBalanceImportRow>,
    rows: LeaveBalanceImportRow[],
    processedAt: Date,
  ): Promise<void> {
    const rolledBack = rows
      .filter((row) => CHANGE_STATUSES.includes(row.validation_status))
      .map((row) => row.id);
    const untouched = rows
      .filter((row) => !CHANGE_STATUSES.includes(row.validation_status))
      .map((row) => row.id);
    for (let index = 0; index < rolledBack.length; index += QUERY_CHUNK_SIZE) {
      await rowRepository.update(
        { id: In(rolledBack.slice(index, index + QUERY_CHUNK_SIZE)) },
        {
          result_status: ResultStatus.SKIPPED,
          error_code: IssueCode.NOT_IMPORTED_BATCH_ROLLED_BACK,
          message:
            'Not imported: the batch was rolled back, so this balance was left unchanged.',
          processed_at: processedAt,
        },
      );
    }
    for (let index = 0; index < untouched.length; index += QUERY_CHUNK_SIZE) {
      await rowRepository.update(
        { id: In(untouched.slice(index, index + QUERY_CHUNK_SIZE)) },
        { result_status: ResultStatus.SKIPPED, processed_at: processedAt },
      );
    }
  }

  async cancelImport(
    companyId: number,
    batchRef: string,
    actor: AuthenticatedUser,
  ) {
    const batch = await this.findVisibleBatch(companyId, batchRef, actor);
    if (!CANCELLABLE_STATUSES.includes(batch.status)) {
      throw new ConflictException(
        `This import is ${this.describeStatus(batch.status)} and cannot be cancelled.`,
      );
    }
    batch.status = BatchStatus.CANCELLED;
    batch.cancelled_by_company_user_id = actor.companyMembershipId ?? null;
    batch.cancelled_at = new Date();
    await this.batchRepository.save(batch);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_balance_import.cancelled',
      entity_name: 'leave_balance_import_batch',
      entity_id: batch.id,
      actor,
      payload: { batch_id: batch.batch_ref },
    });
    return this.getBatch(companyId, batchRef, actor);
  }

  /**
   * A crash mid-import rolls the transaction back, but leaves the batch
   * marked PROCESSING. Surface those as failed so they are not stuck.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async failInterruptedImports(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
    const result = await this.batchRepository.update(
      { status: BatchStatus.PROCESSING, updated_at: LessThan(cutoff) },
      {
        status: BatchStatus.FAILED,
        failure_reason:
          'Processing was interrupted before completion and rolled back. No balances were changed.',
        completed_at: new Date(),
      },
    );
    if (result.affected) {
      this.logger.warn(
        `Marked ${result.affected} interrupted leave balance import(s) as failed`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // History, preview rows, error report
  // ---------------------------------------------------------------------

  async listHistory(
    companyId: number,
    query: LeaveBalanceImportHistoryQueryDto,
    actor: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const [items, total] = await this.batchRepository.findAndCount({
      where: {
        company_id: companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(this.hrAccessService.hasCompanyScope(actor)
          ? {}
          : { uploaded_by_company_user_id: actor.companyMembershipId ?? -1 }),
      },
      relations: {
        uploaded_by_company_user: { user: true },
        confirmed_by_company_user: { user: true },
      },
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: items.map((item) => this.mapBatch(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async getBatch(
    companyId: number,
    batchRef: string,
    actor: AuthenticatedUser,
  ) {
    const batch = await this.findVisibleBatch(companyId, batchRef, actor);
    return this.mapBatchDetail(batch, actor);
  }

  async listRows(
    companyId: number,
    batchRef: string,
    query: LeaveBalanceImportRowsQueryDto,
    actor: AuthenticatedUser,
  ) {
    const batch = await this.findVisibleBatch(companyId, batchRef, actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const qb = this.rowRepository
      .createQueryBuilder('row')
      .where('row.batch_id = :batchId', { batchId: batch.id });

    switch (query.status ?? LeaveBalanceImportRowFilterEnum.ALL) {
      case LeaveBalanceImportRowFilterEnum.VALID:
      case LeaveBalanceImportRowFilterEnum.WARNING:
      case LeaveBalanceImportRowFilterEnum.INVALID:
        qb.andWhere('row.validation_status = :status', {
          status: query.status,
        });
        break;
      case LeaveBalanceImportRowFilterEnum.CHANGED:
        qb.andWhere('row.validation_status IN (:...statuses)', {
          statuses: CHANGE_STATUSES,
        });
        break;
      case LeaveBalanceImportRowFilterEnum.UNCHANGED:
        qb.andWhere('row.validation_status = :status', {
          status: ValidationStatus.NO_CHANGE,
        });
        break;
      case LeaveBalanceImportRowFilterEnum.CONFLICT:
        qb.andWhere('row.error_code IN (:...codes)', {
          codes: [
            IssueCode.CURRENT_BALANCE_MISMATCH,
            IssueCode.BALANCE_CHANGED_SINCE_VALIDATION,
          ],
        });
        break;
      case LeaveBalanceImportRowFilterEnum.IMPORTED:
      case LeaveBalanceImportRowFilterEnum.SKIPPED:
      case LeaveBalanceImportRowFilterEnum.FAILED:
        qb.andWhere('row.result_status = :result', { result: query.status });
        break;
      default:
        break;
    }
    if (typeof query.leave_type_id === 'number') {
      qb.andWhere('row.leave_type_id = :leaveTypeId', {
        leaveTypeId: query.leave_type_id,
      });
    }
    if (typeof query.branch_id === 'number') {
      qb.andWhere('row.branch_id = :branchId', { branchId: query.branch_id });
    }
    if (typeof query.department_id === 'number') {
      qb.andWhere('row.department_id = :departmentId', {
        departmentId: query.department_id,
      });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(row.employee_no ILIKE :search OR row.employee_name ILIKE :search)',
        { search: `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('row.row_number', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapRow(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async downloadReport(
    companyId: number,
    batchRef: string,
    actor: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const batch = await this.findVisibleBatch(companyId, batchRef, actor);
    const rows = await this.rowRepository.find({
      where: { batch_id: batch.id },
      order: { row_number: 'ASC' },
    });

    // Re-signed with the original template identity, so a corrected report
    // can be uploaded again and is validated exactly like the template.
    const token = signLeaveBalanceTemplateToken(
      {
        v: 1,
        tid: batch.template_id ?? randomUUID(),
        cid: batch.company_id,
        fy: batch.fiscal_year,
        gat: (batch.template_generated_at ?? batch.created_at).toISOString(),
      },
      this.getSigningSecret(),
    );
    const buffer = await buildLeaveBalanceReportWorkbook({
      token,
      generatedAt: new Date(),
      summary: [
        ['Import Batch ID', batch.batch_ref],
        ['Status', this.describeStatus(batch.status)],
        ['Leave year', batch.fiscal_year],
        ['File name', batch.original_file_name],
        ['Uploaded at', batch.created_at.toISOString()],
        ['Import mode', batch.import_mode ?? 'Not confirmed'],
        ['Total Employee + Leave Type records', batch.total_rows],
        ['Balances changed (valid)', batch.valid_rows],
        ['Warnings', batch.warning_rows],
        ['Invalid', batch.invalid_rows],
        ['No change', batch.no_change_rows],
        ['Imported', batch.imported_rows],
        ['Failed', batch.failed_rows],
        ['Skipped', batch.skipped_rows],
        [
          'How to correct',
          'Fix the rows marked INVALID or FAILED in the Leave Balances sheet and upload this workbook again. For balance mismatches, download a new template so the current balances are up to date.',
        ],
        ...(batch.failure_reason
          ? ([['Failure reason', batch.failure_reason]] as Array<
              [string, string]
            >)
          : []),
      ],
      rows: rows.map((row) => ({
        rowNumber: row.row_number,
        rawData: row.raw_data,
        databaseCurrentBalance: row.db_current_balance,
        adjustment: row.adjustment_days,
        validationStatus: row.validation_status,
        resultStatus: row.result_status,
        errorCode: row.error_code,
        errorDescription: row.message,
        allIssues: (row.issues ?? [])
          .filter((item) => item.severity !== 'info')
          .map((item) => `${item.code}: ${item.message}`)
          .join(' | '),
      })),
    });

    return {
      buffer,
      fileName: `leave-balance-import-${batch.batch_ref}-report.xlsx`,
    };
  }

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  private async loadValidationContext(
    companyId: number,
    fiscalYear: string,
    rows: Array<Record<string, string>>,
    actor: AuthenticatedUser,
    options: {
      manager?: EntityManager;
      lockBalances?: boolean;
      defaultReason: string | null;
    },
  ): Promise<ValidationContext> {
    const manager = options.manager;
    const employeeNumbers = this.uniqueLower(
      rows.map((row) => row.employee_no),
    );
    const leaveTypeCodes = this.uniqueLower(
      rows.map((row) => row.leave_type_code),
    );

    // Sequential on purpose: inside the import transaction every query shares
    // one connection, which must not run concurrent statements.
    const accessible =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    const employees = await this.findByLowerValues(
      manager?.getRepository(Employee) ?? this.employeeRepository,
      'employee_no',
      employeeNumbers,
      companyId,
      {
        primary_branch: true,
        primary_department: true,
        primary_position: true,
      },
    );
    const leaveTypes = await this.findByLowerValues(
      manager?.getRepository(LeaveType) ?? this.leaveTypeRepository,
      'code',
      leaveTypeCodes,
      companyId,
    );
    const policies = await this.leaveBalanceService.findActivePolicies(
      companyId,
      manager,
    );

    // Defence in depth: never trust a lookup to have applied the tenant filter.
    const companyEmployees = employees.filter(
      (employee) => employee.company_id === companyId,
    );
    const companyLeaveTypes = leaveTypes.filter(
      (leaveType) => leaveType.company_id === companyId,
    );
    const employeesByNumber = this.groupByLower(
      companyEmployees,
      (employee) => employee.employee_no,
    );
    const leaveTypesByCode = this.groupByLower(
      companyLeaveTypes,
      (leaveType) => leaveType.code,
    );
    const balancesByKey = await this.loadBalances(
      companyEmployees.map((employee) => employee.id),
      companyLeaveTypes.map((leaveType) => leaveType.id),
      fiscalYear,
      manager,
      options.lockBalances ?? false,
    );

    return {
      companyId,
      fiscalYear,
      actor,
      accessibleEmployeeIds: accessible === null ? null : new Set(accessible),
      employeesByNumber,
      leaveTypesByCode,
      balancesByKey,
      policies,
      defaultReason: options.defaultReason,
    };
  }

  private evaluateRow(
    parsed: ParsedLeaveBalanceRow,
    context: ValidationContext,
    duplicateOf: number[] | null,
  ): RowEvaluation {
    const raw = parsed.values;
    const evaluation: RowEvaluation = {
      rowNumber: parsed.rowNumber,
      raw,
      employeeNo: (raw.employee_no ?? '').trim(),
      leaveTypeCode: (raw.leave_type_code ?? '').trim(),
      employee: null,
      leaveType: null,
      balance: null,
      uploadedCurrentCents: null,
      dbCurrentCents: null,
      newBalanceCents: null,
      adjustmentCents: null,
      reason: null,
      issues: [],
      status: ValidationStatus.VALID,
    };
    const add = (
      code: IssueCode,
      severity: LeaveBalanceImportRowIssue['severity'],
      field: string | null,
      message: string,
    ) => evaluation.issues.push(this.issue(code, severity, field, message));
    const hasNewBalance = Boolean((raw.new_balance ?? '').trim());

    if (duplicateOf) {
      add(
        IssueCode.DUPLICATE_EMPLOYEE_LEAVE_TYPE,
        'error',
        'leave_type_code',
        `${evaluation.employeeNo} / ${evaluation.leaveTypeCode} appears more than once in the file (also row ${duplicateOf.join(', ')}). Keep a single row per employee and leave type.`,
      );
    }

    // --- Employee -------------------------------------------------------
    const employeeCandidates = evaluation.employeeNo
      ? (context.employeesByNumber.get(evaluation.employeeNo.toLowerCase()) ??
        [])
      : [];
    const employee =
      employeeCandidates.length === 1 ? employeeCandidates[0] : null;
    const canAccess =
      employee !== null &&
      (context.accessibleEmployeeIds === null ||
        context.accessibleEmployeeIds.has(employee.id));
    if (canAccess) {
      evaluation.employee = employee;
    }

    // --- Leave type -----------------------------------------------------
    const typeCandidates = evaluation.leaveTypeCode
      ? (context.leaveTypesByCode.get(evaluation.leaveTypeCode.toLowerCase()) ??
        [])
      : [];
    evaluation.leaveType =
      typeCandidates.length === 1 ? typeCandidates[0] : null;

    if (evaluation.employee && evaluation.leaveType) {
      evaluation.balance =
        context.balancesByKey.get(
          this.balanceKey(evaluation.employee.id, evaluation.leaveType.id),
        ) ?? null;
      if (evaluation.balance) {
        evaluation.dbCurrentCents = toLeaveBalanceCents(
          calculateAvailableLeaveDays(evaluation.balance),
        );
      }
    }

    // A blank New Leave Balance means "leave this balance alone": it cannot
    // block the import, even if the reference data has since changed.
    if (!hasNewBalance && !duplicateOf) {
      const current = parseLeaveBalanceDecimal(raw.current_balance ?? '');
      if (current.kind === 'value') {
        evaluation.uploadedCurrentCents = toLeaveBalanceCents(current.value);
      }
      add(
        IssueCode.NO_NEW_BALANCE,
        'info',
        'new_balance',
        'No new balance entered; this balance will not change.',
      );
      evaluation.status = ValidationStatus.NO_CHANGE;
      return evaluation;
    }

    if (!evaluation.employeeNo) {
      add(
        IssueCode.REQUIRED_FIELD_MISSING,
        'error',
        'employee_no',
        'Employee Number is required.',
      );
    } else if (!employeeCandidates.length) {
      add(
        IssueCode.EMPLOYEE_NOT_FOUND,
        'error',
        'employee_no',
        `No employee with number "${evaluation.employeeNo}" exists in this company.`,
      );
    } else if (employeeCandidates.length > 1) {
      add(
        IssueCode.EMPLOYEE_DATA_MISMATCH,
        'error',
        'employee_no',
        `Employee number "${evaluation.employeeNo}" matches more than one employee record. Contact your administrator.`,
      );
    } else if (!canAccess) {
      add(
        IssueCode.EMPLOYEE_ACCESS_DENIED,
        'error',
        'employee_no',
        `You are not authorized to manage leave balances for employee ${evaluation.employeeNo}.`,
      );
    } else {
      this.validateEmployee(evaluation, employee, context, add);
    }

    if (!evaluation.leaveTypeCode) {
      add(
        IssueCode.REQUIRED_FIELD_MISSING,
        'error',
        'leave_type_code',
        'Leave Type Code is required.',
      );
    } else if (!typeCandidates.length) {
      add(
        IssueCode.LEAVE_TYPE_NOT_FOUND,
        'error',
        'leave_type_code',
        `No leave type with code "${evaluation.leaveTypeCode}" exists in this company.`,
      );
    } else if (typeCandidates.length > 1) {
      add(
        IssueCode.LEAVE_TYPE_MISMATCH,
        'error',
        'leave_type_code',
        `Leave type code "${evaluation.leaveTypeCode}" matches more than one leave type.`,
      );
    } else {
      this.validateLeaveType(evaluation, evaluation.leaveType!, add);
    }

    const leaveYear = (raw.leave_year ?? '').trim();
    if (leaveYear !== context.fiscalYear) {
      add(
        IssueCode.LEAVE_YEAR_MISMATCH,
        'error',
        'leave_year',
        `Leave year "${leaveYear || '(blank)'}" does not match this template's leave year ${context.fiscalYear}.`,
      );
    }

    if (evaluation.employee && evaluation.leaveType && !evaluation.balance) {
      add(
        IssueCode.BALANCE_NOT_FOUND,
        'error',
        'leave_type_code',
        `No ${context.fiscalYear} ${evaluation.leaveType.code} balance exists for ${evaluation.employee.employee_no}. Download a new template.`,
      );
    }

    // --- Balances -------------------------------------------------------
    const current = parseLeaveBalanceDecimal(raw.current_balance ?? '');
    if (current.kind === 'empty') {
      add(
        IssueCode.REQUIRED_FIELD_MISSING,
        'error',
        'current_balance',
        'Current Leave Balance is required.',
      );
    } else if (current.kind !== 'value') {
      add(
        IssueCode.INVALID_CURRENT_BALANCE,
        'error',
        'current_balance',
        `Current Leave Balance "${raw.current_balance}" is not a valid number of days.`,
      );
    } else {
      evaluation.uploadedCurrentCents = toLeaveBalanceCents(current.value);
    }

    // An empty value only reaches this point on duplicate rows, which are
    // already rejected, so it needs no second error.
    const next = parseLeaveBalanceDecimal(raw.new_balance ?? '');
    if (next.kind === 'invalid') {
      add(
        IssueCode.INVALID_NEW_BALANCE,
        'error',
        'new_balance',
        `New Leave Balance "${raw.new_balance}" is not a valid number of days.`,
      );
    } else if (next.kind === 'precision') {
      add(
        IssueCode.INVALID_NEW_BALANCE,
        'error',
        'new_balance',
        `New Leave Balance "${raw.new_balance}" has more than two decimal places.`,
      );
    } else if (
      next.kind === 'value' &&
      Math.abs(next.value) > LEAVE_BALANCE_MAX_ABSOLUTE_DAYS
    ) {
      add(
        IssueCode.INVALID_NEW_BALANCE,
        'error',
        'new_balance',
        `New Leave Balance must be between -${LEAVE_BALANCE_MAX_ABSOLUTE_DAYS} and ${LEAVE_BALANCE_MAX_ABSOLUTE_DAYS} days.`,
      );
    } else if (next.kind === 'value') {
      evaluation.newBalanceCents = toLeaveBalanceCents(next.value);
    }

    let balanceMismatch = false;
    if (
      evaluation.uploadedCurrentCents !== null &&
      evaluation.dbCurrentCents !== null
    ) {
      if (evaluation.uploadedCurrentCents !== evaluation.dbCurrentCents) {
        balanceMismatch = true;
        add(
          IssueCode.CURRENT_BALANCE_MISMATCH,
          'error',
          'current_balance',
          `Template balance is ${this.formatDays(evaluation.uploadedCurrentCents)} days, but the employee's current balance is ${this.formatDays(evaluation.dbCurrentCents)} days. Download a new template and re-enter this change.`,
        );
      } else {
        const templateVersion = Number((raw.balance_version ?? '').trim());
        if (
          Number.isInteger(templateVersion) &&
          templateVersion > 0 &&
          evaluation.balance &&
          (evaluation.balance.version ?? 1) !== templateVersion
        ) {
          add(
            IssueCode.TEMPLATE_OUTDATED,
            'warning',
            'current_balance',
            `Leave activity was recorded for this balance after the template was generated. The available balance is still ${this.formatDays(evaluation.dbCurrentCents)} days, so the adjustment is calculated from that.`,
          );
        }
      }
    }

    if (
      evaluation.newBalanceCents !== null &&
      evaluation.employee &&
      evaluation.leaveType
    ) {
      const assignment = this.leaveBalanceService.selectPolicyAssignment(
        context.policies,
        evaluation.employee,
        evaluation.leaveType.id,
      );
      if (
        evaluation.newBalanceCents < 0 &&
        !assignment?.policy.allow_negative_balance
      ) {
        add(
          IssueCode.NEGATIVE_BALANCE_NOT_ALLOWED,
          'error',
          'new_balance',
          `A negative balance (${this.formatDays(evaluation.newBalanceCents)} days) is not allowed by the applicable leave policy.`,
        );
      }
      const maximumAccumulation = this.leaveBalanceService.toNumber(
        assignment?.policyType.maximum_accumulation_days ??
          assignment?.policy.maximum_accumulation_days,
      );
      if (
        maximumAccumulation > 0 &&
        evaluation.newBalanceCents > toLeaveBalanceCents(maximumAccumulation)
      ) {
        add(
          IssueCode.EXCEEDS_MAXIMUM_ACCUMULATION,
          'warning',
          'new_balance',
          `New balance of ${this.formatDays(evaluation.newBalanceCents)} days exceeds the policy's maximum accumulation of ${this.formatDays(toLeaveBalanceCents(maximumAccumulation))} days.`,
        );
      }
    }

    if (
      evaluation.newBalanceCents !== null &&
      evaluation.dbCurrentCents !== null &&
      !balanceMismatch
    ) {
      evaluation.adjustmentCents =
        evaluation.newBalanceCents - evaluation.dbCurrentCents;
    }
    const unchanged = evaluation.adjustmentCents === 0;

    const rowReason = this.sanitizeReason(raw.reason);
    evaluation.reason = rowReason ?? context.defaultReason;
    if (evaluation.newBalanceCents !== null && !unchanged) {
      if (!evaluation.reason) {
        add(
          IssueCode.REQUIRED_FIELD_MISSING,
          'error',
          'reason',
          'An adjustment reason is required. Enter it in Adjustment Reason / Remarks or provide a default reason when uploading.',
        );
      } else if (evaluation.reason.length > LEAVE_BALANCE_REASON_MAX_LENGTH) {
        add(
          IssueCode.INVALID_REASON,
          'error',
          'reason',
          `Adjustment reason cannot exceed ${LEAVE_BALANCE_REASON_MAX_LENGTH} characters.`,
        );
      }
    }

    if (evaluation.issues.some((item) => item.severity === 'error')) {
      evaluation.status = ValidationStatus.INVALID;
    } else if (unchanged) {
      add(
        IssueCode.UNCHANGED_BALANCE,
        'info',
        'new_balance',
        'New balance equals the current balance; no adjustment will be made.',
      );
      evaluation.status = ValidationStatus.NO_CHANGE;
    } else if (evaluation.issues.some((item) => item.severity === 'warning')) {
      evaluation.status = ValidationStatus.WARNING;
    } else {
      evaluation.status = ValidationStatus.VALID;
    }
    return evaluation;
  }

  private validateEmployee(
    evaluation: RowEvaluation,
    employee: Employee,
    context: ValidationContext,
    add: (
      code: IssueCode,
      severity: LeaveBalanceImportRowIssue['severity'],
      field: string | null,
      message: string,
    ) => void,
  ): void {
    const raw = evaluation.raw;
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      add(
        IssueCode.EMPLOYEE_INACTIVE,
        'error',
        'employee_no',
        `Employee ${employee.employee_no} is ${employee.employment_status}; only active employees' balances can be adjusted.`,
      );
    }
    const employeeRef = (raw.employee_ref ?? '').trim();
    if (employeeRef && employeeRef !== String(employee.id)) {
      add(
        IssueCode.EMPLOYEE_DATA_MISMATCH,
        'error',
        'employee_no',
        `This row was generated for a different employee than ${employee.employee_no}. The Employee Number may have been edited.`,
      );
    }
    const uploadedName = [raw.first_name, raw.middle_name, raw.last_name];
    const actualName = [
      employee.first_name,
      employee.middle_name,
      employee.last_name,
    ];
    if (
      uploadedName.some(
        (part, index) =>
          this.normalizeText(part) !== this.normalizeText(actualName[index]),
      )
    ) {
      add(
        IssueCode.EMPLOYEE_DATA_MISMATCH,
        'error',
        'first_name',
        `The name in the file ("${this.joinName(uploadedName)}") does not match employee ${employee.employee_no} ("${this.joinName(actualName)}").`,
      );
    }
    const organisation: Array<[IssueCode, string, string, string | undefined]> =
      [
        [
          IssueCode.BRANCH_MISMATCH,
          'branch',
          'branch',
          employee.primary_branch?.name,
        ],
        [
          IssueCode.DEPARTMENT_MISMATCH,
          'department',
          'department',
          employee.primary_department?.name,
        ],
        [
          IssueCode.POSITION_MISMATCH,
          'position',
          'position',
          employee.primary_position?.name,
        ],
      ];
    for (const [code, field, label, actual] of organisation) {
      if (this.normalizeText(raw[field]) !== this.normalizeText(actual)) {
        add(
          code,
          'warning',
          field,
          `The template shows ${label} "${raw[field] || '(blank)'}", but ${employee.employee_no} is now in "${actual || '(none)'}". The balance can still be adjusted.`,
        );
      }
    }
    if (context.actor.employeeId && context.actor.employeeId === employee.id) {
      add(
        IssueCode.SELF_ADJUSTMENT,
        'warning',
        'employee_no',
        'You are adjusting your own leave balance.',
      );
    }
  }

  private validateLeaveType(
    evaluation: RowEvaluation,
    leaveType: LeaveType,
    add: (
      code: IssueCode,
      severity: LeaveBalanceImportRowIssue['severity'],
      field: string | null,
      message: string,
    ) => void,
  ): void {
    const raw = evaluation.raw;
    if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE) {
      add(
        IssueCode.LEAVE_TYPE_INACTIVE,
        'error',
        'leave_type_code',
        `Leave type ${leaveType.code} is inactive.`,
      );
    }
    const leaveTypeRef = (raw.leave_type_ref ?? '').trim();
    if (leaveTypeRef && leaveTypeRef !== String(leaveType.id)) {
      add(
        IssueCode.LEAVE_TYPE_MISMATCH,
        'error',
        'leave_type_code',
        `This row was generated for a different leave type than ${leaveType.code}. The Leave Type Code may have been edited.`,
      );
    }
    if (
      this.normalizeText(raw.leave_type_name) !==
      this.normalizeText(leaveType.name)
    ) {
      add(
        IssueCode.LEAVE_TYPE_NAME_MISMATCH,
        'warning',
        'leave_type_name',
        `The template shows leave type "${raw.leave_type_name || '(blank)'}", but ${leaveType.code} is now named "${leaveType.name}".`,
      );
    }
    if (
      evaluation.employee &&
      !isEmployeeEligibleForLeaveType(evaluation.employee, leaveType)
    ) {
      add(
        IssueCode.LEAVE_TYPE_NOT_ELIGIBLE,
        'error',
        'leave_type_code',
        `${leaveType.name} is restricted to ${leaveType.gender_restriction} employees, so ${evaluation.employee.employee_no} is not eligible.`,
      );
    }
  }

  private findDuplicateRows(
    rows: ParsedLeaveBalanceRow[],
  ): Map<number, number[]> {
    const groups = new Map<string, ParsedLeaveBalanceRow[]>();
    for (const row of rows) {
      const employeeNo = row.values.employee_no.trim().toLowerCase();
      const code = row.values.leave_type_code.trim().toLowerCase();
      if (!employeeNo || !code) {
        continue;
      }
      const key = `${employeeNo}\u0000${code}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const duplicates = new Map<number, number[]>();
    groups.forEach((group) => {
      if (
        group.length > 1 &&
        group.some((row) => row.values.new_balance.trim())
      ) {
        group.forEach((row) =>
          duplicates.set(
            row.rowNumber,
            group
              .filter((other) => other.rowNumber !== row.rowNumber)
              .map((other) => other.rowNumber),
          ),
        );
      }
    });
    return duplicates;
  }

  private toRowEntity(
    batchId: number,
    evaluation: RowEvaluation,
  ): Partial<LeaveBalanceImportRow> {
    const employee = evaluation.employee;
    const primary =
      evaluation.issues.find((item) => item.severity === 'error') ??
      evaluation.issues.find((item) => item.severity === 'warning') ??
      null;
    return {
      batch_id: batchId,
      row_number: evaluation.rowNumber,
      employee_no: this.truncate(evaluation.employeeNo, 100),
      employee_name: this.truncate(
        employee
          ? this.joinName([
              employee.first_name,
              employee.middle_name,
              employee.last_name,
            ])
          : this.joinName([
              evaluation.raw.first_name,
              evaluation.raw.middle_name,
              evaluation.raw.last_name,
            ]),
        255,
      ),
      leave_type_code: this.truncate(evaluation.leaveTypeCode, 50),
      leave_type_name: this.truncate(
        evaluation.leaveType?.name ?? evaluation.raw.leave_type_name,
        120,
      ),
      branch_name: this.truncate(
        employee
          ? (employee.primary_branch?.name ?? '')
          : evaluation.raw.branch,
        150,
      ),
      department_name: this.truncate(
        employee
          ? (employee.primary_department?.name ?? '')
          : evaluation.raw.department,
        150,
      ),
      employee_id: employee?.id ?? null,
      leave_type_id: evaluation.leaveType?.id ?? null,
      leave_balance_id: evaluation.balance?.id ?? null,
      branch_id: employee?.primary_branch_id ?? null,
      department_id: employee?.primary_department_id ?? null,
      raw_data: evaluation.raw,
      uploaded_current_balance: this.formatNullableDecimal(
        evaluation.uploadedCurrentCents,
      ),
      db_current_balance: this.formatNullableDecimal(evaluation.dbCurrentCents),
      new_balance: this.formatNullableDecimal(evaluation.newBalanceCents),
      adjustment_days: this.formatNullableDecimal(evaluation.adjustmentCents),
      balance_version: evaluation.balance?.version ?? null,
      reason: evaluation.reason,
      validation_status: evaluation.status,
      result_status: null,
      error_code: primary?.code ?? null,
      message:
        primary?.message ??
        evaluation.issues.find((item) => item.severity === 'info')?.message ??
        null,
      issues: evaluation.issues,
    };
  }

  private summarizeEvaluations(
    evaluations: RowEvaluation[],
  ): Partial<LeaveBalanceImportBatch> {
    const count = (status: ValidationStatus) =>
      evaluations.filter((item) => item.status === status).length;
    const changed = evaluations.filter((item) =>
      CHANGE_STATUSES.includes(item.status),
    );
    const issueCounts: Record<string, number> = {};
    evaluations.forEach((item) =>
      item.issues
        .filter((entry) => entry.severity !== 'info')
        .forEach((entry) => {
          issueCounts[entry.code] = (issueCounts[entry.code] ?? 0) + 1;
        }),
    );
    const increase = changed.reduce(
      (sum, item) => sum + Math.max(0, item.adjustmentCents ?? 0),
      0,
    );
    const decrease = changed.reduce(
      (sum, item) => sum + Math.min(0, item.adjustmentCents ?? 0),
      0,
    );
    const facetMap = <T>(entries: Array<[string, T] | null>) =>
      Array.from(
        new Map(
          entries.filter((entry): entry is [string, T] => entry !== null),
        ).values(),
      );

    return {
      valid_rows: count(ValidationStatus.VALID),
      warning_rows: count(ValidationStatus.WARNING),
      invalid_rows: count(ValidationStatus.INVALID),
      no_change_rows: count(ValidationStatus.NO_CHANGE),
      total_employees: new Set(
        evaluations
          .map((item) => item.employeeNo.toLowerCase())
          .filter(Boolean),
      ).size,
      employees_affected: new Set(changed.map((item) => item.employee?.id))
        .size,
      summary: {
        issue_counts: issueCounts,
        total_increase_days: this.formatDecimal(increase),
        total_decrease_days: this.formatDecimal(decrease),
        net_adjustment_days: this.formatDecimal(increase + decrease),
        facets: {
          leave_types: facetMap(
            evaluations.map((item) =>
              item.leaveType
                ? [
                    String(item.leaveType.id),
                    {
                      id: item.leaveType.id,
                      code: item.leaveType.code,
                      name: item.leaveType.name,
                    },
                  ]
                : null,
            ),
          ),
          branches: facetMap(
            evaluations.map((item) =>
              item.employee?.primary_branch
                ? [
                    String(item.employee.primary_branch.id),
                    {
                      id: item.employee.primary_branch.id,
                      name: item.employee.primary_branch.name,
                    },
                  ]
                : null,
            ),
          ),
          departments: facetMap(
            evaluations.map((item) =>
              item.employee?.primary_department
                ? [
                    String(item.employee.primary_department.id),
                    {
                      id: item.employee.primary_department.id,
                      name: item.employee.primary_department.name,
                    },
                  ]
                : null,
            ),
          ),
        },
      },
    };
  }

  private resolveValidatedStatus(batch: LeaveBalanceImportBatch): BatchStatus {
    if (batch.invalid_rows > 0) {
      return BatchStatus.HAS_ERRORS;
    }
    return batch.valid_rows + batch.warning_rows > 0
      ? BatchStatus.READY_FOR_IMPORT
      : BatchStatus.VALIDATED;
  }

  // ---------------------------------------------------------------------
  // Data access helpers
  // ---------------------------------------------------------------------

  private async findTemplateEmployees(
    companyId: number,
    query: LeaveBalanceImportTemplateQueryDto,
    accessibleEmployeeIds: number[] | null,
  ): Promise<Employee[]> {
    if (accessibleEmployeeIds !== null && !accessibleEmployeeIds.length) {
      return [];
    }
    const baseWhere = {
      company_id: companyId,
      employment_status: EmploymentStatusEnum.ACTIVE,
      ...(typeof query.branch_id === 'number'
        ? { primary_branch_id: query.branch_id }
        : {}),
      ...(typeof query.department_id === 'number'
        ? { primary_department_id: query.department_id }
        : {}),
    };
    const relations = {
      primary_branch: true,
      primary_department: true,
      primary_position: true,
    };
    if (accessibleEmployeeIds === null) {
      return this.employeeRepository.find({
        where: baseWhere,
        relations,
        order: { employee_no: 'ASC' },
      });
    }

    const employees: Employee[] = [];
    for (const ids of this.chunk(accessibleEmployeeIds)) {
      employees.push(
        ...(await this.employeeRepository.find({
          where: { ...baseWhere, id: In(ids) },
          relations,
        })),
      );
    }
    return employees
      .filter((employee) => employee.company_id === companyId)
      .sort((left, right) => left.employee_no.localeCompare(right.employee_no));
  }

  private async loadBalances(
    employeeIds: number[],
    leaveTypeIds: number[],
    fiscalYear: string,
    manager?: EntityManager,
    lock = false,
  ): Promise<Map<string, LeaveBalance>> {
    const balances = new Map<string, LeaveBalance>();
    if (!employeeIds.length || !leaveTypeIds.length) {
      return balances;
    }
    const repository =
      manager?.getRepository(LeaveBalance) ?? this.leaveBalanceRepository;
    for (const ids of this.chunk(Array.from(new Set(employeeIds)))) {
      // Locks are taken in primary-key order to avoid deadlocks with other
      // writers locking several balances.
      const rows = await repository.find({
        where: {
          employee_id: In(ids),
          leave_type_id: In(Array.from(new Set(leaveTypeIds))),
          fiscal_year: fiscalYear,
        },
        order: { id: 'ASC' },
        ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      rows.forEach((balance) =>
        balances.set(
          this.balanceKey(balance.employee_id, balance.leave_type_id),
          balance,
        ),
      );
    }
    return balances;
  }

  private async findByLowerValues<T extends { company_id: number }>(
    repository: Repository<T>,
    column: 'employee_no' | 'code',
    values: string[],
    companyId: number,
    relations?: FindOptionsRelations<T>,
  ): Promise<T[]> {
    const results: T[] = [];
    for (const chunk of this.chunk(values)) {
      results.push(
        ...(await repository.find({
          where: {
            company_id: companyId,
            [column]: Raw((alias) => `LOWER(${alias}) IN (:...values)`, {
              values: chunk,
            }),
          } as FindOptionsWhere<T>,
          ...(relations ? { relations } : {}),
        })),
      );
    }
    return results;
  }

  private async findVisibleBatch(
    companyId: number,
    batchRef: string,
    actor: AuthenticatedUser,
  ): Promise<LeaveBalanceImportBatch> {
    const batch = await this.batchRepository.findOne({
      where: { company_id: companyId, batch_ref: batchRef },
      relations: {
        uploaded_by_company_user: { user: true },
        confirmed_by_company_user: { user: true },
      },
    });
    if (!batch || !this.canViewBatch(batch, actor)) {
      throw new NotFoundException('Leave balance import batch not found');
    }
    return batch;
  }

  /** Company-wide HR sees every batch; scoped users see the batches they uploaded. */
  private canViewBatch(
    batch: LeaveBalanceImportBatch,
    actor: AuthenticatedUser,
  ): boolean {
    return (
      this.hrAccessService.hasCompanyScope(actor) ||
      (typeof actor.companyMembershipId === 'number' &&
        batch.uploaded_by_company_user_id === actor.companyMembershipId)
    );
  }

  private assertSupportedFile(
    file: UploadedWorkbook | undefined,
  ): asserts file is UploadedWorkbook {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Select the completed leave balance template (.xlsx) to upload.',
      );
    }
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException(
        'Only .xlsx files are supported. Save the template as an Excel Workbook (.xlsx).',
      );
    }
    if (file.mimetype && !XLSX_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'The uploaded file is not an Excel workbook.',
      );
    }
    if (file.size > this.getMaxFileSizeBytes()) {
      throw new BadRequestException(
        `The file exceeds the ${Math.round(this.getMaxFileSizeBytes() / (1024 * 1024))} MB limit.`,
      );
    }
    if (!ZIP_MAGIC.every((byte, index) => file.buffer[index] === byte)) {
      throw new BadRequestException(
        'The uploaded file is not a valid .xlsx workbook or is corrupted.',
      );
    }
  }

  private async logRejectedUpload(
    companyId: number,
    file: UploadedWorkbook,
    actor: AuthenticatedUser,
    code: string,
    message: string,
  ): Promise<void> {
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_balance_import.rejected',
      entity_name: 'leave_balance_import_batch',
      actor,
      payload: {
        code,
        message,
        file_name: this.safeFileName(file.originalname),
        file_size: file.size,
        file_checksum: createHash('sha256').update(file.buffer).digest('hex'),
      },
    });
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private mapBatch(batch: LeaveBalanceImportBatch) {
    return {
      batch_id: batch.batch_ref,
      status: batch.status,
      import_mode: batch.import_mode,
      fiscal_year: batch.fiscal_year,
      original_file_name: batch.original_file_name,
      file_size: batch.file_size,
      template_id: batch.template_id,
      template_version: batch.template_version,
      template_generated_at: batch.template_generated_at,
      default_reason: batch.default_reason,
      total_rows: batch.total_rows,
      valid_rows: batch.valid_rows,
      warning_rows: batch.warning_rows,
      invalid_rows: batch.invalid_rows,
      no_change_rows: batch.no_change_rows,
      changed_rows: batch.valid_rows + batch.warning_rows,
      imported_rows: batch.imported_rows,
      skipped_rows: batch.skipped_rows,
      failed_rows: batch.failed_rows,
      processed_rows: batch.processed_rows,
      total_employees: batch.total_employees,
      employees_affected: batch.employees_affected,
      failure_reason: batch.failure_reason,
      uploaded_at: batch.created_at,
      uploaded_by: this.mapCompanyUser(batch.uploaded_by_company_user),
      confirmed_at: batch.confirmed_at,
      confirmed_by: this.mapCompanyUser(batch.confirmed_by_company_user),
      started_at: batch.started_at,
      completed_at: batch.completed_at,
      cancelled_at: batch.cancelled_at,
    };
  }

  private mapBatchDetail(
    batch: LeaveBalanceImportBatch,
    actor: AuthenticatedUser,
  ) {
    const changedRows = batch.valid_rows + batch.warning_rows;
    const canImport = hasPermission(
      actor.permissions,
      LEAVE_BALANCE_BULK_IMPORT_PERMISSION,
    );
    const canImportValidRowsOnly = hasPermission(
      actor.permissions,
      LEAVE_BALANCE_BULK_IMPORT_PARTIAL_PERMISSION,
    );
    return {
      ...this.mapBatch(batch),
      summary: batch.summary ?? {},
      actions: {
        can_confirm_strict:
          canImport &&
          batch.status === BatchStatus.READY_FOR_IMPORT &&
          changedRows > 0,
        can_confirm_valid_rows_only:
          canImport &&
          canImportValidRowsOnly &&
          CONFIRMABLE_STATUSES.includes(batch.status) &&
          changedRows > 0,
        can_cancel: canImport && CANCELLABLE_STATUSES.includes(batch.status),
        requires_warning_acknowledgement: batch.warning_rows > 0,
      },
    };
  }

  private mapRow(row: LeaveBalanceImportRow) {
    return {
      id: row.id,
      row_number: row.row_number,
      employee_no: row.employee_no,
      employee_name: row.employee_name,
      branch_name: row.branch_name,
      department_name: row.department_name,
      leave_type_code: row.leave_type_code,
      leave_type_name: row.leave_type_name,
      uploaded_current_balance: row.uploaded_current_balance,
      db_current_balance: row.db_current_balance,
      new_balance: row.new_balance,
      adjustment_days: row.adjustment_days,
      reason: row.reason,
      validation_status: row.validation_status,
      result_status: row.result_status,
      error_code: row.error_code,
      message: row.message,
      issues: row.issues ?? [],
      previous_balance_at_import: row.previous_balance_at_import,
      new_balance_at_import: row.new_balance_at_import,
      processed_at: row.processed_at,
    };
  }

  private mapCompanyUser(
    companyUser:
      | LeaveBalanceImportBatch['uploaded_by_company_user']
      | undefined,
  ) {
    const user = companyUser?.user;
    return user
      ? {
          id: user.id,
          name: [user.first_name, user.last_name].filter(Boolean).join(' '),
          email: user.email,
        }
      : null;
  }

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  private issue(
    code: IssueCode,
    severity: LeaveBalanceImportRowIssue['severity'],
    field: string | null,
    message: string,
  ): LeaveBalanceImportRowIssue {
    return { code, severity, field, message };
  }

  private balanceKey(employeeId: number, leaveTypeId: number): string {
    return `${employeeId}:${leaveTypeId}`;
  }

  private chunk<T>(values: T[]): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += QUERY_CHUNK_SIZE) {
      chunks.push(values.slice(index, index + QUERY_CHUNK_SIZE));
    }
    return chunks;
  }

  private uniqueLower(values: Array<string | undefined>): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => (value ?? '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  private groupByLower<T>(
    items: T[],
    read: (item: T) => string,
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    items.forEach((item) => {
      const key = read(item).trim().toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return groups;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private joinName(parts: Array<string | null | undefined>): string {
    return parts
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' ');
  }

  private sanitizeReason(value: string | null | undefined): string | null {
    const cleaned = (value ?? '').replace(CONTROL_CHARACTERS, ' ').trim();
    return cleaned ? cleaned.replace(/\s{2,}/g, ' ') : null;
  }

  private truncate(
    value: string | null | undefined,
    length: number,
  ): string | null {
    const text = (value ?? '').trim();
    return text ? text.slice(0, length) : null;
  }

  private safeFileName(value: string): string {
    return (value.split(/[\\/]/).pop() ?? 'upload.xlsx')
      .replace(CONTROL_CHARACTERS, '')
      .slice(0, 255);
  }

  private formatDecimal(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  private formatNullableDecimal(cents: number | null): string | null {
    return cents === null ? null : this.formatDecimal(cents);
  }

  private formatDays(cents: number): string {
    return String(cents / 100);
  }

  private formatDateStamp(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private describeStatus(status: BatchStatus): string {
    return status.toLowerCase().replace(/_/g, ' ');
  }

  private generateBatchRef(): string {
    return `LBI-${this.formatDateStamp(new Date())}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private getMaxRows(): number {
    const configured = Number(
      this.configService.get<string | number>('LEAVE_BALANCE_IMPORT_MAX_ROWS'),
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 10000;
  }

  private getMaxFileSizeBytes(): number {
    const configured = Number(
      this.configService.get<string | number>(
        'LEAVE_BALANCE_IMPORT_MAX_FILE_SIZE_BYTES',
      ),
    );
    return Number.isInteger(configured) && configured > 0
      ? configured
      : 10 * 1024 * 1024;
  }

  private getSigningSecret(): string {
    return (
      this.configService.get<string>('APP_KEY') ??
      this.configService.get<string>('JWT_ACCESS_SECRET') ??
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      'leave-balance-template-signing-fallback'
    );
  }
}
