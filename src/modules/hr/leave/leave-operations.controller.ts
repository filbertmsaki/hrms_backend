import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Equals, IsInt, IsOptional, Matches, Min } from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { DataSource } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveService } from './leave.service';
import { LeaveAllocationBackfillService } from './services/leave-allocation-backfill.service';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveConfigReadinessService } from './services/leave-config-readiness.service';
import { LeavePayrollReconciliationService } from './services/leave-payroll-reconciliation.service';

type Req = ExpressRequest & { user: AuthenticatedUser };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

class BackfillRangeDto {
  @IsOptional() @Matches(ISO) from?: string;
  @IsOptional() @Matches(ISO) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) employee_id?: number;
}

class BackfillApplyDto extends BackfillRangeDto {
  /** Typed confirmation for a data-changing operation. */
  @Equals('APPLY') confirm: string;
}

class BackfillRevertDto {
  @Equals('REVERT') confirm: string;
}

/**
 * Leave Operations: authorised administrators run the operational tools
 * that previously needed server/CLI access. Every mutating call needs the
 * leave_operations:execute permission and a typed confirmation, runs under
 * a company-scoped advisory lock (no overlapping runs), and is audited with
 * the administrator, parameters and result.
 */
@ApiTags('Leave operations')
@ApiBearerAuth('access-token')
@Controller('leave/operations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveOperationsController {
  private readonly readiness: LeaveConfigReadinessService;
  private readonly backfill: LeaveAllocationBackfillService;
  private readonly reconciliation: LeavePayrollReconciliationService;

  constructor(
    private readonly dataSource: DataSource,
    private readonly locks: PostgresAdvisoryLockService,
    private readonly audit: LeaveAuditService,
    private readonly leaveService: LeaveService,
  ) {
    this.readiness = new LeaveConfigReadinessService(dataSource);
    this.backfill = new LeaveAllocationBackfillService(dataSource);
    this.reconciliation = new LeavePayrollReconciliationService(dataSource);
  }

  private actorLabel(req: Req) {
    return `company-user:${req.user.companyMembershipId ?? 'unknown'}`;
  }

  private async exclusive<T>(req: Req, name: string, run: () => Promise<T>) {
    const outcome = await this.locks.runWithLock(
      `leave-operations:${name}:${req.user.companyId}`,
      run,
    );
    if (!outcome.acquired)
      throw new ConflictException(
        'This operation is already running for your company; try again when it finishes.',
      );
    return outcome.result as T;
  }

  // ------------------------------------------------------------ readiness
  @Get('readiness')
  @Permissions('leave_operations:read')
  @ApiOperation({ summary: 'Leave configuration readiness report' })
  readinessReport(@Req() req: Req) {
    return this.readiness.report(req.user.companyId!);
  }

  // ------------------------------------------------------------- backfill
  @Post('backfill/preview')
  @Permissions('leave_operations:read')
  @ApiOperation({
    summary: 'Dry run of the historical leave allocation backfill (no changes)',
  })
  async backfillPreview(@Req() req: Req, @Body() dto: BackfillRangeDto) {
    const plan = await this.backfill.plan(req.user.companyId!, {
      from: dto.from,
      to: dto.to,
    });
    if (!dto.employee_id) return plan;
    const candidates = plan.candidates.filter(
      (c) => c.employeeId === dto.employee_id,
    );
    return {
      ...plan,
      candidates,
      proposed: candidates.filter((c) => c.status === 'PROPOSED').length,
      needsReview: candidates.filter((c) => c.status === 'NEEDS_REVIEW').length,
    };
  }

  @Post('backfill/apply')
  @Permissions('leave_operations:execute')
  @ApiOperation({
    summary:
      'Apply the allocation backfill (one transaction, idempotent per request, revertible by batch)',
  })
  async backfillApply(@Req() req: Req, @Body() dto: BackfillApplyDto) {
    const companyId = req.user.companyId!;
    const result = await this.exclusive(req, 'backfill', async () => {
      let ids: number[] | undefined;
      if (dto.employee_id) {
        const plan = await this.backfill.plan(companyId, {
          from: dto.from,
          to: dto.to,
        });
        ids = plan.candidates
          .filter(
            (c) => c.employeeId === dto.employee_id && c.status === 'PROPOSED',
          )
          .map((c) => c.leaveRequestId);
        if (!ids.length) return { batchId: null, applied: 0, needsReview: 0 };
      }
      return this.backfill.apply(companyId, this.actorLabel(req), {
        from: dto.from,
        to: dto.to,
        ids,
      });
    });
    await this.audit.log({
      company_id: companyId,
      action: 'leave_operations.backfill_applied',
      entity_name: 'leave_allocation_backfill',
      entity_id: null,
      actor: req.user,
      payload: { parameters: { ...dto, confirm: undefined }, result },
    });
    return result;
  }

  @Get('backfill/batches')
  @Permissions('leave_operations:read')
  @ApiOperation({ summary: 'Backfill batches applied for this company' })
  backfillBatches(@Req() req: Req) {
    return this.dataSource.query(
      `SELECT batch_id, actor,
              count(*) FILTER (WHERE status = 'APPLIED')::int AS applied,
              count(*) FILTER (WHERE status = 'REVERTED')::int AS reverted,
              count(*) FILTER (WHERE status IN ('PROPOSED','NEEDS_REVIEW'))::int AS recorded_only,
              min(created_at) AS created_at, max(applied_at) AS applied_at,
              max(reverted_at) AS reverted_at
         FROM leave_allocation_backfill_entries
        WHERE company_id = $1
        GROUP BY batch_id, actor
        ORDER BY min(created_at) DESC
        LIMIT 100`,
      [req.user.companyId],
    );
  }

  @Post('backfill/batches/:batchId/revert')
  @Permissions('leave_operations:execute')
  @ApiOperation({ summary: 'Revert an applied backfill batch' })
  async backfillRevert(
    @Req() req: Req,
    @Param('batchId') batchId: string,
    @Body() dto: BackfillRevertDto,
  ) {
    const companyId = req.user.companyId!;
    // Validated by the DTO (must be "REVERT"); kept for the audit trail.
    const confirmation = dto.confirm;
    if (!/^[0-9a-f-]{36}$/i.test(batchId))
      throw new BadRequestException('Invalid batch id.');
    // The service reverts by batch id only; make sure it is this company's.
    const [owner] = await this.dataSource.query<
      Array<{ other: number; mine: number }>
    >(
      `SELECT count(*) FILTER (WHERE company_id <> $2)::int other,
              count(*) FILTER (WHERE company_id = $2)::int mine
         FROM leave_allocation_backfill_entries WHERE batch_id = $1`,
      [batchId, companyId],
    );
    if (!owner?.mine || owner.other)
      throw new NotFoundException('Backfill batch not found.');
    const result = await this.exclusive(req, 'backfill', () =>
      this.backfill.revert(batchId, this.actorLabel(req)),
    );
    await this.audit.log({
      company_id: companyId,
      action: 'leave_operations.backfill_reverted',
      entity_name: 'leave_allocation_backfill',
      entity_id: null,
      actor: req.user,
      payload: { batch_id: batchId, confirmation, result },
    });
    return result;
  }

  // ------------------------------------------------ payroll reconciliation
  @Get('payroll-reconciliation')
  @Permissions('leave_operations:read')
  @ApiOperation({
    summary:
      'Reconcile leave days, encashments and exit settlements with payroll',
  })
  async payrollReconciliation(
    @Req() req: Req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const companyId = req.user.companyId!;
    const today = new Date().toISOString().slice(0, 10);
    const start = from && ISO.test(from) ? from : `${today.slice(0, 4)}-01-01`;
    const end = to && ISO.test(to) ? to : today;
    if (start > end)
      throw new BadRequestException('"from" must be on or before "to".');
    const [leaveDays, encashments, exitSettlements] = await Promise.all([
      this.reconciliation.reconcile(companyId, start, end),
      this.reconciliation.reconcileEncashments(companyId, start, end),
      this.reconciliation.reconcileExitSettlements(companyId, start, end),
    ]);
    const count = (rows: Array<{ status: string }>) =>
      rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
    return {
      from: start,
      to: end,
      summary: {
        leave_days: count(leaveDays),
        encashments: count(encashments),
        exit_settlements: count(exitSettlements),
      },
      leave_days: leaveDays,
      encashments,
      exit_settlements: exitSettlements,
    };
  }

  @Post('encashments/retry-handoff')
  @Permissions('leave_operations:execute')
  @ApiOperation({
    summary:
      'Retry sending approved year-end encashments to payroll (as draft inputs)',
  })
  async retryHandoff(@Req() req: Req) {
    const companyId = req.user.companyId!;
    const result = await this.exclusive(req, 'encashment-handoff', () =>
      this.leaveService.retryPendingAutoHandOffs(companyId),
    );
    await this.audit.log({
      company_id: companyId,
      action: 'leave_operations.encashment_handoff_retried',
      entity_name: 'leave_encashment_request',
      entity_id: null,
      actor: req.user,
      payload: { result },
    });
    return result;
  }

  // ------------------------------------------------------------- history
  @Get('audit')
  @Permissions('leave_operations:read')
  @ApiOperation({ summary: 'Recent Leave Operations actions' })
  history(@Req() req: Req) {
    return this.dataSource.query(
      `SELECT id, action, payload, created_at, actor_company_user_id
         FROM leave_audit_logs
        WHERE company_id = $1 AND action LIKE 'leave_operations.%'
        ORDER BY id DESC LIMIT 50`,
      [req.user.companyId],
    );
  }
}
