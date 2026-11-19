import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollRun,
} from '../../payroll/entities/payroll-run.entities';
import {
  EmployeePayrollResultStatusEnum,
  PayrollRunStatusEnum,
} from '../../payroll/payroll.enums';
import { LeaveEncashmentRequest } from '../entities/leave-encashment-request.entity';
import { LeaveAuditService } from './leave-audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  emitLeaveLifecycle,
  encashmentNotification,
} from '../utils/leave-lifecycle-notify.util';

const PAID_RUN_STATUSES = [
  PayrollRunStatusEnum.PAID,
  PayrollRunStatusEnum.CLOSED,
];

/**
 * Keeps encashment payment status in step with payroll, without changing
 * payroll code: an encashment handed to payroll is PAID only once the
 * payslip line carrying it (source reference leave-encashment:<id>) sits in
 * a payroll run that is paid; it becomes REVERSED if payroll reverses it.
 */
@Injectable()
export class LeaveEncashmentPaymentSyncService {
  private readonly logger = new Logger(LeaveEncashmentPaymentSyncService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly leaveAuditService: LeaveAuditService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async runScheduled(): Promise<void> {
    try {
      await this.syncAll();
    } catch (error) {
      this.logger.error(
        'Leave encashment payment sync failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Syncs every company, or one when companyId is given. */
  async syncAll(companyId?: number) {
    const repository = this.dataSource.getRepository(LeaveEncashmentRequest);
    const items = await repository.find({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        status: 'approved',
        payment_status: In(['IN_PAYROLL', 'PAID']),
      },
      take: 500,
      order: { id: 'ASC' },
    });
    let paid = 0;
    let reversed = 0;
    for (const item of items) {
      const outcome = await this.syncOne(item);
      if (outcome === 'paid') paid += 1;
      if (outcome === 'reversed') reversed += 1;
    }
    return { checked: items.length, paid, reversed };
  }

  async syncOne(
    item: LeaveEncashmentRequest,
  ): Promise<'paid' | 'reversed' | 'unchanged'> {
    const lines = await this.dataSource
      .getRepository(EmployeePayrollLineItem)
      .find({
        where: {
          companyId: item.company_id,
          sourceReference: `leave-encashment:${item.id}`,
        },
        order: { id: 'DESC' },
      });
    const now = new Date();
    if (!lines.length) {
      await this.dataSource
        .getRepository(LeaveEncashmentRequest)
        .update({ id: item.id }, { payment_synced_at: now });
      return 'unchanged';
    }
    const runs = new Map(
      (
        await this.dataSource.getRepository(PayrollRun).find({
          where: { id: In(lines.map((line) => line.payrollRunId)) },
        })
      ).map((run) => [run.id, run]),
    );
    const results = new Map(
      (
        await this.dataSource.getRepository(EmployeePayrollResult).find({
          where: { id: In(lines.map((line) => line.employeePayrollResultId)) },
        })
      ).map((result) => [result.id, result]),
    );
    const evaluated = lines.map((line) => {
      const run = runs.get(line.payrollRunId);
      const result = results.get(line.employeePayrollResultId);
      const isReversed =
        run?.status === PayrollRunStatusEnum.REVERSED ||
        result?.status === EmployeePayrollResultStatusEnum.REVERSED;
      const isPaid =
        !isReversed &&
        ((run && PAID_RUN_STATUSES.includes(run.status)) ||
          result?.status === EmployeePayrollResultStatusEnum.PAID);
      return { line, run, result, isPaid, isReversed };
    });
    const paidLine = evaluated.find((entry) => entry.isPaid);
    const repository = this.dataSource.getRepository(LeaveEncashmentRequest);
    if (paidLine && item.payment_status !== 'PAID') {
      await repository.update(
        { id: item.id },
        {
          payment_status: 'PAID',
          paid_at: now,
          payment_reference: `payroll-run:${paidLine.line.payrollRunId}`,
          payment_confirmed_via: 'payroll',
          payroll_run_id: paidLine.line.payrollRunId,
          payroll_result_id: paidLine.line.employeePayrollResultId,
          payment_synced_at: now,
        },
      );
      await this.leaveAuditService.log({
        company_id: item.company_id,
        action: 'leave_encashment.paid_by_payroll',
        entity_name: 'leave_encashment_request',
        entity_id: item.id,
        payload: {
          payroll_run_id: paidLine.line.payrollRunId,
          payroll_result_id: paidLine.line.employeePayrollResultId,
          amount: paidLine.line.amount,
        },
      });
      emitLeaveLifecycle(
        this.eventEmitter,
        encashmentNotification('paid', item),
      );
      return 'paid';
    }
    if (
      item.payment_status === 'PAID' &&
      item.payment_confirmed_via === 'payroll' &&
      !paidLine &&
      evaluated.some((entry) => entry.isReversed)
    ) {
      await repository.update(
        { id: item.id },
        {
          payment_status: 'REVERSED',
          reversed_at: now,
          reversal_reason: 'Payroll reversed the payment',
          payment_synced_at: now,
        },
      );
      await this.leaveAuditService.log({
        company_id: item.company_id,
        action: 'leave_encashment.payment_reversed_by_payroll',
        entity_name: 'leave_encashment_request',
        entity_id: item.id,
        payload: { payroll_run_id: item.payroll_run_id },
      });
      emitLeaveLifecycle(
        this.eventEmitter,
        encashmentNotification('payment_failed', item),
      );
      return 'reversed';
    }
    await repository.update({ id: item.id }, { payment_synced_at: now });
    return 'unchanged';
  }
}
